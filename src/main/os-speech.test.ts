/**
 * The engine order is the fix: `espeak-ng` is the only voice a bare Linux
 * install has, and it is the formant synthesizer that made the reply sound
 * robotic. Piper (neural) must be tried first, and the platform engine only
 * when it has nothing for the language — so the order is asserted, not the
 * presence of both.
 */
import { describe, expect, it, vi } from "vitest";

const synthesizeWithPiper = vi.fn(async (_text: string, _language: string) => null as Uint8Array | null);
const execFile = vi.fn();

vi.mock("electron", () => ({
	app: { getPath: () => "/tmp/wisa-speech-test" },
}));

vi.mock("node:fs/promises", async importOriginal => ({
	...(await importOriginal<typeof import("node:fs/promises")>()),
	writeFile: vi.fn(async () => undefined),
	rm: vi.fn(async () => undefined),
}));

vi.mock("node:child_process", async () => {
	// Node's real `execFile` carries a custom promisify that resolves
	// `{ stdout, stderr }`; a bare vi.fn() would resolve the stdout string only,
	// so `listSayVoices` would read `.stdout` off a string.
	const custom = Symbol.for("nodejs.util.promisify.custom");
	(execFile as unknown as Record<symbol, unknown>)[custom] = (file: string, args: string[], options: unknown) =>
		new Promise(resolve =>
			execFile(file, args, options, (_error: Error | null, stdout?: string) => resolve({ stdout, stderr: "" })),
		);
	return { execFile };
});

vi.mock("./piper", () => ({
	synthesizeWithPiper: (text: string, language: string) => synthesizeWithPiper(text, language),
}));

const { speakWithOsVoice } = await import("./os-speech");

/** execFile's callback style: report success so the run resolves. */
function succeed(): void {
	execFile.mockImplementation(
		(_file: string, _args: string[], _options: unknown, callback: (e: Error | null) => void) => {
			callback(null);
			return { stdin: { end: () => undefined } };
		},
	);
}

describe("speakWithOsVoice", () => {
	it("speaks through Piper when it has a voice, without touching the platform engine", async () => {
		const wav = new Uint8Array(64).fill(1);
		synthesizeWithPiper.mockResolvedValueOnce(wav);
		succeed();

		await speakWithOsVoice("Xin chào, tôi là trợ lý của bạn.", "vi");

		expect(synthesizeWithPiper).toHaveBeenCalledWith("Xin chào, tôi là trợ lý của bạn.", "vi");
		// Only the player ran: no espeak-ng, no say, no SAPI.
		const files = execFile.mock.calls.map(call => call[0]);
		expect(files.some(file => file === "espeak-ng" || file === "say" || file === "powershell.exe")).toBe(false);
	});

	it("falls back to espeak-ng on Linux when Piper has no voice", async () => {
		const platform = Object.getOwnPropertyDescriptor(process, "platform");
		Object.defineProperty(process, "platform", { value: "linux", configurable: true });
		try {
			synthesizeWithPiper.mockResolvedValueOnce(null);
			succeed();

			await speakWithOsVoice("Xin chào", "vi");

			expect(execFile.mock.calls.map(call => call[0])).toContain("espeak-ng");
		} finally {
			if (platform) Object.defineProperty(process, "platform", platform);
		}
	});

	it("falls back to say on macOS, with the language's own voice", async () => {
		const platform = Object.getOwnPropertyDescriptor(process, "platform");
		Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
		try {
			synthesizeWithPiper.mockResolvedValueOnce(null);
			execFile.mockImplementation(
				(file: string, _args: string[], _options: unknown, callback: (e: Error | null, out?: unknown) => void) => {
					// `say -v ?` lists voices; `say` itself just speaks.
					callback(null, file === "say" ? "Linh                vi_VN    # Vietnamese" : undefined);
					return { stdin: { end: () => undefined } };
				},
			);

			await speakWithOsVoice("Xin chào", "vi");

			// `say` speaks from stdin, so the argv is just the voice selection.
			const sayCall = execFile.mock.calls.find(
				call => call[0] === "say" && call[1]?.[0] === "-v" && call[1][1] !== "?",
			);
			expect(sayCall?.[1]).toEqual(["-v", "Linh"]);
		} finally {
			if (platform) Object.defineProperty(process, "platform", platform);
		}
	});
});
