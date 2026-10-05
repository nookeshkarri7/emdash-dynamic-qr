import { encode } from "../vendor/uqr.js";

import type { QrStyle } from "../types.js";

function parseHex(color: string): [number, number, number] {
	const hex = color.trim().replace("#", "");
	const full =
		hex.length === 3
			? hex
					.split("")
					.map((c) => c + c)
					.join("")
			: hex;
	const n = Number.parseInt(full, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function crcTable(): Uint32Array {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[i] = c >>> 0;
	}
	return table;
}

const CRC_TABLE = crcTable();

function crc32(buf: Uint8Array): number {
	let c = 0xffffffff;
	for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
	return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const typeBytes = new TextEncoder().encode(type);
	const len = u32(data.length);
	const body = new Uint8Array(typeBytes.length + data.length);
	body.set(typeBytes, 0);
	body.set(data, typeBytes.length);
	const crc = u32(crc32(body));
	const out = new Uint8Array(4 + body.length + 4);
	out.set(len, 0);
	out.set(body, 4);
	out.set(crc, 4 + body.length);
	return out;
}

/**
 * Encode a QR matrix into an RGB PNG. Uses uncompressed PNG + filter type 0 rows
 * (still valid; larger than zlib but fine for QR modules).
 */
export function matrixToPng(
	matrix: boolean[][],
	style: Pick<QrStyle, "fg" | "bg" | "size" | "margin">,
): Uint8Array {
	const modules = matrix.length;
	const margin = Math.max(0, Math.floor(style.margin));
	const totalModules = modules + margin * 2;
	const scale = Math.max(1, Math.floor(style.size / totalModules));
	const width = totalModules * scale;
	const height = width;
	const [fr, fg, fb] = parseHex(style.fg);
	const [br, bg, bb] = parseHex(style.bg);

	const rowSize = 1 + width * 3;
	const raw = new Uint8Array(rowSize * height);
	for (let y = 0; y < height; y++) {
		const rowStart = y * rowSize;
		raw[rowStart] = 0; // filter None
		const my = Math.floor(y / scale) - margin;
		for (let x = 0; x < width; x++) {
			const mx = Math.floor(x / scale) - margin;
			const on =
				my >= 0 && my < modules && mx >= 0 && mx < modules ? Boolean(matrix[my]?.[mx]) : false;
			const i = rowStart + 1 + x * 3;
			if (on) {
				raw[i] = fr;
				raw[i + 1] = fg;
				raw[i + 2] = fb;
			} else {
				raw[i] = br;
				raw[i + 1] = bg;
				raw[i + 2] = bb;
			}
		}
	}

	// Store as uncompressed DEFLATE blocks (stored/raw) so we avoid a zlib dep.
	const deflated = deflateStore(raw);
	const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = new Uint8Array(13);
	ihdr.set(u32(width), 0);
	ihdr.set(u32(height), 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // color type RGB
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	const parts = [signature, chunk("IHDR", ihdr), chunk("IDAT", deflated), chunk("IEND", new Uint8Array())];
	let total = 0;
	for (const p of parts) total += p.length;
	const out = new Uint8Array(total);
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.length;
	}
	return out;
}

/** RFC 1950 zlib wrapper around non-compressed DEFLATE stored blocks. */
function deflateStore(data: Uint8Array): Uint8Array {
	const maxChunk = 65535;
	const blocks: Uint8Array[] = [];
	for (let i = 0; i < data.length; i += maxChunk) {
		const slice = data.subarray(i, Math.min(i + maxChunk, data.length));
		const isFinal = i + maxChunk >= data.length ? 1 : 0;
		const header = new Uint8Array(5);
		header[0] = isFinal; // BFINAL=1/0, BTYPE=00
		header[1] = slice.length & 255;
		header[2] = (slice.length >> 8) & 255;
		const nlen = ~slice.length & 0xffff;
		header[3] = nlen & 255;
		header[4] = (nlen >> 8) & 255;
		const block = new Uint8Array(5 + slice.length);
		block.set(header, 0);
		block.set(slice, 5);
		blocks.push(block);
	}

	let deflateLen = 0;
	for (const b of blocks) deflateLen += b.length;
	const deflate = new Uint8Array(deflateLen);
	let o = 0;
	for (const b of blocks) {
		deflate.set(b, o);
		o += b.length;
	}

	const adler = adler32(data);
	const out = new Uint8Array(2 + deflate.length + 4);
	out[0] = 0x78; // CMF
	out[1] = 0x01; // FLG (no dict, check bits)
	out.set(deflate, 2);
	out.set(u32(adler), 2 + deflate.length);
	return out;
}

function adler32(data: Uint8Array): number {
	let a = 1;
	let b = 0;
	for (const byte of data) {
		a = (a + byte) % 65521;
		b = (b + a) % 65521;
	}
	return ((b << 16) | a) >>> 0;
}

export function buildQrMatrix(text: string, style: QrStyle): boolean[][] {
	const result = encode(text, {
		ecc: style.ecc,
		border: 0,
	});
	return result.data;
}

export function renderQrPng(text: string, style: QrStyle): Uint8Array {
	return matrixToPng(buildQrMatrix(text, style), style);
}
