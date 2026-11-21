/**
 * Contracts for the dependency-free tar reader the template installer unpacks
 * with. The failure modes that matter: codeload's `repo-<sha>/` wrapper has to
 * come off, pax long paths (which GitHub emits for deep files) must not
 * truncate to tar's 100-byte field, and a path in the archive must never
 * escape the destination folder.
 */
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractTarGz, readTar, stripTopLevel } from "./tar-extract";

/** Build a tar (ustar) from `[path, contents]` pairs. */
function buildTar(files: ReadonlyArray<readonly [string, string]>): Buffer {
	const blocks: Buffer[] = [];
	const push = (header: Buffer, body: Buffer) => {
		blocks.push(header, body);
		const pad = (512 - (body.length % 512)) % 512;
		if (pad > 0) blocks.push(Buffer.alloc(pad));
	};
	for (const [path, contents] of files) {
		const body = Buffer.from(contents, "utf8");
		const header = Buffer.alloc(512);
		header.write(path, 0, 100, "utf8");
		header.write("0000644\0", 100, 8, "ascii");
		header.write("0000000\0", 108, 8, "ascii");
		header.write("0000000\0", 116, 8, "ascii");
		header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
		header.write("00000000000\0", 136, 12, "ascii");
		header.write("        ", 148, 8, "ascii");
		header.write("0", 156, 1, "ascii");
		header.write("ustar\0" + "00", 257, 8, "ascii");
		// Checksum: spaces while summing, then the octal value.
		let sum = 0;
		for (const byte of header) sum += byte;
		header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
		push(header, body);
	}
	blocks.push(Buffer.alloc(1024));
	return Buffer.concat(blocks);
}

/** A pax-extended entry: a `x` header carrying the real (long) path, then the file. */
function paxHeader(longPath: string): { header: Buffer; body: Buffer } {
	const record = ` path=${longPath}\n`;
	const length = record.length + String(record.length + 3).length;
	const body = Buffer.from(`${length}${record}`, "utf8");
	const header = Buffer.alloc(512);
	header.write("PaxHeader", 0, 100, "utf8");
	header.write("0000644\0", 100, 8, "ascii");
	header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
	header.write("x", 156, 1, "ascii");
	let sum = 0;
	for (const byte of header) sum += byte;
	header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
	return { header, body };
}

describe("readTar", () => {
	it("reads file contents, modes and names", () => {
		const entries = readTar(buildTar([["repo-sha/package.json", '{"name":"t"}\n']]));
		expect(entries).toHaveLength(1);
		expect(entries[0]?.path).toBe("repo-sha/package.json");
		expect(entries[0]?.type).toBe("file");
		expect(entries[0]?.data.toString("utf8")).toBe('{"name":"t"}\n');
		expect(entries[0]?.mode).toBe(0o644);
	});

	it("keeps a path longer than the 100-byte name field intact", () => {
		// Codeload writes these for deep files; without the pax record the name
		// silently truncates and the file lands in the wrong folder.
		const long = `repo-sha/${"nested/".repeat(20)}file.ts`;
		const pax = paxHeader(long);
		const file = buildTar([["placeholder", "export const x = 1;\n"]]);
		const archive = Buffer.concat([
			pax.header,
			pax.body,
			Buffer.alloc((512 - (pax.body.length % 512)) % 512),
			file.subarray(0, 512 + 512),
			Buffer.alloc(1024),
		]);
		const entries = readTar(archive);
		expect(entries[0]?.path).toBe(long);
	});

	it("stops at the end-of-archive marker instead of reading padding as entries", () => {
		const archive = Buffer.concat([buildTar([["a.txt", "x"]]), Buffer.alloc(4096)]);
		expect(readTar(archive)).toHaveLength(1);
	});

	it("unpacks a gzipped archive", () => {
		const entries = extractTarGz(gzipSync(buildTar([["repo-sha/index.html", "<!doctype html>"]])));
		expect(entries[0]?.data.toString("utf8")).toBe("<!doctype html>");
	});
});

describe("stripTopLevel", () => {
	it("re-roots entries under the wrapper folder and drops the rest", () => {
		const entries = readTar(
			buildTar([
				["repo-sha/package.json", "{}"],
				["repo-sha/src/index.ts", "x"],
				["other-sha/package.json", "{}"],
			]),
		);
		const stripped = stripTopLevel(entries, "repo-sha");
		expect(stripped.map(entry => entry.path)).toEqual(["package.json", "src/index.ts"]);
	});

	it("leaves entries alone when no wrapper is named", () => {
		const entries = readTar(buildTar([["a.txt", "x"]]));
		expect(stripTopLevel(entries, null).map(entry => entry.path)).toEqual(["a.txt"]);
	});
});
