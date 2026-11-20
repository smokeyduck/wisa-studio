import { describe, expect, it } from "vitest";
import { silentWavBase64 } from "./stt-prewarm";

function bytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
	return out;
}

describe("silentWavBase64", () => {
	it("is a canonical 16 kHz mono PCM16 WAV, the wire format transcribe_audio takes", () => {
		const wav = bytes(silentWavBase64(1));
		const view = new DataView(wav.buffer);
		const ascii = (offset: number, length: number): string =>
			String.fromCharCode(...wav.subarray(offset, offset + length));

		expect(ascii(0, 4)).toBe("RIFF");
		expect(ascii(8, 4)).toBe("WAVE");
		expect(ascii(36, 4)).toBe("data");
		expect(view.getUint16(20, true)).toBe(1); // PCM
		expect(view.getUint16(22, true)).toBe(1); // mono
		expect(view.getUint32(24, true)).toBe(16_000);
		expect(view.getUint16(34, true)).toBe(16); // bits per sample
		expect(view.getUint32(40, true)).toBe(32_000); // one second of samples
		expect(view.getUint32(4, true)).toBe(36 + 32_000); // RIFF size covers the payload
	});

	it("scales the payload with the requested duration and stays silent", () => {
		const wav = bytes(silentWavBase64(2));
		expect(new DataView(wav.buffer).getUint32(40, true)).toBe(64_000);
		expect(wav.subarray(44).some(sample => sample !== 0)).toBe(false);
	});
});
