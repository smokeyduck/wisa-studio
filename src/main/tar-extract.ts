/**
 * Minimal, dependency-free reader for the `.tar.gz` archives GitHub's codeload
 * serves for a repository. Templates install by unpacking one of those, and the
 * main bundle must stay self-contained (no node_modules at runtime), so the
 * parser lives here instead of pulling in a tar package.
 *
 * Only what a source archive actually contains is supported: regular files,
 * directories, and the two ways tar spells a long path (GNU `L` entries and pax
 * `x` headers) — codeload emits the pax form for deep paths, which silently
 * truncates to 100 bytes without it. Links and device nodes are skipped: a
 * template is source files, and following a link out of the archive is exactly
 * the kind of thing this must not do.
 */
import { gunzipSync } from "node:zlib";

export interface TarEntry {
	/** Path inside the archive, with the archive's own separators normalized to `/`. */
	path: string;
	type: "file" | "directory";
	/** Unix mode bits (already masked to permission bits). */
	mode: number;
	data: Buffer;
}

const BLOCK = 512;

function readString(buffer: Buffer, offset: number, length: number): string {
	const slice = buffer.subarray(offset, offset + length);
	const end = slice.indexOf(0);
	return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8");
}

/** Octal field, possibly space/NUL padded. Empty means 0. */
function readOctal(buffer: Buffer, offset: number, length: number): number {
	const text = readString(buffer, offset, length).trim();
	if (text === "") return 0;
	const value = Number.parseInt(text, 8);
	return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** pax records: "<len> key=value\n", length counting the whole record. */
function parsePax(buffer: Buffer): Map<string, string> {
	const records = new Map<string, string>();
	let offset = 0;
	while (offset < buffer.length) {
		const space = buffer.indexOf(0x20, offset);
		if (space === -1) break;
		const length = Number.parseInt(buffer.subarray(offset, space).toString("utf8"), 10);
		if (!Number.isFinite(length) || length <= 0 || offset + length > buffer.length) break;
		const record = buffer.subarray(space + 1, offset + length - 1).toString("utf8");
		const equals = record.indexOf("=");
		if (equals > 0) records.set(record.slice(0, equals), record.slice(equals + 1));
		offset += length;
	}
	return records;
}

/**
 * Unpack a gzipped tar into its entries, in archive order. Throws on input that
 * is not a tar at all; a truncated archive yields the entries that were intact.
 */
export function extractTarGz(archive: Buffer): TarEntry[] {
	return readTar(gunzipSync(archive));
}

/** Unpack an already-decompressed tar (the tests use this to skip gzip). */
export function readTar(archive: Buffer): TarEntry[] {
	const entries: TarEntry[] = [];
	let offset = 0;
	let longName: string | null = null;
	let paxPath: string | null = null;

	while (offset + BLOCK <= archive.length) {
		const header = archive.subarray(offset, offset + BLOCK);
		// End of archive: two zero blocks (one is enough to stop in practice).
		if (header.every(byte => byte === 0)) break;
		const size = readOctal(header, 124, 12);
		const typeflag = String.fromCharCode(header[156] ?? 0);
		const bodyStart = offset + BLOCK;
		const bodyEnd = bodyStart + size;
		if (bodyEnd > archive.length) break;
		const body = archive.subarray(bodyStart, bodyEnd);

		if (typeflag === "L") {
			longName = readString(body, 0, body.length);
		} else if (typeflag === "x") {
			paxPath = parsePax(body).get("path") ?? null;
		} else if (typeflag === "g") {
			// Global pax header: no template relies on it, and applying it would
			// silently rename later entries.
		} else {
			const name = paxPath ?? longName ?? readString(header, 0, 100);
			const prefix = readString(header, 345, 155);
			const full = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, "");
			longName = null;
			paxPath = null;
			if (full && !full.endsWith("/")) {
				if (typeflag === "5") entries.push({ path: full, type: "directory", mode: 0o755, data: Buffer.alloc(0) });
				else if (typeflag === "0" || typeflag === "\0")
					entries.push({
						path: full,
						type: "file",
						mode: readOctal(header, 100, 8) & 0o777,
						data: Buffer.from(body),
					});
			} else if (full) {
				entries.push({ path: full.slice(0, -1), type: "directory", mode: 0o755, data: Buffer.alloc(0) });
			}
		}
		// Entries are padded to a whole block.
		offset = bodyStart + Math.ceil(size / BLOCK) * BLOCK;
	}
	return entries;
}

/**
 * Drop the single top-level folder codeload puts around every repository
 * (`repo-<sha>/…`) and return the entries re-rooted at it. Entries outside that
 * folder are dropped: they are not the template.
 */
export function stripTopLevel(entries: readonly TarEntry[], prefix: string | null | undefined): TarEntry[] {
	if (!prefix) return [...entries];
	const root = prefix.replace(/\/+$/, "");
	const stripped: TarEntry[] = [];
	for (const entry of entries) {
		if (entry.path === root) continue;
		if (!entry.path.startsWith(`${root}/`)) continue;
		const path = entry.path.slice(root.length + 1);
		if (path === "") continue;
		stripped.push({ ...entry, path });
	}
	return stripped;
}
