import type { BlockResponse } from "@emdash-cms/blocks";
import type { PluginContext, SandboxedRouteContext } from "emdash/plugin";

import { buildAnalyticsPage } from "../admin/analytics.js";
import { buildCodesPage } from "../admin/codes.js";
import { buildOverviewWidget, buildSettingsPage } from "../admin/settings.js";
import {
	STYLE_PRESETS,
	codes,
	defaultStyleFromSettings,
	findCodeBySlug,
	listCodes,
	listScansForCode,
	loadSettings,
} from "../data.js";
import {
	isHexColor,
	isValidHttpUrl,
	newId,
	normalizeSlug,
	parseEcc,
	type QrCodeRecord,
	type QrStyle,
} from "../types.js";

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function asBool(value: unknown, fallback = false): boolean {
	if (typeof value === "boolean") return value;
	if (value === "true" || value === "1") return true;
	if (value === "false" || value === "0") return false;
	return fallback;
}

function asNumber(value: unknown, fallback: number): number {
	const n = typeof value === "number" ? value : Number(asString(value));
	return Number.isFinite(n) ? n : fallback;
}

function interactionPage(input: unknown): string {
	if (!input || typeof input !== "object") return "/codes";
	const page = (input as Record<string, unknown>).page;
	return typeof page === "string" ? page : "/codes";
}

function interactionType(input: unknown): string {
	if (!input || typeof input !== "object") return "page_load";
	return asString((input as Record<string, unknown>).type) || "page_load";
}

function interactionAction(input: unknown): string {
	if (!input || typeof input !== "object") return "";
	return asString((input as Record<string, unknown>).action_id);
}

function interactionValues(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== "object") return {};
	const values = (input as Record<string, unknown>).values;
	return values && typeof values === "object" && !Array.isArray(values)
		? (values as Record<string, unknown>)
		: {};
}

function interactionValue(input: unknown): unknown {
	if (!input || typeof input !== "object") return undefined;
	return (input as Record<string, unknown>).value;
}

function styleFromValues(
	values: Record<string, unknown>,
	base: QrStyle,
): { style: QrStyle; error?: string } {
	const presetKey = asString(values.preset).trim();
	const preset = presetKey && presetKey !== "custom" ? STYLE_PRESETS[presetKey] : undefined;
	const fg = (preset?.fg || asString(values.fg).trim() || base.fg).trim();
	const bg = (preset?.bg || asString(values.bg).trim() || base.bg).trim();
	if (!isHexColor(fg) || !isHexColor(bg)) {
		return { style: base, error: "Colors must be hex like #000000 or #fff" };
	}
	const size = Math.min(1024, Math.max(64, Math.floor(asNumber(values.size, base.size))));
	const margin = Math.min(8, Math.max(0, Math.floor(asNumber(values.margin, base.margin))));
	return {
		style: {
			fg,
			bg,
			size,
			margin,
			ecc: parseEcc(asString(values.ecc), base.ecc),
		},
	};
}

export async function handleAdminRoute(
	routeCtx: SandboxedRouteContext,
	ctx: PluginContext,
): Promise<BlockResponse> {
	const settings = await loadSettings(ctx);
	const type = interactionType(routeCtx.input);
	const action = interactionAction(routeCtx.input);
	const values = interactionValues(routeCtx.input);
	const page = interactionPage(routeCtx.input);
	const surface = routeCtx.ui?.surface;

	if (surface === "dashboard-widget") {
		const listed = await listCodes(ctx, 200);
		return buildOverviewWidget({
			codeCount: listed.length,
			scanCount: listed.reduce((sum, c) => sum + c.data.scanCount, 0),
		});
	}

	if (type === "form_submit" && action === "save_settings") {
		const next = {
			publicBaseUrl: asString(values.publicBaseUrl).trim().replace(/\/$/, ""),
			defaultFg: asString(values.defaultFg).trim() || settings.defaultFg,
			defaultBg: asString(values.defaultBg).trim() || settings.defaultBg,
			defaultEcc: parseEcc(asString(values.defaultEcc), settings.defaultEcc),
		};
		if (!isHexColor(next.defaultFg) || !isHexColor(next.defaultBg)) {
			return {
				...buildSettingsPage(settings),
				toast: { type: "error", message: "Default colors must be valid hex" },
			};
		}
		await Promise.all([
			ctx.settings.set("publicBaseUrl", next.publicBaseUrl),
			ctx.settings.set("defaultFg", next.defaultFg),
			ctx.settings.set("defaultBg", next.defaultBg),
			ctx.settings.set("defaultEcc", next.defaultEcc),
		]);
		return {
			...buildSettingsPage(next, "Settings saved"),
			toast: { type: "success", message: "Settings saved" },
		};
	}

	if (page.includes("settings") || page.endsWith("/settings")) {
		return buildSettingsPage(settings);
	}

	if (page.includes("analytics") || page.endsWith("/analytics")) {
		const listed = await listCodes(ctx, 100);
		let selectedId =
			type === "form_submit" && action === "select_analytics"
				? asString(values.code_id)
				: (listed[0]?.id ?? null);
		if (selectedId && !listed.some((c) => c.id === selectedId)) selectedId = listed[0]?.id ?? null;
		const scanRows = selectedId ? await listScansForCode(ctx, selectedId, 250) : [];
		return buildAnalyticsPage({ codes: listed, selectedId, scans: scanRows });
	}

	let message: string | undefined;
	let error: string | undefined;
	let focusId: string | null = null;

	if (type === "block_action" && action === "view_code") {
		focusId = asString(interactionValue(routeCtx.input));
	}
	if (type === "block_action" && action === "refresh_preview") {
		focusId = asString(interactionValue(routeCtx.input));
		message = "Preview refreshed";
	}
	if (type === "block_action" && action === "clear_focus") {
		focusId = null;
	}

	if (type === "form_submit" && action === "create_code") {
		const destination = asString(values.destination).trim();
		const title = asString(values.title).trim() || "Untitled QR";
		let slug =
			normalizeSlug(asString(values.slug)) || normalizeSlug(title) || newId("qr").slice(3, 11);
		if (!isValidHttpUrl(destination)) {
			error = "Destination must be an http(s) URL";
		} else {
			const existing = await findCodeBySlug(ctx, slug);
			if (existing) slug = `${slug}-${newId("x").slice(-4)}`;
			const styled = styleFromValues(values, defaultStyleFromSettings(settings));
			if (styled.error) {
				error = styled.error;
			} else {
				const now = new Date().toISOString();
				const id = newId("qr");
				const record: QrCodeRecord = {
					title,
					slug,
					destination,
					enabled: true,
					style: styled.style,
					scanCount: 0,
					lastScanAt: null,
					createdAt: now,
					updatedAt: now,
				};
				await codes(ctx).put(id, record);
				message = `Created “${title}” (${slug})`;
				focusId = id;
			}
		}
	}

	if (type === "form_submit" && action === "update_code") {
		const id = asString(values.code_id).trim();
		const current = id ? await codes(ctx).get(id) : null;
		if (!current || typeof current !== "object") {
			error = "Code not found";
		} else {
			const data = current as QrCodeRecord;
			const destination = asString(values.destination).trim() || data.destination;
			if (!isValidHttpUrl(destination)) {
				error = "Destination must be an http(s) URL";
			} else {
				const styled = styleFromValues(values, data.style);
				if (styled.error) {
					error = styled.error;
				} else {
					const next: QrCodeRecord = {
						...data,
						title: asString(values.title).trim() || data.title,
						destination,
						enabled: asBool(values.enabled, data.enabled),
						style: styled.style,
						updatedAt: new Date().toISOString(),
					};
					await codes(ctx).put(id, next);
					message = "QR code updated — preview uses the new style";
					focusId = id;
				}
			}
		}
	}

	if (type === "block_action" && action === "delete_code") {
		const id = asString(interactionValue(routeCtx.input));
		if (id) {
			await codes(ctx).delete(id);
			message = "QR code deleted";
			focusId = null;
		}
	}

	const listed = await listCodes(ctx, 100);
	return {
		...buildCodesPage({ codes: listed, settings, message, error, focusId }),
		toast: error
			? { type: "error", message: error }
			: message
				? { type: "success", message }
				: undefined,
	};
}
