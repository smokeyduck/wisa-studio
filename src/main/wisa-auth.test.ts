/**
 * The browser → app sign-in path: a one-time code arrives in a deep link, the
 * main process trades it for the wallet key and writes it into models.yml.
 *
 * What these tests protect:
 *  - the key never leaves this process (nothing here returns it to the renderer);
 *  - a failed exchange writes nothing, so a typo cannot wipe a working key;
 *  - a successful one keeps the user's own provider settings.
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { listModelsProviders } from "./models-config";
import { applyWisaCredentials, connectWisa, exchangeWisaCode, WISA_EXCHANGE_URL } from "./wisa-auth";
import { ensureWisaProvider } from "./wisa-provider";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("wisa-auth", () => {
	let testDir: string;
	let originalEnv: string | undefined;

	beforeEach(() => {
		testDir = join(tmpdir(), `omp-test-wisa-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		mkdirSync(testDir, { recursive: true });
		originalEnv = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = testDir;
	});

	afterEach(() => {
		if (originalEnv !== undefined) process.env.PI_CODING_AGENT_DIR = originalEnv;
		else delete process.env.PI_CODING_AGENT_DIR;
		rmSync(testDir, { recursive: true, force: true });
	});

	test("posts the code to the desktop exchange route and returns the key", async () => {
		const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
			jsonResponse(200, { apiKey: "sk-live", email: "a@b.c" }),
		);

		const result = await exchangeWisaCode("abc123", fetchMock as unknown as typeof fetch);

		expect(result).toEqual({ ok: true, apiKey: "sk-live", baseUrl: undefined, email: "a@b.c" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(WISA_EXCHANGE_URL);
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({ code: "abc123" });
	});

	test("surfaces the server's own refusal message", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse(400, { error: "Mã kết nối không dùng được.", code: "invalid_code" }),
		);

		const result = await exchangeWisaCode("stale", fetchMock as unknown as typeof fetch);

		expect(result).toEqual({ ok: false, reason: "Mã kết nối không dùng được." });
	});

	test("reports a response with no key instead of storing an empty one", async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, { email: "a@b.c" }));

		const result = await exchangeWisaCode("abc", fetchMock as unknown as typeof fetch);

		expect(result).toEqual({ ok: false, reason: "The server returned no key." });
	});

	test("refuses an empty code without a network call", async () => {
		const fetchMock = vi.fn();

		const result = await exchangeWisaCode("   ", fetchMock as unknown as typeof fetch);

		expect(result).toEqual({ ok: false, reason: "Empty connection code." });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("reports an unreachable server rather than throwing", async () => {
		const fetchMock = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});

		const result = await exchangeWisaCode("abc", fetchMock as unknown as typeof fetch);

		expect(result).toEqual({ ok: false, reason: "Could not reach the server." });
	});

	test("a failed exchange leaves the stored key alone", async () => {
		ensureWisaProvider();
		applyWisaCredentials({ apiKey: "sk-working" });
		const fetchMock = vi.fn(async () => jsonResponse(400, { error: "expired" }));

		const result = await connectWisa("stale", fetchMock as unknown as typeof fetch);

		expect(result.ok).toBe(false);
		// A stale code must never cost the user a working key.
		expect(listModelsProviders().find(p => p.id === "wisa")?.hasApiKey).toBe(true);
	});

	test("a successful exchange stores the key on the seeded provider", async () => {
		ensureWisaProvider();
		const fetchMock = vi.fn(async () => jsonResponse(200, { apiKey: "sk-new", email: "a@b.c" }));

		const result = await connectWisa("abc", fetchMock as unknown as typeof fetch);

		expect(result).toEqual({ ok: true, email: "a@b.c", baseUrl: "" });
		const provider = listModelsProviders().find(p => p.id === "wisa");
		expect(provider?.hasApiKey).toBe(true);
		// The seeded shell survives a sign-in: same api/baseUrl, discovery intact.
		expect(provider?.baseUrl).toBe("https://api.askwisa.com/v1");
		expect(provider?.api).toBe("openai-completions");
		expect(provider?.discovery).toEqual({ type: "openai-models-list" });
	});

	test("a sign-in keeps the user's own base URL and model list", async () => {
		ensureWisaProvider();
		// The user pointed the entry at a mirror and pinned two models.
		const { upsertModelsProvider } = await import("./models-config");
		upsertModelsProvider({
			id: "wisa",
			api: "openai-completions",
			baseUrl: "https://mirror.example/v1",
			auth: "apiKey",
			apiKey: "sk-old",
			models: [{ id: "gpt-5", name: "GPT-5" }],
		});
		const fetchMock = vi.fn(async () => jsonResponse(200, { apiKey: "sk-new" }));

		await connectWisa("abc", fetchMock as unknown as typeof fetch);

		const provider = listModelsProviders().find(p => p.id === "wisa");
		expect(provider?.baseUrl).toBe("https://mirror.example/v1");
		expect(provider?.models.map(m => m.id)).toEqual(["gpt-5"]);
		expect(provider?.hasApiKey).toBe(true);
	});
});
