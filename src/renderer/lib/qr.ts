/**
 * QR rendering for collab links, so a phone joins a session by scanning the
 * screen instead of retyping a 60-character base64url key.
 *
 * `uqr` is a zero-dependency encoder (MIT) that returns the module matrix; this
 * module only turns that matrix into an SVG path — no HTML strings, no canvas,
 * and no second QR implementation. Errors are returned, never thrown: a link
 * the encoder refuses must not take down the dialog that shows it.
 */
import { encode } from "uqr";

/** Modules per quiet-zone edge; scanners need this margin to find the symbol. */
const BORDER_MODULES = 3;

export interface QrDrawing {
	/** Side length in modules, quiet zone included. */
	size: number;
	/** One SVG `path` `d` attribute covering every dark module. */
	path: string;
}

export type QrResult = { ok: true; drawing: QrDrawing } | { ok: false; error: string };

/**
 * Encode `text` as a square QR symbol drawn at one SVG unit per module.
 *
 * ECC level M (15% recovery) is the practical choice for a screen-to-camera
 * scan: it survives fingerprints and glare without inflating the symbol the
 * way Q does at this payload length.
 */
export function qrDrawing(text: string): QrResult {
	const value = text.trim();
	if (!value) return { ok: false, error: "Empty QR payload" };
	let matrix: boolean[][];
	try {
		matrix = encode(value, { ecc: "M", border: BORDER_MODULES }).data;
	} catch (cause) {
		return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
	}
	const size = matrix.length;
	const commands: string[] = [];
	for (let y = 0; y < size; y++) {
		const row = matrix[y];
		if (!row) continue;
		// Coalesce each run of dark modules into one rectangle: a full-URL
		// symbol is otherwise thousands of 1×1 subpaths.
		let runStart = -1;
		for (let x = 0; x <= size; x++) {
			const dark = x < size && row[x] === true;
			if (dark && runStart < 0) runStart = x;
			if (!dark && runStart >= 0) {
				commands.push(`M${runStart} ${y}h${x - runStart}v1h${runStart - x}z`);
				runStart = -1;
			}
		}
	}
	return { ok: true, drawing: { size, path: commands.join("") } };
}
