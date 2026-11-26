/** Local speech playback for languages outside the sidecar voice's coverage. */
import { execFile, type ExecFileOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import type { VietnameseVoice } from "../shared/speech-language";
import { synthesizeWithPiper } from "./piper";

const run = promisify(execFile);

/** espeak-ng voice names for the languages the UI ships. */
const ESPEAK_VOICES: Record<string, string> = {
	en: "en-us",
	vi: "vi",
	ru: "ru",
	th: "th",
	zh: "cmn",
};

/**
 * The macOS `say` voice for `language`, from the `say -v '?'` listing
 * (`Name  en_US  # comment`). Never substitute a voice in another language.
 */
export function sayVoiceFor(listing: string, language: string): string | null {
	for (const line of listing.split("\n")) {
		const columns = line.split(/\s{2,}/);
		const [name, locale] = columns;
		if (!name || !locale) continue;
		if (locale.split(/[_-]/)[0]?.toLowerCase() === language) return name.trim();
	}
	return null;
}

/** Use only enabled, locally installed SAPI voices with the requested language. */
const SAPI_SCRIPT =
	"$ErrorActionPreference = 'Stop'; " +
	"[Console]::InputEncoding = New-Object System.Text.UTF8Encoding; " +
	"Add-Type -AssemblyName System.Speech; " +
	"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
	"$voice = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and " +
	"$_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq $env:WISA_SPEECH_LANGUAGE } | Select-Object -First 1; " +
	"if (-not $voice) { exit 3 }; " +
	"$s.SelectVoice($voice.VoiceInfo.Name); $s.Speak([Console]::In.ReadToEnd())";

export class MissingSpeechVoice extends Error {}

/**
 * Speak `text` with the OS voice, resolving once playback finished. Rejects with
 * the engine's own message (missing binary included) so the caller can toast it.
 */
export async function speakWithOsVoice(
	text: string,
	language: string,
	preference: VietnameseVoice = "auto",
	signal?: AbortSignal,
): Promise<void> {
	const trimmed = text.trim();
	if (!trimmed) return;
	signal?.throwIfAborted();
	if (language === "vi" && preference !== "system") {
		const file = path.join(app.getPath("temp"), `wisa-speech-${randomUUID()}.wav`);
		try {
			if (await synthesizeWithPiper(trimmed, language, file, signal)) {
				await playFile(file, signal);
				return;
			}
		} finally {
			await rm(file, { force: true });
		}
		if (preference === "vais1000") throw new Error("The VAIS-1000 voice is unavailable on this device.");
	}
	const options = { timeout: 120_000, maxBuffer: 1024 * 1024, signal, windowsHide: true } as const;
	if (process.platform === "darwin") {
		const voice = sayVoiceFor(await listSayVoices(signal), language);
		if (!voice) throw new MissingSpeechVoice(language);
		await runWithStdin("say", ["-v", voice], trimmed, options);
		return;
	}
	if (process.platform === "win32") {
		try {
			await runWithStdin("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", SAPI_SCRIPT], trimmed, {
				...options,
				env: { ...process.env, WISA_SPEECH_LANGUAGE: language },
			});
		} catch (cause) {
			if (cause instanceof Error && "code" in cause && cause.code === 3) throw new MissingSpeechVoice(language);
			throw cause;
		}
		return;
	}
	try {
		await runWithStdin("espeak-ng", ["-v", ESPEAK_VOICES[language] ?? language, "--stdin"], trimmed, options);
	} catch (cause) {
		if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") throw new MissingSpeechVoice(language);
		throw cause;
	}
}

async function playFile(file: string, signal?: AbortSignal): Promise<void> {
	const options = { timeout: 120_000, maxBuffer: 1024 * 1024, signal, windowsHide: true } as const;
	if (process.platform === "darwin") {
		await run("afplay", [file], options);
		return;
	}
	if (process.platform === "win32") {
		await run(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"$ErrorActionPreference = 'Stop'; $p = New-Object System.Media.SoundPlayer $env:WISA_SPEECH_WAV; $p.PlaySync()",
			],
			{ ...options, env: { ...process.env, WISA_SPEECH_WAV: file } },
		);
		return;
	}
	// Pipe through a decoder: `paplay`/`aplay` want the device's own format.
	try {
		await run("paplay", [file], options);
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
		await run("aplay", ["-q", file], options);
	}
}

async function listSayVoices(signal?: AbortSignal): Promise<string> {
	try {
		return (await run("say", ["-v", "?"], { timeout: 10_000, signal })).stdout;
	} catch {
		signal?.throwIfAborted();
		return "";
	}
}

/** Run a command that reads the utterance from stdin (never from argv). */
function runWithStdin(
	file: string,
	args: string[],
	input: string,
	options: ExecFileOptions,
): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const child = execFile(file, args, options, error => (error ? reject(error) : resolve()));
	child.stdin?.on("error", () => undefined);
	child.stdin?.end(input);
	return promise;
}
