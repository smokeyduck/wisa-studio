/**
 * Piper: a neural (VITS) voice, run locally.
 *
 * The platform engines are a mixed bag. macOS `say` and Windows SAPI ship
 * neural voices and sound natural; Linux usually has only `espeak-ng`, a
 * formant synthesizer — it pronounces Vietnamese correctly and sounds like a
 * machine. Piper is the offline neural engine that fixes that: a 25 MB binary
 * and a 63 MB voice, both pinned and checksum-verified here, run at roughly
 * 8× real time (a six-second sentence synthesizes in 0.8 s).
 *
 * Only Vietnamese is wired up: `detectSpeechLanguage` sends English to the
 * sidecar's own Phonon model, so `vi` is the one language with no neural
 * engine behind it. Adding a language means one more {@link PIPER_VOICES}
 * entry; nothing else changes.
 *
 * Everything is fetched into the user-data directory on first use and reused
 * afterwards. A failed download is remembered (three attempts, like the
 * dictation warm-up) so an offline machine does not retry 90 MB on every
 * launch — the caller falls back to the platform engine instead.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";

const run = promisify(execFile);

/** rhasspy/piper 2023.11.14-2 — the last release with a self-contained tarball per platform. */
const RELEASE = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2";

interface PiperBuild {
	asset: string;
	sha256: string;
	/** Executable path inside the extracted archive. */
	exec: string;
}

const BUILDS: Partial<Record<NodeJS.Platform, Partial<Record<NodeJS.Architecture, PiperBuild>>>> = {
	linux: {
		x64: {
			asset: "piper_linux_x86_64.tar.gz",
			sha256: "a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992",
			exec: "piper",
		},
		arm64: {
			asset: "piper_linux_aarch64.tar.gz",
			sha256: "fea0fd2d87c54dbc7078d0f878289f404bd4d6eea6e7444a77835d1537ab88eb",
			exec: "piper",
		},
	},
	darwin: {
		arm64: {
			asset: "piper_macos_aarch64.tar.gz",
			sha256: "6b1eb03b3735946cb35216e063e7eebcc33a6bbf5dd96ec0217959bf1cdcb0cc",
			exec: "piper",
		},
		x64: {
			asset: "piper_macos_x64.tar.gz",
			sha256: "ced85c0a3df13945b1e623b878a48fdc2854d5c485b4b67f62857cf551deaf8b",
			exec: "piper",
		},
	},
	win32: {
		x64: {
			asset: "piper_windows_amd64.zip",
			sha256: "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea",
			exec: "piper.exe",
		},
	},
};

interface PiperVoice {
	/** File name stem inside `rhasspy/piper-voices`; the `.onnx` and `.onnx.json` sit beside it. */
	model: string;
	url: string;
	onnxSha256: string;
	configSha256: string;
}

/**
 * vais1000 (medium, 22.05 kHz) — a Vietnamese corpus read by one speaker,
 * CC-BY 4.0 (see NOTICE). `huayan`/`irina`/`tsync2` exist for the other
 * shipped locales but stay unused while only Vietnamese needs a neural voice.
 */
const PIPER_VOICES: Partial<Record<string, PiperVoice>> = {
	vi: {
		model: "vi_VN-vais1000-medium",
		url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium",
		onnxSha256: "ec7c89e2c85f4d1edc24b6120c18aaf1bda614f06b511567eb9c7c0de15e2dab",
		configSha256: "fafb9da1354ed4b77c31af228ed41fb41cd825c14cffa105454b25e6ae751ee0",
	},
};

const MAX_ATTEMPTS = 3;
/** A download that has not finished by then is treated as a failure. */
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

interface PiperEngine {
	exec: string;
	model: string;
}

/** One in-flight preparation per language, so two utterances do not fetch twice. */
const preparing = new Map<string, Promise<PiperEngine | null>>();

function rootDir(): string {
	return path.join(app.getPath("userData"), "piper");
}

function buildDir(build: PiperBuild): string {
	return path.join(rootDir(), build.asset.replace(/\.(tar\.gz|zip)$/, ""));
}

function voiceDir(voice: PiperVoice): string {
	return path.join(rootDir(), voice.model);
}

function attemptsPath(): string {
	return path.join(rootDir(), "attempts");
}

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/** Fetch one file and verify it against its pinned digest; a mismatch is a hard failure. */
async function fetchVerified(url: string, expected: string, signal?: AbortSignal): Promise<Uint8Array> {
	const response = await fetch(url, { signal, redirect: "follow" });
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const actual = sha256(bytes);
	if (actual !== expected) throw new Error(`${url}: checksum ${actual} != ${expected}`);
	return bytes;
}

async function download(url: string, expected: string, target: string, signal?: AbortSignal): Promise<void> {
	const bytes = await fetchVerified(url, expected, signal);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, bytes);
}

/**
 * Extract `archive` into `dir` with the platform's own tool: `tar` on macOS and
 * Linux (both ship bsdtar, which reads both formats) and PowerShell's
 * `Expand-Archive` on Windows, where `tar.exe` may be missing.
 */
async function extract(archive: string, dir: string, asset: string): Promise<void> {
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	const options = { timeout: DOWNLOAD_TIMEOUT_MS, maxBuffer: 1024 * 1024 };
	if (asset.endsWith(".zip")) {
		await run(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				`Expand-Archive -LiteralPath '${archive}' -DestinationPath '${dir}' -Force`,
			],
			options,
		);
		return;
	}
	await run("tar", ["-xzf", archive, "-C", dir], options);
}

/**
 * The extracted binary for this platform, downloading it if needed. `null`
 * means this platform has no Piper build, or the download failed.
 */
async function ensureBinary(): Promise<string | null> {
	const build = BUILDS[process.platform]?.[process.arch];
	if (!build) return null;
	const dir = buildDir(build);
	const exec = path.join(dir, "piper", build.exec);
	if (existsSync(exec)) return exec;
	const archive = path.join(rootDir(), build.asset);
	const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
	try {
		if (!existsSync(archive)) await download(`${RELEASE}/${build.asset}`, build.sha256, archive, signal);
		await extract(archive, dir, build.asset);
		await rm(archive, { force: true });
	} catch (cause) {
		console.warn(`[piper] binary unavailable: ${String(cause)}`);
		return null;
	}
	return existsSync(exec) ? exec : null;
}

/** The voice files for `language`, downloading them if needed. */
async function ensureVoice(language: string): Promise<string | null> {
	const voice = PIPER_VOICES[language];
	if (!voice) return null;
	const dir = voiceDir(voice);
	const model = path.join(dir, `${voice.model}.onnx`);
	const config = path.join(dir, `${voice.model}.onnx.json`);
	if (existsSync(model) && existsSync(config)) return model;
	const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
	try {
		if (!existsSync(model)) await download(`${voice.url}.onnx`, voice.onnxSha256, model, signal);
		if (!existsSync(config)) await download(`${voice.url}.onnx.json`, voice.configSha256, config, signal);
	} catch (cause) {
		console.warn(`[piper] voice ${language} unavailable: ${String(cause)}`);
		return null;
	}
	return model;
}

/**
 * Prepare the engine for `language`: `{ exec, model }`, or `null` when this
 * platform/language pair has no Piper voice or the download gave up. Concurrent
 * calls share one attempt; a failure counts against {@link MAX_ATTEMPTS}.
 */
export function preparePiper(language: string): Promise<PiperEngine | null> {
	const voice = PIPER_VOICES[language];
	if (!voice) return Promise.resolve(null);
	const inFlight = preparing.get(language);
	if (inFlight) return inFlight;
	const task = (async (): Promise<PiperEngine | null> => {
		if (!(await hasAttemptsLeft())) return null;
		const exec = await ensureBinary();
		const model = exec ? await ensureVoice(language) : null;
		if (!exec || !model) {
			await recordFailure();
			return null;
		}
		await rm(attemptsPath(), { force: true });
		return { exec, model };
	})();
	preparing.set(language, task);
	void task.finally(() => preparing.delete(language));
	return task;
}

async function hasAttemptsLeft(): Promise<boolean> {
	try {
		return Number(await readFile(attemptsPath(), "utf8")) < MAX_ATTEMPTS;
	} catch {
		return true;
	}
}

async function recordFailure(): Promise<void> {
	let attempts = 0;
	try {
		attempts = Number(await readFile(attemptsPath(), "utf8")) || 0;
	} catch {
		// First failure: nothing recorded yet.
	}
	try {
		await mkdir(rootDir(), { recursive: true });
		await writeFile(attemptsPath(), String(attempts + 1));
	} catch {
		// A cache directory that cannot be written just means a retry next time.
	}
}

/**
 * Speak `text` with Piper and return a WAV file. `null` means the engine is not
 * available for this platform or language (or the download gave up), so the
 * caller should use the platform voice instead.
 */
export async function synthesizeWithPiper(text: string, language: string): Promise<Uint8Array | null> {
	const prepared = await preparePiper(language);
	if (!prepared) return null;
	try {
		const wav = await runWithStdin(
			prepared.exec,
			["--model", prepared.model, "--output_file", "-", "--quiet"],
			text,
			{ timeout: 120_000, maxBuffer: 32 * 1024 * 1024 },
		);
		const bytes = new Uint8Array(wav);
		return bytes.length > 44 ? bytes : null;
	} catch (cause) {
		console.warn(`[piper] synthesis failed (${language}): ${String(cause)}`);
		return null;
	}
}

/** Run a command that reads the utterance from stdin (never from argv). */
function runWithStdin(
	file: string,
	args: string[],
	input: string,
	options: { timeout: number; maxBuffer: number },
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = execFile(file, args, { ...options, encoding: "buffer" }, (error, stdout) =>
			error ? reject(error) : resolve(stdout as Buffer),
		);
		child.stdin?.end(input);
	});
}
