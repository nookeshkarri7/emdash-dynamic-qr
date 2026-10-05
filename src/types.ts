export type EccLevel = "L" | "M" | "Q" | "H";

export interface QrStyle {
	fg: string;
	bg: string;
	size: number;
	margin: number;
	ecc: EccLevel;
}

export interface QrCodeRecord {
	title: string;
	slug: string;
	destination: string;
	enabled: boolean;
	style: QrStyle;
	scanCount: number;
	lastScanAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ScanRecord {
	codeId: string;
	slug: string;
	createdAt: string;
	userAgent: string | null;
	referer: string | null;
	ipHash: string | null;
	country: string | null;
	region: string | null;
	city: string | null;
}

export const DEFAULT_STYLE: QrStyle = {
	fg: "#000000",
	bg: "#ffffff",
	size: 256,
	margin: 2,
	ecc: "M",
};

export function normalizeSlug(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 64);
}

export function isValidHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

export function isHexColor(value: string): boolean {
	return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

export function parseEcc(value: string | undefined, fallback: EccLevel = "M"): EccLevel {
	if (value === "L" || value === "M" || value === "Q" || value === "H") return value;
	return fallback;
}

/** FNV-1a 32-bit hash for privacy-preserving IP bucketing (not reversible identity). */
export async function hashIp(ip: string | null): Promise<string | null> {
	if (!ip) return null;
	const data = new TextEncoder().encode(ip);
	let hash = 0x811c9dc5;
	for (const byte of data) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export function newId(prefix: string): string {
	const rand = crypto.getRandomValues(new Uint8Array(10));
	const hex = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
	return `${prefix}_${hex}`;
}
