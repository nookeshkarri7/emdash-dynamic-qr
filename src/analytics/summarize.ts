import type { ScanRecord } from "../types.js";

export type DeviceKind = "mobile" | "tablet" | "desktop" | "bot" | "unknown";

export function classifyDevice(ua: string | null): DeviceKind {
	if (!ua) return "unknown";
	const v = ua.toLowerCase();
	if (/bot|crawl|spider|slurp|facebookexternalhit|preview/i.test(v)) return "bot";
	if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(v)) return "tablet";
	if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(v)) return "mobile";
	return "desktop";
}

export function refererHost(referer: string | null): string {
	if (!referer) return "(direct)";
	try {
		return new URL(referer).host || "(direct)";
	} catch {
		return "(invalid)";
	}
}

function dayKey(iso: string): string {
	return iso.slice(0, 10);
}

export interface AnalyticsSummary {
	total: number;
	last24h: number;
	last7d: number;
	last30d: number;
	uniqueDays: number;
	byCountry: Array<{ name: string; value: number }>;
	byDevice: Array<{ name: string; value: number }>;
	byReferer: Array<{ name: string; value: number }>;
	byCity: Array<{ name: string; value: number }>;
	timeseries: Array<[number, number]>;
}

export function summarizeScans(scans: ScanRecord[], nowMs = Date.now()): AnalyticsSummary {
	const dayMs = 24 * 60 * 60 * 1000;
	const byCountry = new Map<string, number>();
	const byDevice = new Map<string, number>();
	const byReferer = new Map<string, number>();
	const byCity = new Map<string, number>();
	const byDay = new Map<string, number>();
	let last24h = 0;
	let last7d = 0;
	let last30d = 0;

	for (const scan of scans) {
		const t = Date.parse(scan.createdAt);
		if (Number.isFinite(t)) {
			const age = nowMs - t;
			if (age <= dayMs) last24h += 1;
			if (age <= 7 * dayMs) last7d += 1;
			if (age <= 30 * dayMs) last30d += 1;
			const key = dayKey(new Date(t).toISOString());
			byDay.set(key, (byDay.get(key) ?? 0) + 1);
		}

		const country = scan.country || "unknown";
		byCountry.set(country, (byCountry.get(country) ?? 0) + 1);

		const device = classifyDevice(scan.userAgent);
		byDevice.set(device, (byDevice.get(device) ?? 0) + 1);

		const ref = refererHost(scan.referer);
		byReferer.set(ref, (byReferer.get(ref) ?? 0) + 1);

		const city = scan.city ? `${scan.city}${scan.country ? `, ${scan.country}` : ""}` : "unknown";
		byCity.set(city, (byCity.get(city) ?? 0) + 1);
	}

	const top = (map: Map<string, number>, limit = 8) =>
		[...map.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([name, value]) => ({ name, value }));

	const timeseries: Array<[number, number]> = [];
	for (let i = 29; i >= 0; i--) {
		const d = new Date(nowMs - i * dayMs);
		const key = dayKey(d.toISOString());
		timeseries.push([Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), byDay.get(key) ?? 0]);
	}

	return {
		total: scans.length,
		last24h,
		last7d,
		last30d,
		uniqueDays: byDay.size,
		byCountry: top(byCountry),
		byDevice: top(byDevice, 5),
		byReferer: top(byReferer),
		byCity: top(byCity),
		timeseries,
	};
}
