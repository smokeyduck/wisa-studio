/**
 * wisa-provider.ts: the gateway provider is seeded exactly once, and a profile
 * that already carries a `wisa` entry (possibly user-edited) is never rewritten.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { agentDir, configureAgentProfile } from "./agent-paths";
import { listModelsProviders } from "./models-config";
import { ensureWisaProvider, WISA_PROVIDER_ID } from "./wisa-provider";

describe("ensureWisaProvider", () => {
	let testDir: string;
	let originalEnv: string | undefined;

	beforeEach(() => {
		testDir = join(tmpdir(), `omp-test-wisa-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		originalEnv = agentDir();
		configureAgentProfile(testDir);
	});

	afterEach(() => {
		configureAgentProfile(originalEnv!);
		if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
	});

	test("seeds an OpenAI-compatible discovery provider with no invented model limits", () => {
		expect(ensureWisaProvider()).toBe(true);
		const provider = listModelsProviders().find(candidate => candidate.id === WISA_PROVIDER_ID);
		expect(provider).toBeDefined();
		expect(provider?.baseUrl).toBe("https://api.askwisa.com/v1");
		expect(provider?.api).toBeUndefined();
		expect(provider?.auth).toBe("apiKey");
		expect(provider?.discovery?.type).toBe("openai-models-list");
		expect(provider?.models).toEqual([]);
		expect(provider?.builtin).toBe(false);
	});

	test("is idempotent and preserves a user-edited entry", () => {
		expect(ensureWisaProvider()).toBe(true);
		expect(ensureWisaProvider()).toBe(false);
		expect(listModelsProviders().filter(provider => provider.id === WISA_PROVIDER_ID)).toHaveLength(1);
	});
});
