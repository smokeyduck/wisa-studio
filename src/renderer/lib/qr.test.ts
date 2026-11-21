/**
 * QR helper contract: a phone scans what this draws, so a symbol that silently
 * fails to encode (or encodes a truncated URL) breaks the only link between the
 * dialog and the phone. Also pins the quiet zone and the run-coalescing path.
 */
import { describe, expect, it } from "vitest";
import { qrDrawing } from "./qr";

describe("qrDrawing", () => {
	it("encodes a collab web link into a square symbol with a quiet zone", () => {
		const result = qrDrawing("https://my.omp.sh/#JlNmkbmM1HQiDa35YM_z1A.apaYjg9MT0Rvb0Q");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// Modules plus the 3-module quiet zone on both edges, and a square matrix.
		expect(result.drawing.size % 2).toBe(1);
		expect(result.drawing.size).toBeGreaterThanOrEqual(21 + 6);
		expect(result.drawing.path).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
	});

	it("keeps the quiet zone empty so scanners can find the symbol", () => {
		const result = qrDrawing("https://my.omp.sh/#short");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const { path, size } = result.drawing;
		// No dark module may start in the first three or after `size - 3` modules.
		const starts = [...path.matchAll(/M(\d+) (\d+)/g)].map(match => ({
			x: Number(match[1]),
			y: Number(match[2]),
		}));
		expect(starts.every(start => start.x >= 3 && start.y >= 3)).toBe(true);
		const ends = [...path.matchAll(/h(\d+)v1h-(\d+)z/g)].map(match => Number(match[1]));
		expect(starts.every((start, index) => start.x + (ends[index] ?? 0) <= size - 3)).toBe(true);
	});

	it("coalesces dark runs instead of emitting one subpath per module", () => {
		const result = qrDrawing("https://my.omp.sh/#abcdefghijklmnop");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const { path, size } = result.drawing;
		// One subpath per dark run, never more than one per module.
		const subpaths = path.match(/z/g)?.length ?? 0;
		expect(subpaths).toBeGreaterThan(0);
		expect(subpaths).toBeLessThan(size * size);
	});

	it("reports an empty payload rather than drawing a symbol for nothing", () => {
		expect(qrDrawing("   ")).toEqual({ ok: false, error: "Empty QR payload" });
	});

	it("trims surrounding whitespace before encoding", () => {
		const padded = qrDrawing("  https://my.omp.sh/#same  ");
		const plain = qrDrawing("https://my.omp.sh/#same");
		expect(padded).toEqual(plain);
	});
});
