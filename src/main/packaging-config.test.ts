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

	it("registers the omp:// scheme that src/main/deep-link.ts handles", () => {
		for (const { file, config } of configs) {
			const schemes = (config.protocols ?? []).flatMap(protocol => protocol.schemes ?? []);
			expect(schemes, `${file} ships no URL scheme`).toContain("omp");
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
		const plistPath = path.join(directory, "WISA STUDIO.app", "Contents", "Info.plist");
		const loopback = { NSExceptionAllowsInsecureHTTPLoads: true };
		const original: PlistObject = {
			CFBundleIdentifier: "sh.omp.gui",
			CFBundleURLTypes: [{ CFBundleURLSchemes: ["omp"] }],
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
 * `productName` is "WISA STUDIO" — a space in an artifact name becomes a space
 * in the release URL and in the asset name the updater looks for. Every target
 * therefore pins an explicit, space-free name instead of letting electron-builder
 * derive one from productName.
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
			expect(config.productName, `${file} names no productName`).toBe("WISA STUDIO");
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
		expect(config.nsis?.shortcutName).toBe("WISA STUDIO");
	});
});

describe("Windows package config", () => {
	it("ships a Windows sidecar and both x64 installer targets", () => {
		const file = "electron-builder.win.yml";
		const config = parse(fs.readFileSync(path.join(PACKAGE_ROOT, file), "utf8")) as BuilderConfig;
		expect(
			config.protocols?.flatMap(protocol => protocol.schemes ?? []),
			`${file} ships no URL scheme`,
		).toContain("omp");
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
		expect(sources("img-src")).toEqual(["'self'", "data:", "blob:"]);
	});

	it("keeps script execution and network calls inside the app", () => {
		expect(sources("script-src")).toEqual(["'self'"]);
		expect(sources("connect-src")).toEqual(["'self'"]);
	});
});
