import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationWallpaper } from "../shared/wallpaper";
import {
	WALLPAPER_IMAGE_MAX_BYTES,
	WALLPAPER_VIDEO_MAX_BYTES,
	WallpaperStore,
	wallpaperFileFromUrl,
	wallpaperMedia,
	wallpaperRange,
} from "./wallpaper";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48]);
const MP4 = Buffer.from("000000186674797069736f6d0000020069736f6d6d703432", "hex");
let directory: string;
let profile: string;
let changed: Array<ConversationWallpaper | null>;
let store: WallpaperStore;

beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "wisa-wallpaper-"));
	profile = path.join(directory, "profile");
	changed = [];
	store = new WallpaperStore(profile, value => changed.push(value));
});
afterEach(async () => {
	await fs.rm(directory, { recursive: true, force: true });
});

async function source(name: string, bytes: Buffer = PNG): Promise<string> {
	const file = path.join(directory, name);
	await fs.writeFile(file, bytes);
	return file;
}

function request(url: string, range?: string, method = "GET"): Request {
	return new Request(url, { method, headers: range ? { Range: range } : {} });
}

describe("wallpaper media validation", () => {
	it("accepts only supported matching image/container signatures", () => {
		expect(wallpaperMedia(PNG, "png")).toEqual({ kind: "image", mime: "image/png" });
		expect(wallpaperMedia(PNG, "jpg")).toBeNull();
		expect(wallpaperMedia(Buffer.from("<svg/>"), "svg")).toBeNull();
		expect(wallpaperMedia(Buffer.from("<!doctype html>"), "png")).toBeNull();
		expect(wallpaperMedia(MP4, "mp4")).toEqual({ kind: "video", mime: "video/mp4" });
		expect(wallpaperMedia(MP4, "mov")).toBeNull();
		expect(wallpaperMedia(Buffer.alloc(0), "webm")).toBeNull();
		expect(wallpaperMedia(Buffer.from("1a45dfa3007765626d", "hex"), "webm")?.mime).toBe("video/webm");
		expect(wallpaperMedia(Buffer.from("1a45dfa3006d6174726f736b61", "hex"), "webm")).toBeNull();
	});

	it("accepts only opaque owned URLs, never paths, escapes, credentials or query strings", () => {
		const file = `${randomUUID()}.mp4`;
		expect(wallpaperFileFromUrl(`wisa-wallpaper://media/${file}`)).toBe(file);
		for (const url of [
			`file:///tmp/${file}`,
			`wisa-wallpaper://other/${file}`,
			`wisa-wallpaper://user@media/${file}`,
			`wisa-wallpaper://media/../${file}`,
			`wisa-wallpaper://media/%2e%2e/${file}`,
			`wisa-wallpaper://media/%2f${file}`,
			`wisa-wallpaper://media/${file}?path=/tmp/a`,
			`wisa-wallpaper://media/${file}#x`,
			"wisa-wallpaper://media/selection.json",
		])
			expect(wallpaperFileFromUrl(url)).toBeNull();
	});
});

describe("single byte ranges", () => {
	it.each([
		["bytes=0-0", { start: 0, end: 0 }],
		["bytes=5-", { start: 5, end: 9 }],
		["bytes=-3", { start: 7, end: 9 }],
		["bytes=-50", { start: 0, end: 9 }],
		["bytes=2-50", { start: 2, end: 9 }],
	])("parses %s", (header, expected) => {
		expect(wallpaperRange(header, 10)).toEqual(expected);
	});
	it.each([
		"bytes=-0",
		"bytes=-",
		"bytes=10-",
		"bytes=8-2",
		"bytes=0-1,3-4",
		"items=0-1",
		"bytes=1.5-2",
		"bytes=9007199254740992-",
	])("rejects %s", header => {
		expect(wallpaperRange(header, 10)).toBeNull();
	});
	it("rejects an empty resource", () => {
		expect(wallpaperRange("bytes=0-", 0)).toBeNull();
	});
});

describe("profile-owned wallpaper", () => {
	it("copies locally, persists before notifying, survives source deletion and cleans obsolete media", async () => {
		const original = await source("private-name.png");
		const selected = await store.select(original);
		expect(selected).toEqual({
			kind: "image",
			name: "private-name.png",
			url: expect.stringMatching(/^wisa-wallpaper:\/\/media\//),
		});
		expect(JSON.stringify(selected)).not.toContain(directory);
		expect(changed).toEqual([selected]);
		await fs.unlink(original);
		expect(await new WallpaperStore(profile, () => {}).get()).toEqual(selected);
		const response = await store.respond(request(selected?.url ?? ""));
		expect(response.headers.get("Content-Type")).toBe("image/png");
		expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
		const video = await store.select(await source("loop.mp4", MP4));
		expect(video?.kind).toBe("video");
		expect(await fs.readdir(path.join(profile, "conversation-wallpaper"))).toEqual(
			expect.arrayContaining(["selection.json", wallpaperFileFromUrl(video?.url ?? "")]),
		);
		expect(await store.respond(request(selected?.url ?? ""))).toHaveProperty("status", 404);
		await store.clear();
		expect(await store.get()).toBeNull();
		expect(changed).toEqual([selected, video, null]);
		expect(await fs.readdir(path.join(profile, "conversation-wallpaper"))).toEqual(["selection.json"]);
		expect(await new WallpaperStore(profile, () => {}).get()).toBeNull();
	});

	it("streams exact video ranges, HEAD and 416 responses", async () => {
		const selected = await store.select(await source("loop.mp4", MP4));
		const url = selected?.url ?? "";
		const response = await store.respond(request(url, "bytes=4-11"));
		expect(response.status).toBe(206);
		expect(response.headers.get("Content-Range")).toBe(`bytes 4-11/${MP4.length}`);
		expect(response.headers.get("Content-Length")).toBe("8");
		expect(response.headers.get("Content-Type")).toBe("video/mp4");
		expect(Buffer.from(await response.arrayBuffer())).toEqual(MP4.subarray(4, 12));
		const suffix = await store.respond(request(url, "bytes=-4"));
		expect(Buffer.from(await suffix.arrayBuffer())).toEqual(MP4.subarray(-4));
		const head = await store.respond(request(url, undefined, "HEAD"));
		expect(head.headers.get("Content-Length")).toBe(String(MP4.length));
		expect(await head.text()).toBe("");
		const invalid = await store.respond(request(url, "bytes=999-"));
		expect(invalid.status).toBe(416);
		expect(invalid.headers.get("Content-Range")).toBe(`bytes */${MP4.length}`);
		expect((await store.respond(request(url, undefined, "POST"))).status).toBe(405);
	});

	it("rejects oversized sparse images and videos without replacing the previous media", async () => {
		const previous = await store.select(await source("safe.png"));
		for (const [name, bytes, limit] of [
			["large.png", PNG, WALLPAPER_IMAGE_MAX_BYTES],
			["large.mp4", MP4, WALLPAPER_VIDEO_MAX_BYTES],
		] as const) {
			const file = await source(name, bytes);
			await fs.truncate(file, limit + 1);
			await expect(store.select(file)).rejects.toThrow(/limit/);
		}
		await expect(store.select(await source("fake.png", Buffer.from("not an image")))).rejects.toThrow(/Unsupported/);
		expect(await store.get()).toEqual(previous);
		expect(changed).toEqual([previous]);
	});

	it("keeps the old selection and removes uncommitted media if atomic manifest replacement fails", async () => {
		const previous = await store.select(await source("safe.png"));
		const root = path.join(profile, "conversation-wallpaper");
		const manifest = path.join(root, "selection.json");
		await fs.rename(manifest, `${manifest}.saved`);
		await fs.mkdir(manifest);
		await expect(store.select(await source("new.mp4", MP4))).rejects.toThrow();
		expect(await store.get()).toEqual(previous);
		expect(changed).toEqual([previous]);
		expect((await fs.readdir(root)).filter(file => file.endsWith(".mp4") || file.endsWith(".tmp"))).toEqual([]);
		await fs.rmdir(manifest);
		await fs.rename(`${manifest}.saved`, manifest);
		expect(await new WallpaperStore(profile, () => {}).get()).toEqual(previous);
	});

	it("refuses source and owned-media symlinks", async () => {
		const original = await source("original.png");
		const link = path.join(directory, "link.png");
		await fs.symlink(original, link);
		await expect(store.select(link)).rejects.toThrow();
		const selected = await store.select(original);
		const owned = path.join(profile, "conversation-wallpaper", wallpaperFileFromUrl(selected?.url ?? "") ?? "");
		await fs.unlink(owned);
		await fs.symlink(original, owned);
		expect((await store.respond(request(selected?.url ?? ""))).status).toBe(404);
		expect(await new WallpaperStore(profile, () => {}).get()).toBeNull();
		expect(await fs.readFile(original)).toEqual(PNG);
	});

	it("refuses a symlinked profile media directory", async () => {
		await fs.mkdir(profile);
		await fs.symlink(directory, path.join(profile, "conversation-wallpaper"), "dir");
		await expect(store.get()).rejects.toThrow(/Unsafe/);
	});

	it("ignores a malicious manifest and does not remove unrelated profile files", async () => {
		const root = path.join(profile, "conversation-wallpaper");
		await fs.mkdir(root, { recursive: true });
		await fs.writeFile(
			path.join(root, "selection.json"),
			JSON.stringify({ file: "../../secret.png", name: "unsafe" }),
		);
		await fs.writeFile(path.join(root, "unrelated.txt"), "keep");
		expect(await store.get()).toBeNull();
		expect(await fs.readFile(path.join(root, "unrelated.txt"), "utf8")).toBe("keep");
	});
});
