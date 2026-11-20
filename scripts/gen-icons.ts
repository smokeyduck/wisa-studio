/**
 * Generate every app icon from one artwork file: `resources/icon-source.png`,
 * the WISA ribbon on its navy tile (512px, alpha outside the rounded plate).
 *
 * Outputs, all from that single source so the dock, the tray, the window and
 * the installers can never drift apart:
 *
 * - `resources/icon.png` — 1024px master (dev dock icon, Linux base).
 * - `resources/icons/*.png` — the freedesktop size set.
 * - `resources/icon.ico` — Windows, PNG-in-ICO at six sizes.
 * - `resources/icon.icns` — macOS, written here byte by byte.
 * - `src/renderer/public/wisa-icon-*.png` — the renderer favicon.
 * - `src/main/tray-mark.ts` — the menu-bar silhouette (see `trayMark`).
 *
 * The .icns used to require `iconutil`, which only exists on macOS, so the
 * checked-in file could only be regenerated on a Mac. ICNS is a plain container
 * of PNG chunks, so this script writes it directly and the icons are
 * reproducible on any platform. Run: `bun run gen:icons`.
 *
 * The mark is raster, so every size is a Lanczos downscale of one 1024px master
 * (never a re-encode of an already-shrunk copy). The plate is scaled to
 * PLATE_SCALE of the canvas first: the source artwork is full-bleed, and an
 * icon that touches the edge of its tile reads as oversized in the dock, the
 * taskbar and the Windows start menu.
 */

import { writeFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import sharp from "sharp";

const resources = path.join(import.meta.dir, "..", "resources");
const sourcePath = path.join(resources, "icon-source.png");

/** The artwork's share of the canvas; the rest is transparent margin. */
const PLATE_SCALE = 0.86;
const MASTER = 1024;

const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

/**
 * The macOS icon set. Each entry is one PNG chunk inside the .icns; `@2x`
 * variants carry double the nominal size, so the 16pt slot needs 32px.
 */
const ICNS: [string, number][] = [
	["ic07", 128],
	["ic08", 256],
	["ic09", 512],
	["ic10", 1024],
	["ic11", 32],
	["ic12", 64],
	["ic13", 256],
	["ic14", 512],
];

/** The 1024px master: the plate centered on a transparent square. */
async function master(): Promise<Buffer> {
	const plate = await sharp(sourcePath)
		.resize(Math.round(MASTER * PLATE_SCALE), Math.round(MASTER * PLATE_SCALE), {
			fit: "contain",
			background: { r: 0, g: 0, b: 0, alpha: 0 },
			kernel: "lanczos3",
		})
		.png()
		.toBuffer();
	return sharp({
		create: {
			width: MASTER,
			height: MASTER,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	})
		.composite([{ input: plate, gravity: "center" }])
		.png()
		.toBuffer();
}

/** One size, downscaled from the master. */
async function render(base: Buffer, size: number): Promise<Buffer> {
	if (size === MASTER) return base;
	return sharp(base).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
}

/** Windows .ico: a header plus one PNG blob per frame. */
function writeIco(frames: { size: number; data: Buffer }[], outPath: string): void {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(frames.length, 4);
	const entries = Buffer.alloc(16 * frames.length);
	const blobs: Buffer[] = [];
	let offset = header.length + entries.length;
	for (const [index, frame] of frames.entries()) {
		// 0 means "256 or larger" in the single-byte width/height fields.
		const width = frame.size >= 256 ? 0 : frame.size;
		entries.writeUInt8(width, index * 16);
		entries.writeUInt8(width, index * 16 + 1);
		entries.writeUInt16LE(1, index * 16 + 4);
		entries.writeUInt16LE(32, index * 16 + 6);
		entries.writeUInt32LE(frame.data.length, index * 16 + 8);
		entries.writeUInt32LE(offset, index * 16 + 12);
		blobs.push(frame.data);
		offset += frame.data.length;
	}
	writeFileSync(outPath, Buffer.concat([header, entries, ...blobs]));
}

/**
 * macOS .icns: magic + total length, then `type`/`length`/PNG chunks. Every
 * length is big-endian and counts the chunk's own 8-byte header.
 */
function writeIcns(frames: { type: string; data: Buffer }[], outPath: string): void {
	const chunks = frames.map(frame => {
		const header = Buffer.alloc(8);
		header.write(frame.type, 0, 4, "ascii");
		header.writeUInt32BE(frame.data.length + 8, 4);
		return Buffer.concat([header, frame.data]);
	});
	const body = Buffer.concat(chunks);
	const header = Buffer.alloc(8);
	header.write("icns", 0, 4, "ascii");
	header.writeUInt32BE(body.length + 8, 4);
	writeFileSync(outPath, Buffer.concat([header, body]));
}

/**
 * The menu-bar mark: the ribbon alone, as a black silhouette whose alpha is the
 * ribbon shape, so macOS can use it as a template image. Written as a base64 constant into
 * `src/main/tray-mark.ts` because the packaged app ships only the built
 * `out/` tree — a PNG in `resources/` would not exist at runtime, and the tray
 * cannot read a file that is not there.
 */
async function trayMark(): Promise<void> {
	const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const { width, height } = info;
	// The plate is near-black (luma ≈ 19) and the ribbon white/gold (≥ 100), so a
	// ramp between them keeps the antialiased ribbon edge and drops the plate.
	const mask = new Uint8Array(width * height);
	let left = width;
	let top = height;
	let right = -1;
	let bottom = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = (y * width + x) * 4;
			const alpha = data[index + 3] ?? 0;
			const luma = ((data[index] ?? 0) + (data[index + 1] ?? 0) + (data[index + 2] ?? 0)) / 3;
			const value = alpha < 128 ? 0 : Math.round(Math.min(1, Math.max(0, (luma - 70) / 42)) * 255);
			mask[y * width + x] = value;
			if (value > 8) {
				left = Math.min(left, x);
				top = Math.min(top, y);
				right = Math.max(right, x);
				bottom = Math.max(bottom, y);
			}
		}
	}

	// Black RGB with the mask as alpha. macOS reads a template image's alpha
	// alone, and Linux/Windows draw the RGB as-is on a light panel — so black is
	// the one colour that works in all three places.
	const trimmedWidth = right - left + 1;
	const trimmedHeight = bottom - top + 1;
	const pixels = Buffer.alloc(trimmedWidth * trimmedHeight * 4, 0);
	for (let y = 0; y < trimmedHeight; y++) {
		for (let x = 0; x < trimmedWidth; x++) {
			pixels[(y * trimmedWidth + x) * 4 + 3] = mask[(y + top) * width + (x + left)] ?? 0;
		}
	}

	// 18pt status item at 2× — the size macOS asks for on Retina menu bars.
	const size = 36;
	const inner = Math.round(size * 0.9);
	const scale = inner / Math.max(trimmedWidth, trimmedHeight);
	const drawnWidth = Math.max(1, Math.round(trimmedWidth * scale));
	const drawnHeight = Math.max(1, Math.round(trimmedHeight * scale));
	const mark = await sharp(pixels, { raw: { width: trimmedWidth, height: trimmedHeight, channels: 4 } })
		.resize(drawnWidth, drawnHeight, { kernel: "lanczos3" })
		.png()
		.toBuffer();
	const png = await sharp({
		create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
	})
		.composite([{ input: mark, gravity: "center" }])
		.png()
		.toBuffer();

	const module = `/**
 * The WISA ribbon as a menu-bar template image: black pixels, the ribbon shape
 * in the alpha channel, 36×36 (an 18pt status item at 2×). macOS recolours it
 * for the menu bar; Linux and Windows draw the black silhouette.
 *
 * Generated by \`bun run gen:icons\` from resources/icon-source.png — edit that
 * artwork, not this file. It is a base64 constant rather than a PNG on disk
 * because a packaged app ships only the built \`out/\` tree, so nothing in
 * \`resources/\` exists at runtime for the tray to read.
 */

/** PNG bytes of the tray mark, base64. */
export const TRAY_MARK_PNG_BASE64 =
	"${png.toString("base64")}";
`;
	await Bun.write(path.join(import.meta.dir, "..", "src", "main", "tray-mark.ts"), module);
}

async function main(): Promise<void> {
	const base = await master();

	// 1024px master (dev dock icon; the base for everything below).
	await Bun.write(path.join(resources, "icon.png"), base);

	// Linux PNG set.
	const linuxDir = path.join(resources, "icons");
	await fs.mkdir(linuxDir, { recursive: true });
	for (const size of LINUX_SIZES) {
		await Bun.write(path.join(linuxDir, `${size}x${size}.png`), await render(base, size));
	}

	const icoFrames = await Promise.all(ICO_SIZES.map(async size => ({ size, data: await render(base, size) })));
	writeIco(icoFrames, path.join(resources, "icon.ico"));

	const icnsFrames = await Promise.all(ICNS.map(async ([type, size]) => ({ type, data: await render(base, size) })));
	writeIcns(icnsFrames, path.join(resources, "icon.icns"));

	// The renderer's copy of the artwork: the favicon in `public/`, and the badge
	// that components/common/WisaLogo.tsx renders (Vite hashes it into assets/).
	// Both come from the master so the window can never show an older mark.
	const assetDir = path.join(import.meta.dir, "..", "src", "renderer", "assets");
	await fs.mkdir(assetDir, { recursive: true });
	// 512px: the mark renders at 56–72px, so this is 4× even on a Retina display.
	await Bun.write(path.join(assetDir, "wisa-badge.png"), await render(base, 512));
	const publicDir = path.join(import.meta.dir, "..", "src", "renderer", "public");
	await fs.mkdir(publicDir, { recursive: true });
	for (const size of [32, 64]) {
		await Bun.write(path.join(publicDir, `wisa-icon-${size}.png`), await render(base, size));
	}

	console.log("Generated icon.png, icon.icns, icon.ico and resources/icons/*.png from icon-source.png");
	await trayMark();
	console.log("Wrote src/main/tray-mark.ts");
}

await main();
