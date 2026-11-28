/** Local, profile-owned conversation media. No renderer-controlled filesystem paths. */
import { randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ConversationWallpaper } from "../shared/wallpaper";
import { sniffImageMime } from "./fs-image";

export const WALLPAPER_IMAGE_MAX_BYTES = 50 * 1024 * 1024;
export const WALLPAPER_VIDEO_MAX_BYTES = 1024 * 1024 * 1024;
export const WALLPAPER_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "avif", "mp4", "webm", "mov"];
const OWNED_FILE =
	/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:png|jpg|jpeg|webp|gif|avif|mp4|webm|mov)$/;
const TEMP_FILE = /^\.[a-f0-9-]{36}\.tmp$/;
const MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	avif: "image/avif",
	mp4: "video/mp4",
	webm: "video/webm",
	mov: "video/quicktime",
};
interface Selection {
	file: string;
	name: string;
}

/** Reject SVG/HTML and renamed content; containers still depend on Chromium's installed codecs. */
export function wallpaperMedia(header: Buffer, extension: string): { kind: "image" | "video"; mime: string } | null {
	const mime = Object.hasOwn(MIME, extension) ? MIME[extension] : undefined;
	if (!mime) return null;
	if (mime.startsWith("image/")) return sniffImageMime(header) === mime ? { kind: "image", mime } : null;
	if (extension === "webm") {
		if (header.length < 8 || header.readUInt32BE(0) !== 0x1a45dfa3 || !header.includes(Buffer.from("webm")))
			return null;
	} else {
		if (header.length < 12 || header.toString("ascii", 4, 8) !== "ftyp") return null;
		const brand = header.toString("ascii", 8, 12);
		if (extension === "mov" ? brand !== "qt  " : !/^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(brand))
			return null;
	}
	return { kind: "video", mime };
}

/** Only our exact URL shape is accepted, before URL normalization can hide traversal. */
export function wallpaperFileFromUrl(url: string): string | null {
	const match = /^wisa-wallpaper:\/\/media\/([^/?#]+)$/.exec(url);
	return match && OWNED_FILE.test(match[1]) ? match[1] : null;
}

/** A single HTTP byte range, including suffix and open-ended forms. null means unsatisfiable. */
export function wallpaperRange(value: string, size: number): { start: number; end: number } | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(value);
	if (!match || (!match[1] && !match[2]) || size <= 0) return null;
	const first = match[1] ? Number(match[1]) : null;
	const last = match[2] ? Number(match[2]) : null;
	if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
	if (first === null) return last && last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : null;
	if (first >= size || (last !== null && last < first)) return null;
	return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}

export class WallpaperStore {
	readonly #root: string;
	readonly #changed: (value: ConversationWallpaper | null) => void;
	#selection: Selection | null = null;
	#loaded = false;
	#queue: Promise<unknown> = Promise.resolve();

	constructor(userData: string, changed: (value: ConversationWallpaper | null) => void) {
		this.#root = path.join(userData, "conversation-wallpaper");
		this.#changed = changed;
	}

	#serial<T>(operation: () => Promise<T>): Promise<T> {
		const next = this.#queue.then(operation);
		this.#queue = next.catch(() => {});
		return next;
	}

	async #directory(): Promise<void> {
		await fs.mkdir(this.#root, { recursive: true, mode: 0o700 });
		const stat = await fs.lstat(this.#root);
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			throw new Error("Unsafe wallpaper directory");
		}
	}

	async #open(file: string): Promise<FileHandle> {
		await this.#directory();
		const target = path.join(this.#root, file);
		const before = await fs.lstat(target);
		if (!before.isFile() || before.isSymbolicLink()) throw new Error("Unsafe wallpaper file");
		const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			const opened = await handle.stat();
			if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev) {
				throw new Error("Wallpaper file changed");
			}
			return handle;
		} catch (error) {
			await handle.close();
			throw error;
		}
	}

	async #load(): Promise<void> {
		if (this.#loaded) return;
		await this.#directory();
		let manifest: FileHandle | undefined;
		try {
			manifest = await this.#open("selection.json");
			const info = await manifest.stat();
			if (!info.isFile() || info.size > 4096) throw new Error("Invalid wallpaper selection");
			const value: unknown = JSON.parse(await manifest.readFile("utf8"));
			if (
				value &&
				typeof value === "object" &&
				"file" in value &&
				"name" in value &&
				typeof value.file === "string" &&
				OWNED_FILE.test(value.file) &&
				typeof value.name === "string"
			) {
				const media = await this.#open(value.file);
				try {
					const stat = await media.stat();
					const header = Buffer.alloc(512);
					const { bytesRead } = await media.read(header, 0, header.length, 0);
					const format = wallpaperMedia(header.subarray(0, bytesRead), path.extname(value.file).slice(1));
					if (stat.isFile() && format && stat.size > 0 && stat.size <= this.#limit(format.kind)) {
						this.#selection = { file: value.file, name: value.name.slice(0, 255) };
					}
				} finally {
					await media.close();
				}
			}
		} catch (error) {
			// Missing, corrupt or externally replaced media reverts to the default.
			if (error instanceof Error && "code" in error && error.code === "EACCES") throw error;
		} finally {
			await manifest?.close();
		}
		this.#loaded = true;
		await this.#cleanup();
	}

	#limit(kind: "image" | "video"): number {
		return kind === "image" ? WALLPAPER_IMAGE_MAX_BYTES : WALLPAPER_VIDEO_MAX_BYTES;
	}

	#view(): ConversationWallpaper | null {
		if (!this.#selection) return null;
		return {
			kind: MIME[path.extname(this.#selection.file).slice(1)].startsWith("video/") ? "video" : "image",
			url: `wisa-wallpaper://media/${this.#selection.file}`,
			name: this.#selection.name,
		};
	}

	async #cleanup(): Promise<void> {
		for (const file of await fs.readdir(this.#root).catch(() => [] as string[])) {
			if ((OWNED_FILE.test(file) && file !== this.#selection?.file) || TEMP_FILE.test(file)) {
				await fs.unlink(path.join(this.#root, file)).catch(() => {});
			}
		}
	}

	async #persist(selection: Selection | null): Promise<void> {
		const temp = path.join(this.#root, `.${randomUUID()}.tmp`);
		try {
			const handle = await fs.open(temp, "wx", 0o600);
			try {
				await handle.writeFile(JSON.stringify(selection));
				await handle.sync();
			} finally {
				await handle.close();
			}
			await fs.rename(temp, path.join(this.#root, "selection.json"));
		} finally {
			await fs.unlink(temp).catch(() => {});
		}
		this.#selection = selection;
		this.#changed(this.#view());
		await this.#cleanup();
	}

	get(): Promise<ConversationWallpaper | null> {
		return this.#serial(async () => {
			await this.#load();
			return this.#view();
		});
	}

	clear(): Promise<void> {
		return this.#serial(async () => {
			await this.#load();
			await this.#persist(null);
		});
	}

	select(source: string): Promise<ConversationWallpaper | null> {
		return this.#serial(async () => {
			await this.#load();
			const extension = path.extname(source).slice(1).toLowerCase();
			const before = await fs.lstat(source);
			if (!before.isFile() || before.isSymbolicLink()) throw new Error("Wallpaper must be a regular file");
			const input = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
			const temp = path.join(this.#root, `.${randomUUID()}.tmp`);
			const file = `${randomUUID()}.${extension}`;
			let installed = false;
			try {
				const stat = await input.stat();
				if (!stat.isFile() || stat.ino !== before.ino || stat.dev !== before.dev) {
					throw new Error("Wallpaper file changed");
				}
				const header = Buffer.alloc(512);
				const { bytesRead } = await input.read(header, 0, header.length, 0);
				const format = wallpaperMedia(header.subarray(0, bytesRead), extension);
				if (!format) throw new Error("Unsupported wallpaper media");
				const limit = this.#limit(format.kind);
				if (stat.size <= 0 || stat.size > limit)
					throw new Error(`Wallpaper exceeds ${limit / 1024 / 1024} MiB limit`);
				let copied = 0;
				const bounded = new Transform({
					transform(chunk: Buffer, _encoding, callback) {
						copied += chunk.length;
						callback(copied > limit ? new Error("Wallpaper grew beyond its size limit") : null, chunk);
					},
				});
				await pipeline(
					input.createReadStream({ start: 0, autoClose: false }),
					bounded,
					(await fs.open(temp, "wx", 0o600)).createWriteStream(),
				);
				if (copied !== stat.size) throw new Error("Wallpaper changed while copying");
				const output = await fs.open(temp, "r+");
				try {
					const { bytesRead: copiedHeaderBytes } = await output.read(header, 0, header.length, 0);
					if (!wallpaperMedia(header.subarray(0, copiedHeaderBytes), extension)) {
						throw new Error("Wallpaper changed while copying");
					}
					await output.sync();
				} finally {
					await output.close();
				}
				await fs.rename(temp, path.join(this.#root, file));
				installed = true;
				await this.#persist({ file, name: path.basename(source).slice(0, 255) });
				return this.#view();
			} catch (error) {
				if (installed && this.#selection?.file !== file)
					await fs.unlink(path.join(this.#root, file)).catch(() => {});
				throw error;
			} finally {
				await input.close();
				await fs.unlink(temp).catch(() => {});
			}
		});
	}

	/** Opens only the currently selected owned file; the response streams from its checked descriptor. */
	async respond(request: Request): Promise<Response> {
		if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
		const file = wallpaperFileFromUrl(request.url);
		if (!file) return new Response(null, { status: 404 });
		const handle = await this.#serial(async () => {
			await this.#load();
			if (this.#selection?.file !== file) return null;
			return this.#open(file).catch(() => null);
		});
		if (!handle) return new Response(null, { status: 404 });
		try {
			const stat = await handle.stat();
			if (!stat.isFile()) {
				await handle.close();
				return new Response(null, { status: 404 });
			}
			const headers = new Headers({
				"Content-Type": MIME[path.extname(file).slice(1)],
				"Accept-Ranges": "bytes",
				"X-Content-Type-Options": "nosniff",
				"Cache-Control": "no-store",
			});
			const rangeHeader = request.headers.get("range");
			const range = rangeHeader ? wallpaperRange(rangeHeader, stat.size) : { start: 0, end: stat.size - 1 };
			if (!range) {
				await handle.close();
				headers.set("Content-Range", `bytes */${stat.size}`);
				return new Response(null, { status: 416, headers });
			}
			headers.set("Content-Length", String(range.end - range.start + 1));
			if (rangeHeader) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
			if (request.method === "HEAD") {
				await handle.close();
				return new Response(null, { status: rangeHeader ? 206 : 200, headers });
			}
			const stream = handle.createReadStream({ start: range.start, end: range.end, autoClose: true });
			return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
				status: rangeHeader ? 206 : 200,
				headers,
			});
		} catch (error) {
			await handle.close();
			throw error;
		}
	}
}
