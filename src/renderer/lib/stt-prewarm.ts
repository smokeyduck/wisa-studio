/**
 * Dictation warm-up: pull the speech model down while the user works instead of
 * when they first press the microphone.
 *
 * The sidecar loads (and, on a fresh profile, downloads) the model on the first
 * transcription. Sending one second of silence through `transcribe_audio` does
 * exactly that work in the background; the result is discarded.
 *
 * Runs at most once per profile, and gives up after a few failed attempts so an
 * offline machine does not retry a multi-hundred-megabyte download every launch.
 */
import { useSettingsStore } from "../stores/settings";
const PREWARM_PREF = "sttHostPrewarm";
const MAX_ATTEMPTS = 3;
/** One second of silence at the STT pipeline's native rate (16 kHz mono PCM16). */
const SILENCE_SECONDS = 1;

let started = false;

interface PrewarmState {
	done?: boolean;
	attempts?: number;
}

/** A 16-bit PCM mono WAV of silence, base64 — the wire format `transcribe_audio` takes. */
export function silentWavBase64(seconds = SILENCE_SECONDS): string {
	const sampleRate = 16_000;
	const dataBytes = sampleRate * seconds * 2;
	const wav = new Uint8Array(44 + dataBytes);
	const view = new DataView(wav.buffer);
	const ascii = (offset: number, text: string): void => {
		for (let i = 0; i < text.length; i += 1) wav[offset + i] = text.charCodeAt(i);
	};
	ascii(0, "RIFF");
	view.setUint32(4, 36 + dataBytes, true);
	ascii(8, "WAVE");
	ascii(12, "fmt ");
	view.setUint32(16, 16, true); // PCM chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true); // byte rate
	view.setUint16(32, 2, true); // block align
	view.setUint16(34, 16, true); // bits per sample
	ascii(36, "data");
	view.setUint32(40, dataBytes, true);
	let binary = "";
	for (const byte of wav) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/**
 * Download/load the dictation model in the background. Safe to call repeatedly;
 * only the first call with `stt.enabled` on does any work.
 */
export async function prewarmDictation(): Promise<void> {
	if (started) return;
	started = true;
	if (!(await dictationEnabled())) {
		started = false;
		return;
	}
	const state = ((await window.omp.prefs.get(PREWARM_PREF)) ?? {}) as PrewarmState;
	if (state.done || (state.attempts ?? 0) >= MAX_ATTEMPTS) return;
	try {
		const response = await window.omp.rpc.transcribeSpeech(silentWavBase64());
		if (!response.success && response.code === "stt_cloud_selected") return;
		await window.omp.prefs.set(
			PREWARM_PREF,
			response.success ? { done: true } : { attempts: (state.attempts ?? 0) + 1 },
		);
	} catch {
		await window.omp.prefs.set(PREWARM_PREF, { attempts: (state.attempts ?? 0) + 1 });
	}
}

/**
 * Read `stt.enabled` from the sidecar rather than the settings store: the store
 * is hydrated by its own async sync, and a warm-up that raced it would silently
 * skip a profile whose dictation was just turned on.
 */
async function dictationEnabled(): Promise<boolean> {
	try {
		const response = await window.omp.rpc.getSettings(["stt.enabled"]);
		if (!response.success) return useSettingsStore.getState().sttEnabled;
		const values = (response.data as { values?: Record<string, unknown> } | undefined)?.values;
		const value = values?.["stt.enabled"];
		return typeof value === "boolean" ? value : useSettingsStore.getState().sttEnabled;
	} catch {
		return useSettingsStore.getState().sttEnabled;
	}
}
