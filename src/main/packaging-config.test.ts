/**
 * Mac bundle config contract. Every mac variant ships its own electron-builder
 * file, so a key the built Info.plist depends on can exist in one and be missing
 * in another — which is how `omp://` deep links came to be dead code in every
 * installed build.
 */
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { type PlistObject, parsePlistFile, savePlistFile } from "app-builder-lib/out/util/plist";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface BuilderConfig {
	afterPack?: string;
	productName?: string;
	extraResources?: { from: string; to: string }[];
	protocols?: { name: string; schemes?: string[] }[];
	mac?: {
		artifactName?: string;
		extendInfo?: Record<string, unknown>;
		hardenedRuntime?: boolean;
		entitlements?: string;
		entitlementsInherit?: string;
	};
	win?: { target?: { target?: string; arch?: string[] }[] };
	dmg?: { artifactName?: string };
	appImage?: { artifactName?: string };
	/** Anything else the file declares at the root, so a bad key is visible. */
	[extra: string]: unknown;
	nsis?: { artifactName?: string; shortcutName?: string };
	portable?: { artifactName?: string };
	deb?: { artifactName?: string };
}

const PACKAGE_ROOT = path.join(__dirname, "..", "..");
const require = createRequire(import.meta.url);

type AfterPackHook = (context: { electronPlatformName: string; appOutDir: string }) => Promise<void>;

const PRIVACY_KEYS = [
	"NSMicrophoneUsageDescription",
	"NSCameraUsageDescription",
	"NSBluetoothAlwaysUsageDescription",
	"NSBluetoothPeripheralUsageDescription",
];

function macConfigs(): { file: string; config: BuilderConfig }[] {
	// .trial.yml configs are gitignored personal overrides — see .gitignore.
	// They exist on some checkouts and not others, so they can't be part of
	// the committed-config contract.
	return fs
		.readdirSync(PACKAGE_ROOT)
		.filter(name => /^electron-builder.*\.yml$/.test(name) && !name.endsWith(".trial.yml"))
		.map(file => ({
			file,
			config: parse(fs.readFileSync(path.join(PACKAGE_ROOT, file), "utf8")) as BuilderConfig,
		}))
		.filter(entry => entry.config.mac);
}

describe("mac bundle configs", () => {
	const configs = macConfigs();

	it("sees every builder variant sitting in the package root", () => {
		// The guards below iterate this list, so discovery is itself a contract: a
		// fourth variant must not slip past them unnoticed.
		expect(
			configs
				.map(entry => entry.file)
				.sort()
				.join(","),
		).toBe("electron-builder.x64.yml,electron-builder.yml");
	});

	it("registers the wisa-studio:// scheme that src/main/deep-link.ts handles", () => {
		for (const { file, config } of configs) {
			const schemes = (config.protocols ?? []).flatMap(protocol => protocol.schemes ?? []);
			expect(schemes, `${file} ships no URL scheme`).toContain("wisa-studio");
		}
	});

	it("names the app in every privacy prompt the bundle can trigger", () => {
		for (const { file, config } of configs) {
			const info = config.mac?.extendInfo ?? {};
			const productName = config.productName;
			expect(productName, `${file} names no productName`).toBeTruthy();
			for (const key of PRIVACY_KEYS) {
				const value = info[key];
				// Electron's own default reads "This app needs access to the camera":
				// a prompt that names no product and claims a capability the app never
				// uses. The expected name comes from the config, so renaming the product
				// cannot leave a stale prompt behind.
				expect(typeof value, `${file} → ${key}`).toBe("string");
				expect(value as string, `${file} → ${key}`).toContain(productName ?? "");
			}
		}
	});

	it("lets the hardened runtime open the microphone the dictation prompt asks for", async () => {
		// Hardened runtime blocks the microphone unless the signature carries this exact key;
		// a near miss (com.apple.security.audio-input) signs fine and silently denies dictation.
		for (const { file, config } of configs) {
			if (config.mac?.hardenedRuntime === false) continue;
			for (const entitlements of [config.mac?.entitlements, config.mac?.entitlementsInherit]) {
				expect(entitlements, `${file} names no entitlements`).toBeDefined();
				const plist = await parsePlistFile<PlistObject>(path.join(PACKAGE_ROOT, entitlements ?? ""));
				expect(plist["com.apple.security.device.audio-input"], `${file} → ${entitlements}`).toBe(true);
			}
		}
	});

	it("ships an explicit transport policy that leaves ATS on and excepts loopback", () => {
		for (const { file, config } of configs) {
			const info = config.mac?.extendInfo ?? {};
			// A stray NSAllowsArbitraryLoads in any variant turns TLS enforcement
			// off app-wide; the stats server is the only cleartext origin, and it is
			// local. Pin both halves instead of trusting the default.
			expect(info.NSAppTransportSecurity, `${file} declares no transport policy`).toMatchObject({
				NSAllowsArbitraryLoads: false,
				NSAllowsLocalNetworking: true,
			});
		}
	});

	it("restores ATS in the completed bundle after electron-builder enables arbitrary loads", async () => {
		const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "omp-bundle-policy-"));
		// Named after productName, not a literal: the hook resolves the single
		// `.app` in appOutDir, and this fixture proves it finds that name.
		const plistPath = path.join(directory, "Wisa.app", "Contents", "Info.plist");
		const loopback = { NSExceptionAllowsInsecureHTTPLoads: true };
		const original: PlistObject = {
			CFBundleIdentifier: "org.wisa.studio",
			CFBundleURLTypes: [{ CFBundleURLSchemes: ["wisa-studio"] }],
			NSAppTransportSecurity: {
				NSAllowsArbitraryLoads: true,
				NSAllowsLocalNetworking: true,
				NSExceptionDomains: { localhost: loopback, "127.0.0.1": loopback },
			},
		};
		try {
			await fs.promises.mkdir(path.dirname(plistPath), { recursive: true });
			for (const { file, config } of configs) {
				await savePlistFile(plistPath, original);
				const hookPath = config.afterPack;
				expect(hookPath, `${file} declares no afterPack policy hook`).toBe("scripts/after-pack.cjs");
				if (!hookPath) continue;
				const afterPack = require(path.resolve(PACKAGE_ROOT, hookPath)).afterPack as AfterPackHook;
				await afterPack({ electronPlatformName: "darwin", appOutDir: directory });
				expect(await parsePlistFile(plistPath), `${file} leaves arbitrary loads enabled in the bundle`).toEqual({
					...original,
					NSAppTransportSecurity: {
						NSAllowsArbitraryLoads: false,
						NSAllowsLocalNetworking: true,
						NSExceptionDomains: { localhost: loopback, "127.0.0.1": loopback },
					},
				});
			}
		} finally {
			await fs.promises.rm(directory, { recursive: true, force: true });
		}
	});
});

/**
 * Keep release asset URLs independent of the display name. Every target pins
 * an explicit, space-free name instead of deriving one from productName.
 */
describe("release artifact names", () => {
	/**
	 * What each config actually produces, with the key that names it. Listed per
	 * file rather than collected from whatever is present: a missing name must
	 * fail, not drop out of the assertion. The zip target has no section of its
	 * own in electron-builder 26 — it takes the mac-level name.
	 *
	 * electron-builder.yml also declares `win:` targets, but nothing builds them
	 * from that file (CI runs `--linux AppImage deb`), so they are not listed.
	 */
	const EXPECTED: Record<string, [string, (config: BuilderConfig) => string | undefined][]> = {
		"electron-builder.yml": [
			["dmg", config => config.dmg?.artifactName],
			["mac zip", config => config.mac?.artifactName],
			["deb", config => config.deb?.artifactName],
			["appImage", config => config.appImage?.artifactName],
		],
		"electron-builder.x64.yml": [
			["dmg", config => config.dmg?.artifactName],
			["mac zip", config => config.mac?.artifactName],
		],
		"electron-builder.win.yml": [
			["nsis", config => config.nsis?.artifactName],
			["portable", config => config.portable?.artifactName],
		],
	};

	it("pins a space-free artifact name for every target it builds", () => {
		for (const [file, targets] of Object.entries(EXPECTED)) {
			const config = parse(fs.readFileSync(path.join(PACKAGE_ROOT, file), "utf8")) as BuilderConfig;
			expect(config.productName, `${file} names no productName`).toBe("Wisa");
			for (const [target, read] of targets) {
				const name = read(config);
				expect(name, `${file} pins no artifact name for ${target}`).toBeTypeOf("string");
				// Substituting the variables is what exposes a productName-derived
				// name: "WISA.STUDIO-0.9.46.AppImage" fails the character check.
				expect(name!.replace(/\$\{\w+\}/g, "x"), `${file} → ${target}`).toMatch(/^[A-Za-z0-9._-]+$/);
			}
		}
	});

	/**
	 * electron-builder 26 validates the whole config before building and rejects
	 * any unknown root key, so a stray `zip:` section aborts packaging outright
	 * (observed: "configuration has an unknown property 'zip'"). The zip target's
	 * name lives on `mac.artifactName`; assert the bad key cannot come back.
	 */
	it("declares no root-level key electron-builder rejects", () => {
		for (const file of ["electron-builder.yml", "electron-builder.x64.yml", "electron-builder.win.yml"]) {
			const config = parse(fs.readFileSync(path.join(PACKAGE_ROOT, file), "utf8")) as BuilderConfig;
			expect(config.zip, `${file} declares a root zip section`).toBeUndefined();
		}
	});

	it("pins the Windows shortcut to the display name", () => {
		const config = parse(
			fs.readFileSync(path.join(PACKAGE_ROOT, "electron-builder.win.yml"), "utf8"),
		) as BuilderConfig;
		expect(config.nsis?.shortcutName).toBe("Wisa");
	});
});

describe("Windows package config", () => {
	it("ships a Windows sidecar and both x64 installer targets", () => {
		const file = "electron-builder.win.yml";
		const config = parse(fs.readFileSync(path.join(PACKAGE_ROOT, file), "utf8")) as BuilderConfig;
		expect(
			config.protocols?.flatMap(protocol => protocol.schemes ?? []),
			`${file} ships no URL scheme`,
		).toContain("wisa-studio");
		expect(config.extraResources).toContainEqual({ from: "resources/omp.exe", to: "omp.exe" });
		expect(config.win?.target).toEqual([
			{ target: "nsis", arch: ["x64"] },
			{ target: "portable", arch: ["x64"] },
		]);
	});
});

/**
 * The shipped renderer cannot initiate a network request from an image tag.
 * Explicit image loads use the main-process image handler instead.
 */
describe("renderer content security policy", () => {
	function sources(directive: string): string[] {
		const html = fs.readFileSync(path.join(PACKAGE_ROOT, "src/renderer/index.html"), "utf8");
		const content = /http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/.exec(html)?.[1];
		if (!content) throw new Error("index.html declares no Content-Security-Policy");
		const entry = content
			.split(";")
			.map(part => part.trim())
			.find(part => part.split(" ")[0] === directive);
		if (!entry) throw new Error(`CSP declares no ${directive}`);
		return entry.split(" ").slice(1);
	}

	it("cannot fetch a remote image for markdown a model wrote", () => {
		// Explicit, not inherited: without img-src the policy falls back to
		// default-src, and a later relaxation there would silently re-open this.
		expect(sources("img-src")).toEqual(["'self'", "data:", "blob:", "wisa-wallpaper:"]);
	});

	it("keeps script execution and network calls inside the app", () => {
		expect(sources("script-src")).toEqual(["'self'"]);
		expect(sources("connect-src")).toEqual(["'self'"]);
	});
});

/**
 * The download buttons are the only path a visitor has to the app, so a link
 * that 404s costs the release. macOS is not built by CI, which is how every
 * button came to point at a versioned path for an asset that did not exist yet.
 */
describe("download links", () => {
	const SITE = path.join(PACKAGE_ROOT, "site/index.html");

	function anchors(html: string): { href: string; attributes: string }[] {
		return [...html.matchAll(/<a\b([^>]*)>/g)].map(match => ({
			attributes: match[1],
			href: /\bhref="([^"]*)"/.exec(match[1])?.[1] ?? "",
		}));
	}

	it("never hardcodes a versioned asset path in the page", () => {
		const html = fs.readFileSync(SITE, "utf8");
		const versioned = anchors(html).filter(anchor => /\/releases\/download\/v\d/.test(anchor.href));
		expect(versioned.map(anchor => anchor.href)).toEqual([]);
	});

	it("points every download button at a URL that exists before any asset does", () => {
		const html = fs.readFileSync(SITE, "utf8");
		const buttons = anchors(html).filter(anchor => /data-omp-(dmg|win|linux)/.test(anchor.attributes));
		expect(buttons.length).toBeGreaterThan(0);
		for (const button of buttons) {
			// /releases/latest is a page GitHub always serves; the inline script
			// swaps in the exact asset URL once the release resolves.
			expect(button.href, button.attributes).toBe("https://github.com/smokeyduck/wisa-studio/releases/latest");
		}
	});

	it("links only assets the README claims exist", () => {
		// Direct asset links may only name Windows/Linux, which CI builds. A macOS
		// link would 404 until someone packages on a Mac and attaches the DMG.
		for (const file of ["README.md", "README.en.md"]) {
			const text = fs.readFileSync(path.join(PACKAGE_ROOT, file), "utf8");
			const direct = [...text.matchAll(/releases\/download\/[^)\s]+/g)].map(match => match[0]);
			expect(
				direct.filter(url => /\.dmg$/.test(url)),
				`${file} links a DMG directly`,
			).toEqual([]);
		}
	});
});

/**
 * The dev-only Agentation overlay must never reach a user's window. It is a
 * visual feedback toolbar with its own global key handlers (Cmd/Ctrl+Shift+F)
 * and a 4 MB payload; it is wired behind `import.meta.env.DEV`, and this guards
 * the two ways that could regress — a plain import, or the gate being removed.
 */
describe("dev-only Agentation overlay", () => {
	const app = fs.readFileSync(path.join(PACKAGE_ROOT, "src/renderer/App.tsx"), "utf8");
	const devDir = path.join(PACKAGE_ROOT, "src/renderer/dev");

	it("is only imported behind the build-time DEV flag", () => {
		// A bare `import ... from "agentation"` (or from ./dev/DevAgentation)
		// would put the overlay in the production bundle.
		const eager = /^\s*import\s[^\n]*["'](?:agentation|\.\/dev\/DevAgentation)["']/m.test(app);
		expect(eager).toBe(false);
		expect(app).toMatch(/import\.meta\.env\.DEV\s*\n?\s*\?[^:]*import\("\.\/dev\/DevAgentation"\)/);
	});

	it("keeps the package import inside the dev directory", () => {
		const offenders = fs
			.readdirSync(path.join(PACKAGE_ROOT, "src/renderer"), { recursive: true, encoding: "utf8" })
			.filter(name => name.endsWith(".ts") || name.endsWith(".tsx"))
			.filter(name => !name.startsWith("dev/") && !name.includes(".test."))
			.filter(name =>
				/from\s+["']agentation["']/.test(fs.readFileSync(path.join(PACKAGE_ROOT, "src/renderer", name), "utf8")),
			);
		expect(offenders).toEqual([]);
		expect(fs.existsSync(path.join(devDir, "DevAgentation.tsx"))).toBe(true);
	});
});

/**
 * The brand mark is one artwork file (`resources/icon-source.png`) that every
 * generated icon derives from, and `scripts/gen-icons.ts` is the only writer.
 * The failure this guards is silent: the dock, the tray and the window quietly
 * keeping an older mark because a generated file was hand-edited or a source
 * was swapped back to the π artwork.
 */
describe("brand icon pipeline", () => {
	const source = path.join(PACKAGE_ROOT, "resources", "icon-source.png");
	const generated = [
		"resources/icon.png",
		"resources/icon.ico",
		"resources/icon.icns",
		"resources/icons/16x16.png",
		"resources/icons/1024x1024.png",
		"src/renderer/public/wisa-icon-32.png",
		"src/main/tray-mark.ts",
	];

	it("ships the artwork and every icon generated from it", () => {
		for (const file of [source, ...generated.map(name => path.join(PACKAGE_ROOT, name))]) {
			expect(fs.existsSync(file), `${path.relative(PACKAGE_ROOT, file)} is missing`).toBe(true);
		}
	});

	it("keeps the π artwork out of the icon sources", () => {
		// The old mark shipped as a vector source; a stray copy would let a future
		// regeneration quietly restore it.
		for (const name of ["icon.svg", "icon-source.svg"]) {
			expect(fs.existsSync(path.join(PACKAGE_ROOT, "resources", name)), `resources/${name} came back`).toBe(false);
		}
	});

	it("generates the menu-bar mark from the same artwork", () => {
		const module = fs.readFileSync(path.join(PACKAGE_ROOT, "src/main/tray-mark.ts"), "utf8");
		expect(module).toMatch(/export const TRAY_MARK_PNG_BASE64 =\s*"[A-Za-z0-9+/=]{500,}";/);
		const tray = fs.readFileSync(path.join(PACKAGE_ROOT, "src/main/tray.ts"), "utf8");
		expect(tray).toMatch(/TRAY_MARK_PNG_BASE64/);
		// The π was drawn by hand here; that code must not return.
		expect(tray).not.toMatch(/fillRoundedRect/);
	});
});
