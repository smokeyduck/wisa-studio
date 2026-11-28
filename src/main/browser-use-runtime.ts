import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const releasesUrl = "https://api.github.com/repos/browser-use/browser-use/releases/latest";
const versionPattern = /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})$/;
const windows = process.platform === "win32";

interface Manifest {
	version: string;
	executable: string;
}

export interface BrowserUseInstallation {
	version: string;
	packages: string;
}

function readObject(path: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
	} catch {
		// An incomplete or unreadable local installation does not replace the seed.
	}
	return undefined;
}

function manifest(root: string): Manifest | undefined {
	const data = readObject(join(root, "version.json"));
	if (typeof data?.version !== "string" || !versionPattern.test(data.version) || typeof data.executable !== "string")
		return undefined;
	const executable = join(root, data.executable);
	const rel = relative(root, executable);
	if (!rel || isAbsolute(data.executable) || rel.split(/[\\/]/)[0] !== "chromium" || !existsSync(executable))
		return undefined;
	return { version: data.version, executable };
}

function newer(candidate: string, installed: string): boolean {
	const old = installed.split(".").map(Number);
	for (const [i, part] of candidate.split(".").entries()) {
		const difference = Number(part) - old[i];
		if (difference !== 0) return difference > 0;
	}
	return false;
}

function minimalEnvironment(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	const keys = windows
		? ["SYSTEMROOT", "WINDIR", "SYSTEMDRIVE", "COMSPEC"]
		: ["DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS", "LANG", "LC_ALL"];
	for (const key of keys) {
		const value = process.env[key];
		if (value !== undefined) env[key] = value;
	}
	env.PATH = windows ? join(env.SYSTEMROOT || "C:\\Windows", "System32") : "/usr/bin:/bin:/usr/sbin:/sbin";
	return env;
}

function privateEnvironment(directory: string): NodeJS.ProcessEnv {
	return {
		...minimalEnvironment(),
		HOME: directory,
		USERPROFILE: directory,
		APPDATA: directory,
		LOCALAPPDATA: directory,
		XDG_CONFIG_HOME: directory,
		XDG_CACHE_HOME: directory,
		XDG_DATA_HOME: directory,
		TMP: directory,
		TEMP: directory,
		TMPDIR: directory,
	};
}

interface UpdateServices {
	release(signal: AbortSignal): Promise<string | undefined>;
	install(options: { uv: string; python: string; directory: string; version: string; signal: AbortSignal }): Promise<void>;
	check(options: { python: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string; signal: AbortSignal }): Promise<string>;
}

const updateServices: UpdateServices = {
	async release(signal) {
		const response = await fetch(releasesUrl, {
			signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
			headers: { Accept: "application/vnd.github+json", "User-Agent": "WISA-Studio-Browser-Use" },
		});
		if (!response.ok) throw new Error(`Browser Use release check failed: HTTP ${response.status}`);
		const release = (await response.json()) as { tag_name?: unknown; prerelease?: boolean; draft?: boolean };
		return !release.prerelease && !release.draft && typeof release.tag_name === "string"
			? release.tag_name.replace(/^v/, "")
			: undefined;
	},
	async install({ uv, python, directory, version, signal }) {
		await exec(uv, ["--no-config", "pip", "install", "--python", python, "--no-cache", "--index-url",
			"https://pypi.org/simple", "--only-binary", ":all:", "--target", join(directory, "packages"),
			`browser-use==${version}`], {
			cwd: directory,
			env: privateEnvironment(directory),
			signal,
			timeout: 180_000,
			windowsHide: true,
		});
	},
	async check({ python, args, env, cwd, signal }) {
		return (await exec(python, args, { env, cwd, signal, timeout: 55_000, windowsHide: true })).stdout;
	},
};

export class BrowserUseRuntime {
	#seed: Manifest | undefined;
	#python: string;
	#script: string;
	#uv: string;
	#updateRoot: string;
	#current: BrowserUseInstallation | undefined;
	#update: Promise<string | undefined> | undefined;
	#abort = new AbortController();
	#services: UpdateServices;

	constructor(resources: string, data: string, services = updateServices) {
		const root = join(resources, "browser-use");
		this.#seed = manifest(root);
		this.#python = windows ? join(root, "python", "python.exe") : join(root, "python", "bin", "python3");
		this.#script = join(resources, "browser-use-bridge.py");
		this.#uv = join(root, windows ? "uv.exe" : "uv");
		this.#updateRoot = join(data, "browser-use");
		this.#services = services;
		if (!this.#seed || !existsSync(this.#python) || !existsSync(this.#script) || !existsSync(join(root, "packages")))
			return;
		this.#current = { version: this.#seed.version, packages: join(root, "packages") };
		const active = readObject(join(this.#updateRoot, "current.json"));
		if (typeof active?.version !== "string" || !versionPattern.test(active.version) ||
			typeof active.id !== "string" || !/^build-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(active.id) ||
			!newer(active.version, this.#current.version)) return;
		const packages = join(this.#updateRoot, active.id, "packages");
		if (existsSync(join(packages, `browser_use-${active.version}.dist-info`, "METADATA")))
			this.#current = { version: active.version, packages };
	}

	get current(): BrowserUseInstallation | undefined {
		return this.#current;
	}

	#worker(installation: BrowserUseInstallation, directory: string) {
		if (!this.#seed) throw new Error("Browser Use is missing. Reinstall Wisa.");
		return {
			python: this.#python,
			args: ["-s", "-P", "-B", "-X", "utf8", this.#script, this.#seed.executable],
			env: {
				...privateEnvironment(directory),
				PYTHONPATH: installation.packages,
				PYTHON_DOTENV_DISABLED: "1",
				ANONYMIZED_TELEMETRY: "false",
				BROWSER_USE_AUTO_LOGIN: "false",
				BROWSER_USE_SETUP_LOGGING: "false",
				BROWSER_USE_CONFIG_DIR: join(directory, "config"),
				BH_HOME: join(directory, "harness"),
				BH_RUNTIME_DIR: join(directory, "ipc"),
				BH_TMP_DIR: join(directory, "harness"),
			},
		};
	}

	#privateDirectory() {
		// AF_UNIX limits the socket path to 104 bytes on macOS. The random
		// directory is private; never discover an existing browser daemon.
		return mkdtempSync(join(windows ? tmpdir() : "/tmp", "wisa-bu-"));
	}

	spawn(installation: BrowserUseInstallation) {
		const cwd = this.#privateDirectory();
		try {
			const { python, args, env } = this.#worker(installation, cwd);
			const child = spawn(python, args, { cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
			child.once("close", () => void rm(cwd, { recursive: true, force: true }).catch(() => {}));
			return child;
		} catch (error) {
			void rm(cwd, { recursive: true, force: true }).catch(() => {});
			throw error;
		}
	}

	/** Keep a validated installation immutable: an already opened tab pins its own package path. */
	checkForUpdate(): Promise<string | undefined> {
		this.#update ??= this.#checkForUpdate().finally(() => { this.#update = undefined; });
		return this.#update;
	}

	async #checkForUpdate(): Promise<string | undefined> {
		if (!this.#current || !existsSync(this.#uv)) return undefined;
		const signal = this.#abort.signal;
		const version = await this.#services.release(signal);
		if (!version || !versionPattern.test(version) || !newer(version, this.#current.version)) return undefined;
		await mkdir(this.#updateRoot, { recursive: true, mode: 0o700 });
		const staging = await mkdtemp(join(this.#updateRoot, "staging-"));
		const id = `build-${randomUUID()}`;
		const ready = join(this.#updateRoot, id);
		const pointer = join(this.#updateRoot, `${id}.json`);
		let activated = false;
		try {
			await this.#services.install({ uv: this.#uv, python: this.#python, directory: staging, version, signal });
			const cwd = this.#privateDirectory();
			try {
				const worker = this.#worker({ version, packages: join(staging, "packages") }, cwd);
				const result = await this.#services.check({ ...worker, args: [...worker.args, version], cwd, signal });
				const reply = JSON.parse(result) as { version?: unknown } | null;
				if (reply?.version !== version)
					throw new Error("Browser Use returned an invalid installation check response");
			} finally {
				await rm(cwd, { recursive: true, force: true }).catch(() => {});
			}
			signal.throwIfAborted();
			await rename(staging, ready);
			await writeFile(pointer, JSON.stringify({ version, id }), { mode: 0o600, flag: "wx" });
			await rename(pointer, join(this.#updateRoot, "current.json"));
			activated = true;
			this.#current = { version, packages: join(ready, "packages") };
			return version;
		} finally {
			if (!activated) await Promise.all([staging, ready, pointer].map(path => rm(path, { recursive: true, force: true }).catch(() => {})));
		}
	}

	dispose(): void {
		this.#abort.abort();
	}
}
