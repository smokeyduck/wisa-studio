/**
 * Speech for the languages the sidecar's local TTS cannot speak.
 *
 * The bundled local voice (Phonon 31M) is English-only, so a Vietnamese reply
 * synthesized there comes out as English phonemes reading Vietnamese letters.
 * Non-English utterances go to Piper — a neural voice downloaded on first use
 * (see `piper.ts`) — and only fall back to the platform engine when that is
 * unavailable. The order matters: `espeak-ng`, the only engine a bare Linux
 * install has, pronounces Vietnamese correctly and still sounds like a machine,
 * which is exactly the complaint Piper answers. macOS `say` and Windows SAPI
 * ship neural voices of their own, so there the platform engine is used when
 * Piper has no voice for the language.
 *
 * Nothing here touches a shell: arguments are passed to `execFile`, and the
 * utterance itself goes through stdin (never argv).
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
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

/** A long reply would otherwise hold the audio device for minutes. */
const MAX_SPEECH_CHARS = 4000;

/**
 * espeak-ng arguments for one utterance. `-w` is deliberately absent: without
 * it espeak-ng speaks through the audio backend and exits when it is done.
 */
export function espeakArgs(language: string, text: string): string[] {
	return ["-v", ESPEAK_VOICES[language] ?? language, text];
}

/**
 * The macOS `say` voice for `language`, from the `say -v '?'` listing
 * (`Name  en_US  # comment`). Falls back to `null` → `say`'s default voice.
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

/** PowerShell that speaks stdin through SAPI, the default installed voice. */
const SAPI_SCRIPT =
	"Add-Type -AssemblyName System.Speech; " +
	"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
	"$s.Speak([Console]::In.ReadToEnd())";

/**
 * Speak `text` with the OS voice, resolving once playback finished. Rejects with
 * the engine's own message (missing binary included) so the caller can toast it.
 */
export async function speakWithOsVoice(text: string, language: string): Promise<void> {
	const trimmed = text.trim().slice(0, MAX_SPEECH_CHARS);
	if (!trimmed) return;
	// A neural voice first: the platform engine is the fallback, not the default.
	const wav = await synthesizeWithPiper(trimmed, language);
	if (wav) {
		await playWav(wav);
		return;
	}
	const options = { timeout: 120_000, maxBuffer: 1024 * 1024 } as const;
	if (process.platform === "darwin") {
		const voice = sayVoiceFor(await listSayVoices(), language);
		const args = voice ? ["-v", voice] : [];
		await runWithStdin("say", args, trimmed, options);
		return;
	}
	if (process.platform === "win32") {
		await runWithStdin(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-Command", SAPI_SCRIPT],
			trimmed,
			options,
		);
		return;
	}
	try {
		await run("espeak-ng", espeakArgs(language, trimmed), options);
	} catch (cause) {
		// espeak-ng absent: speech-dispatcher is the other engine desktops ship.
		if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
		await run("spd-say", ["-l", language, "-w", trimmed], options);
	}
}

/**
 * Play a WAV through the platform's own player, resolving when it finishes.
 * Piper writes the file itself (`--output_file`), so nothing is held in memory
 * twice and every platform uses the player it already ships.
 */
async function playWav(wav: Uint8Array): Promise<void> {
	const file = path.join(app.getPath("temp"), `wisa-speech-${randomUUID()}.wav`);
	await writeFile(file, wav);
	try {
		await playFile(file);
	} finally {
		await rm(file, { force: true });
	}
}

async function playFile(file: string): Promise<void> {
	const options = { timeout: 120_000, maxBuffer: 1024 * 1024 } as const;
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
				"$p = New-Object System.Media.SoundPlayer $args[0]; $p.PlaySync()",
				file,
			],
			options,
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

async function listSayVoices(): Promise<string> {
	try {
		return (await run("say", ["-v", "?"], { timeout: 10_000 })).stdout;
	} catch {
		return "";
	}
}

/** Run a command that reads the utterance from stdin (never from argv). */
function runWithStdin(
	file: string,
	args: string[],
	input: string,
	options: { timeout: number; maxBuffer: number },
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const child = execFile(file, args, options, error => (error ? reject(error) : resolve(undefined)));
		child.stdin?.end(input);
	});
}
