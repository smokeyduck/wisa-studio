import { describe, expect, it } from "vitest";
import type { ModelInfo } from "../../shared/rpc-types";
import { supportsFastMode, supportsPriorityMode, supportsUltrafastMode } from "./service-tier";

const model = (over: Partial<ModelInfo>): ModelInfo => ({ provider: "openai", id: "gpt-5", ...over });

describe("Fast service tier capability", () => {
	it("never infers a relay's capability from an OpenAI or Anthropic protocol or model name", () => {
		for (const api of ["openai-completions", "openai-responses", "openai-codex-responses", "anthropic-messages"]) {
			expect(supportsFastMode(model({ provider: "wisa", id: "gpt-5-fast", api }))).toBe(false);
			expect(supportsFastMode(model({ provider: "acme", id: "claude-opus-5-5", api }))).toBe(false);
		}
		expect(supportsFastMode(model({ provider: "openrouter", id: "openai/gpt-5" }))).toBe(false);
	});

	it("keeps established first-party routes, but not endpoint overrides or unsupported Claude models", () => {
		expect(supportsPriorityMode(model({ api: "openai-responses", baseUrl: "https://api.openai.com/v1" }))).toBe(true);
		expect(supportsPriorityMode(model({ provider: "openai-codex", api: "openai-codex-responses" }))).toBe(true);
		expect(supportsPriorityMode(model({ provider: "anthropic", id: "claude-opus-5-5" }))).toBe(true);
		expect(supportsPriorityMode(model({ provider: "anthropic", id: "claude-sonnet-4-5" }))).toBe(false);
		expect(supportsPriorityMode(model({ provider: "google-vertex", api: "google-vertex" }))).toBe(true);
		expect(supportsPriorityMode(model({ provider: "google-vertex", api: "anthropic-messages" }))).toBe(false);
		expect(supportsPriorityMode(model({ api: "openai-responses", baseUrl: "https://api.openai.com.relay.test/v1" }))).toBe(
			false,
		);
	});

	it("requires each exact premium tier when the route advertises metadata", () => {
		const codex = { provider: "openai-codex", api: "openai-codex-responses" };
		expect(supportsPriorityMode(model({ ...codex, serviceTiers: [] }))).toBe(false);
		expect(supportsPriorityMode(model({ ...codex, serviceTiers: ["priority-high"] }))).toBe(false);
		expect(supportsPriorityMode(model({ ...codex, serviceTiers: ["priority"] }))).toBe(true);
		expect(supportsUltrafastMode(model({ ...codex, serviceTiers: ["priority"] }))).toBe(false);
		const ultraOnly = model({ ...codex, serviceTiers: ["ultrafast"] });
		expect(supportsPriorityMode(ultraOnly)).toBe(false);
		expect(supportsUltrafastMode(ultraOnly)).toBe(true);
		expect(supportsFastMode(ultraOnly)).toBe(true);
	});

	it("honors positive metadata only for a route the agent can use", () => {
		const relay = model({ provider: "wisa", api: "openai-completions", serviceTiers: ["priority"] });
		expect(supportsPriorityMode(relay)).toBe(true);
		expect(supportsPriorityMode({ ...relay, identity: { class: "grok" } })).toBe(false);
		expect(supportsPriorityMode({ ...relay, provider: "github-copilot" })).toBe(false);
		expect(supportsPriorityMode({ ...relay, api: "anthropic-messages" })).toBe(false);
		expect(supportsPriorityMode({ ...relay, provider: "openrouter", id: "google/gemini-2.5-pro" })).toBe(true);
		expect(supportsPriorityMode({ ...relay, provider: "openrouter", id: "anthropic/claude-opus-5-5" })).toBe(false);
		expect(supportsFastMode(null)).toBe(false);
	});
});
