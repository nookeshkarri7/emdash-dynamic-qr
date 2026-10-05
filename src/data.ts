import type { PluginContext } from "emdash/plugin";

import {
	DEFAULT_STYLE,
	type EccLevel,
	normalizeSlug,
	parseEcc,
	type QrCodeRecord,
	type QrStyle,
	type ScanRecord,
} from "./types.js";

export interface PluginSettings {
	publicBaseUrl: string;
	defaultFg: string;
	defaultBg: string;
	defaultEcc: EccLevel;
}

export async function loadSettings(ctx: PluginContext): Promise<PluginSettings> {
	const [publicBaseUrl, defaultFg, defaultBg, defaultEcc] = await Promise.all([
		ctx.settings.get<string>("publicBaseUrl"),
		ctx.settings.get<string>("defaultFg"),
		ctx.settings.get<string>("defaultBg"),
		ctx.settings.get<string>("defaultEcc"),
	]);
	return {
		publicBaseUrl: (publicBaseUrl ?? "").trim().replace(/\/$/, ""),
		defaultFg: defaultFg?.trim() || DEFAULT_STYLE.fg,
		defaultBg: defaultBg?.trim() || DEFAULT_STYLE.bg,
		defaultEcc: parseEcc(defaultEcc ?? undefined, DEFAULT_STYLE.ecc),
	};
}

export function defaultStyleFromSettings(settings: PluginSettings): QrStyle {
	return {
		...DEFAULT_STYLE,
		fg: settings.defaultFg,
		bg: settings.defaultBg,
		ecc: settings.defaultEcc,
	};
}

export function codes(ctx: PluginContext) {
	return ctx.storage.codes;
}

export function scans(ctx: PluginContext) {
	return ctx.storage.scans;
}

export async function findCodeBySlug(
	ctx: PluginContext,
	slug: string,
): Promise<{ id: string; data: QrCodeRecord } | null> {
	const normalized = normalizeSlug(slug);
	if (!normalized) return null;
	const result = await codes(ctx).query({
		where: { slug: normalized },
		limit: 1,
	});
	const item = result.items[0];
	return item ? { id: item.id, data: item.data as QrCodeRecord } : null;
}

export async function listCodes(ctx: PluginContext, limit = 50) {
	const result = await codes(ctx).query({
		orderBy: { createdAt: "desc" },
		limit,
	});
	return result.items.map((item) => ({
		id: item.id,
		data: item.data as QrCodeRecord,
	}));
}

export async function listScansForCode(ctx: PluginContext, codeId: string, limit = 100) {
	const result = await scans(ctx).query({
		where: { codeId },
		orderBy: { createdAt: "desc" },
		limit,
	});
	return result.items.map((item) => item.data as ScanRecord);
}

export function buildPublicPaths(baseUrl: string, slug: string) {
	const root = baseUrl.replace(/\/$/, "");
	const goPath = `/_emdash/api/plugins/dynamic-qr/go?code=${encodeURIComponent(slug)}`;
	const imagePath = `/_emdash/api/plugins/dynamic-qr/image?code=${encodeURIComponent(slug)}`;
	const downloadPath = `${imagePath}&download=1`;
	const previewPath = `${imagePath}&size=320`;
	return {
		goPath,
		imagePath,
		downloadPath,
		previewPath,
		goUrl: root ? `${root}${goPath}` : goPath,
		imageUrl: root ? `${root}${imagePath}` : imagePath,
		downloadUrl: root ? `${root}${downloadPath}` : downloadPath,
		previewUrl: root ? `${root}${previewPath}` : previewPath,
	};
}

export const STYLE_PRESETS: Record<string, { fg: string; bg: string; label: string }> = {
	classic: { fg: "#000000", bg: "#ffffff", label: "Classic" },
	midnight: { fg: "#0f172a", bg: "#f8fafc", label: "Midnight" },
	ocean: { fg: "#0ea5e9", bg: "#ffffff", label: "Ocean" },
	forest: { fg: "#166534", bg: "#ecfdf5", label: "Forest" },
	inverted: { fg: "#ffffff", bg: "#000000", label: "Inverted" },
};

