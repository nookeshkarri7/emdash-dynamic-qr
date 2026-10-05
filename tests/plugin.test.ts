import { afterEach, describe, expect, it } from "vitest";

import { createPluginTestHost, type PluginTestHost } from "@emdash-cms/plugin-test";

import { classifyDevice, summarizeScans } from "../src/analytics/summarize.js";
import { renderQrPng } from "../src/qr/render.js";
import { DEFAULT_STYLE, isHexColor, isValidHttpUrl, normalizeSlug } from "../src/types.js";

let host: PluginTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	host = undefined;
});

describe("helpers", () => {
	it("normalizes slugs and validates urls/colors", () => {
		expect(normalizeSlug(" Hello World!! ")).toBe("hello-world");
		expect(isValidHttpUrl("https://example.com/x")).toBe(true);
		expect(isValidHttpUrl("ftp://example.com")).toBe(false);
		expect(isHexColor("#abc")).toBe(true);
		expect(isHexColor("#112233")).toBe(true);
		expect(isHexColor("red")).toBe(false);
	});

	it("renders a PNG QR payload", () => {
		const png = renderQrPng("https://example.com/go", { ...DEFAULT_STYLE, size: 128 });
		expect(png.byteLength).toBeGreaterThan(100);
		expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	});

	it("summarizes analytics by device and period", () => {
		expect(classifyDevice("Mozilla/5.0 (iPhone)")).toBe("mobile");
		const now = Date.parse("2026-09-29T12:00:00.000Z");
		const summary = summarizeScans(
			[
				{
					codeId: "1",
					slug: "a",
					createdAt: "2026-09-29T10:00:00.000Z",
					userAgent: "Mozilla/5.0 (iPhone)",
					referer: "https://news.example/path",
					ipHash: "abc",
					country: "IN",
					region: null,
					city: "Hyderabad",
				},
				{
					codeId: "1",
					slug: "a",
					createdAt: "2026-09-20T10:00:00.000Z",
					userAgent: "Mozilla/5.0 (Windows NT)",
					referer: null,
					ipHash: "def",
					country: "US",
					region: null,
					city: null,
				},
			],
			now,
		);
		expect(summary.total).toBe(2);
		expect(summary.last24h).toBe(1);
		expect(summary.byDevice.some((d) => d.name === "mobile")).toBe(true);
		expect(summary.timeseries.length).toBe(30);
	});
});

describe("dynamic-qr plugin", () => {
	it("serves codes admin page with create tab", async () => {
		host = await createPluginTestHost();
		const result = (await host.invokeRoute("admin", {
			type: "page_load",
			page: "/codes",
		})) as { blocks: Array<{ type: string }> };
		expect(result.blocks.some((b) => b.type === "header")).toBe(true);
		expect(result.blocks.some((b) => b.type === "tab")).toBe(true);
	});

	it("creates a QR code via admin form", async () => {
		host = await createPluginTestHost();
		const created = (await host.invokeRoute("admin", {
			type: "form_submit",
			action_id: "create_code",
			page: "/codes",
			values: {
				title: "Launch",
				slug: "launch",
				destination: "https://example.com/landing",
				fg: "#111111",
				bg: "#ffffff",
				ecc: "M",
				size: "256",
				margin: 2,
				preset: "custom",
			},
		})) as { toast?: { type: string }; blocks: Array<{ type: string }> };

		expect(created.toast?.type).toBe("success");
		expect(created.blocks.some((b) => b.type === "image" || b.type === "columns")).toBe(true);
		const rows = await host.storage("codes").list();
		expect(rows.length).toBe(1);
		expect((rows[0]!.data as { slug: string }).slug).toBe("launch");
	});

	it("saves settings", async () => {
		host = await createPluginTestHost();
		const result = (await host.invokeRoute("admin", {
			type: "form_submit",
			action_id: "save_settings",
			page: "/settings",
			values: {
				publicBaseUrl: "https://site.example",
				defaultFg: "#000000",
				defaultBg: "#ffffff",
				defaultEcc: "H",
			},
		})) as { toast?: { type: string } };
		expect(result.toast?.type).toBe("success");
	});

	it("redirects public go route and records a scan", async () => {
		host = await createPluginTestHost();
		await host.invokeRoute("admin", {
			type: "form_submit",
			action_id: "create_code",
			page: "/codes",
			values: {
				title: "Campaign",
				slug: "campaign",
				destination: "https://example.com/dest",
				fg: "#000000",
				bg: "#ffffff",
				ecc: "M",
				size: "128",
				margin: 2,
			},
		});

		const response = (await host.invokeRoute(
			"go",
			{ code: "campaign" },
			{
				method: "GET",
				meta: {
					ip: "1.2.3.4",
					userAgent: "TestAgent",
					referer: "https://ref.example",
					geo: { country: "IN", region: null, city: "Hyderabad" },
				},
			},
		)) as {
			status: number;
			headers: Array<[string, string]>;
		};

		expect(response.status).toBe(302);
		const location = response.headers.find(([k]) => k.toLowerCase() === "location")?.[1];
		expect(location).toBe("https://example.com/dest");

		const codeRows = await host.storage("codes").list();
		expect((codeRows[0]!.data as { scanCount: number }).scanCount).toBe(1);
		const scanRows = await host.storage("scans").list();
		expect(scanRows.length).toBe(1);
	});

	it("returns downloadable PNG from the public image route", async () => {
		host = await createPluginTestHost();
		await host.invokeRoute("admin", {
			type: "form_submit",
			action_id: "create_code",
			page: "/codes",
			values: {
				title: "Poster",
				slug: "poster",
				destination: "https://example.com/poster",
				fg: "#000000",
				bg: "#ffffff",
				ecc: "Q",
				size: "128",
				margin: 2,
			},
		});

		const response = (await host.invokeRoute(
			"image",
			{ code: "poster", download: "1", size: "256" },
			{ method: "GET" },
		)) as {
			status: number;
			headers: Array<[string, string]>;
			body: { kind: string; value: Uint8Array };
		};

		expect(response.status).toBe(200);
		expect(
			response.headers.some(
				([k, v]) => k.toLowerCase() === "content-type" && v.includes("image/png"),
			),
		).toBe(true);
		expect(
			response.headers.some(
				([k, v]) =>
					k.toLowerCase() === "content-disposition" && v.toLowerCase().includes("attachment"),
			),
		).toBe(true);
		expect(response.body.kind).toBe("bytes");
		expect(response.body.value.byteLength).toBeGreaterThan(50);
	});

	it("renders detailed analytics page after scans", async () => {
		host = await createPluginTestHost();
		await host.invokeRoute("admin", {
			type: "form_submit",
			action_id: "create_code",
			page: "/codes",
			values: {
				title: "Ads",
				slug: "ads",
				destination: "https://example.com/ads",
				fg: "#000000",
				bg: "#ffffff",
				ecc: "M",
				size: "128",
				margin: 2,
			},
		});
		await host.invokeRoute(
			"go",
			{ code: "ads" },
			{
				method: "GET",
				meta: {
					ip: "9.9.9.9",
					userAgent: "Mozilla/5.0 (iPhone)",
					referer: "https://twitter.com/x",
					geo: { country: "IN", region: "TG", city: "Hyderabad" },
				},
			},
		);

		const page = (await host.invokeRoute("admin", {
			type: "page_load",
			page: "/analytics",
		})) as { blocks: Array<{ type: string }> };

		expect(page.blocks.some((b) => b.type === "chart")).toBe(true);
		expect(page.blocks.some((b) => b.type === "stats")).toBe(true);
	});
});
