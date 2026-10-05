import { pluginResponse, pluginRoute, type PluginContext, type SandboxedRouteContext } from "emdash/plugin";

import { codes, findCodeBySlug, scans } from "../data.js";
import { renderQrPng } from "../qr/render.js";
import { buildPublicPaths } from "../data.js";
import { hashIp, newId, type QrCodeRecord, type ScanRecord } from "../types.js";
import { loadSettings } from "../data.js";

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function readMeta(meta: unknown): {
	ip: string | null;
	userAgent: string | null;
	referer: string | null;
	geo: { country: string | null; region: string | null; city: string | null } | null;
} {
	if (!meta || typeof meta !== "object") {
		return { ip: null, userAgent: null, referer: null, geo: null };
	}
	const record = meta as Record<string, unknown>;
	const geo =
		record.geo && typeof record.geo === "object"
			? (record.geo as {
					country: string | null;
					region: string | null;
					city: string | null;
				})
			: null;
	return {
		ip: typeof record.ip === "string" ? record.ip : null,
		userAgent: typeof record.userAgent === "string" ? record.userAgent : null,
		referer: typeof record.referer === "string" ? record.referer : null,
		geo,
	};
}

function codeFromInput(input: unknown, requestUrl: string): string {
	if (input && typeof input === "object") {
		const record = input as Record<string, unknown>;
		const direct = asString(record.code) || asString(record.c) || asString(record.slug);
		if (direct) return direct;
	}
	try {
		const url = new URL(requestUrl);
		return url.searchParams.get("code") || url.searchParams.get("c") || "";
	} catch {
		return "";
	}
}

async function recordScan(
	ctx: PluginContext,
	entry: { id: string; data: QrCodeRecord },
	routeCtx: SandboxedRouteContext,
): Promise<void> {
	const meta = readMeta(routeCtx.requestMeta);
	const now = new Date().toISOString();
	const scan: ScanRecord = {
		codeId: entry.id,
		slug: entry.data.slug,
		createdAt: now,
		userAgent: meta.userAgent,
		referer: meta.referer,
		ipHash: await hashIp(meta.ip),
		country: meta.geo?.country ?? null,
		region: meta.geo?.region ?? null,
		city: meta.geo?.city ?? null,
	};
	await scans(ctx).put(newId("scan"), scan);

	const versioned = await codes(ctx).getVersioned(entry.id);
	if (!versioned) return;
	const current = versioned.value as QrCodeRecord;
	await codes(ctx).compareAndSet(entry.id, versioned.revision, {
		...current,
		scanCount: (current.scanCount ?? 0) + 1,
		lastScanAt: now,
		updatedAt: now,
	});
}

export const goRoute = pluginRoute({
	public: true,
	methods: ["GET", "HEAD"],
	request: { body: "none" },
	response: "raw",
	cacheControl: "private, no-store",
	handler: async (routeCtx, ctx) => {
		const slug = codeFromInput(routeCtx.input, routeCtx.request.url);
		const entry = await findCodeBySlug(ctx, slug);
		if (!entry || !entry.data.enabled) {
			return pluginResponse({
				status: 404,
				headers: { "Content-Type": "text/plain; charset=utf-8" },
				body: { kind: "text", value: "QR code not found" },
			});
		}

		try {
			await recordScan(ctx, entry, routeCtx);
		} catch (error) {
			ctx.log.warn("Failed to record QR scan", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		return pluginResponse({
			status: 302,
			headers: {
				Location: entry.data.destination,
				"Content-Type": "text/plain; charset=utf-8",
			},
			body: { kind: "text", value: "" },
		});
	},
});

export const imageRoute = pluginRoute({
	public: true,
	methods: ["GET", "HEAD"],
	request: { body: "none" },
	response: "raw",
	cacheControl: "public, max-age=60, stale-while-revalidate=300",
	handler: async (routeCtx, ctx) => {
		const slug = codeFromInput(routeCtx.input, routeCtx.request.url);
		const entry = await findCodeBySlug(ctx, slug);
		if (!entry || !entry.data.enabled) {
			return pluginResponse({
				status: 404,
				headers: { "Content-Type": "text/plain; charset=utf-8" },
				body: { kind: "text", value: "QR code not found" },
			});
		}

		const settings = await loadSettings(ctx);
		const { goUrl } = buildPublicPaths(settings.publicBaseUrl, entry.data.slug);
		const target = settings.publicBaseUrl ? goUrl : entry.data.destination;

		let size = entry.data.style.size;
		let download = false;
		try {
			const url = new URL(routeCtx.request.url);
			const sizeParam = Number(url.searchParams.get("size") ?? "");
			if (Number.isFinite(sizeParam) && sizeParam >= 64 && sizeParam <= 2048) {
				size = Math.floor(sizeParam);
			}
			download = url.searchParams.get("download") === "1";
		} catch {
			/* ignore */
		}
		if (routeCtx.input && typeof routeCtx.input === "object") {
			const input = routeCtx.input as Record<string, unknown>;
			const sizeParam = Number(input.size ?? "");
			if (Number.isFinite(sizeParam) && sizeParam >= 64 && sizeParam <= 2048) {
				size = Math.floor(sizeParam);
			}
			if (input.download === "1" || input.download === 1 || input.download === true) {
				download = true;
			}
		}

		const png = renderQrPng(target, { ...entry.data.style, size });
		const filename = `${entry.data.slug}${size !== entry.data.style.size ? `-${size}` : ""}.png`;

		return pluginResponse({
			status: 200,
			headers: {
				"Content-Type": "image/png",
				"Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
			},
			body: { kind: "bytes", value: png },
		});
	},
});
