/**
 * The two guards every installer in this folder needs: a join that cannot leave
 * the folder it was given, and a reader that cannot be told to buffer an
 * unbounded response.
 *
 * Both installers (web templates, community skills) write a tree of files that
 * came off the network. The join is lexical on purpose — the destination is a
 * folder this process just created and emptied, so nothing on disk can redirect
 * a resolved path — and it refuses the shapes that make a lexical join lie:
 * absolute paths, drive letters, UNC prefixes, backslashes (a separator on
 * Windows, a literal on POSIX), NUL bytes, and any `.`/`..`/empty segment.
 */
import * as path from "node:path";

/** `C:` at the start of a path, which Windows reads as a drive, not a folder. */
const DRIVE_LETTER = /^[A-Za-z]:/;
/** `//host/share` — a network root, never a file inside the destination. */
const UNC_PREFIX = /^[\\/]{2}/;

/**
 * Join `relative` inside `root`, or null when the result would not be a file
 * inside it. Callers treat null as "this entry is not installable": a download
 * that names `../x`, `/etc/passwd`, `C:\x` or `a\b` is not a file tree we will
 * write.
 */
export function safeJoin(root: string, relative: string): string | null {
	if (typeof relative !== "string" || relative === "") return null;
	// A NUL byte truncates the path at the syscall boundary: "a\0/../../x"
	// resolves as "a" here and as something else to the kernel.
	if (relative.includes("\0")) return null;
	if (relative.includes("\\")) return null;
	if (DRIVE_LETTER.test(relative) || UNC_PREFIX.test(relative)) return null;
	if (relative.startsWith("/")) return null;
	for (const segment of relative.split("/")) {
		if (segment === "" || segment === "." || segment === "..") return null;
	}
	const base = path.resolve(root);
	const target = path.resolve(base, relative);
	const inside = path.relative(base, target);
	if (!inside || inside.startsWith(`..${path.sep}`) || inside === ".." || path.isAbsolute(inside)) return null;
	return target;
}

/**
 * Read a response body, refusing anything past `maxBytes`. Null means the cap
 * was hit (the stream is cancelled, so the connection is not left draining) or
 * the body could not be read; both are "too large or unreadable" to a caller
 * that only installs what it can bound.
 */
export async function readCapped(response: Response, maxBytes: number): Promise<Buffer | null> {
	const reader = response.body?.getReader();
	if (!reader) return Buffer.alloc(0);
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}
