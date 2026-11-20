import { describe, expect, it } from "vitest";
import type { ModelInfo } from "../../shared/rpc-types";
import { serviceTierFamily, supportsFastMode } from "./service-tier";

const model = (over: Partial<ModelInfo>): ModelInfo => ({ provider: "openai", id: "gpt-5", ...over });

describe("serviceTierFamily", () => {
	it("classifies the official provider families", () => {
		expect(serviceTierFamily(model({ provider: "openai" }))).toBe("openai");
		expect(serviceTierFamily(model({ provider: "openai-codex", api: "openai-codex-responses" }))).toBe("openai");
		expect(serviceTierFamily(model({ provider: "anthropic", id: "claude-sonnet-4-5" }))).toBe("anthropic");
		expect(
			serviceTierFamily(model({ provider: "amazon-bedrock", api: "anthropic-messages", id: "claude-sonnet-4-5" })),
		).toBe("anthropic");
		expect(serviceTierFamily(model({ provider: "google-vertex", id: "gemini-2.5-pro" }))).toBe("google");
	});

	it("classifies OpenRouter by the model id's namespace", () => {
		expect(serviceTierFamily(model({ provider: "openrouter", id: "anthropic/claude-sonnet-4.5" }))).toBe("anthropic");
		expect(serviceTierFamily(model({ provider: "openrouter", id: "google/gemini-2.5-pro" }))).toBe("google");
		expect(serviceTierFamily(model({ provider: "openrouter", id: "openai/gpt-5" }))).toBe("openai");
		expect(serviceTierFamily(model({ provider: "openrouter", id: "meta-llama/llama-4" }))).toBeUndefined();
	});

	it("treats a relay serving OpenAI ids as the OpenAI family, and the ones that refuse the field as none", () => {
		expect(serviceTierFamily(model({ provider: "wisa", id: "gpt-5", api: "openai-completions" }))).toBe("openai");
		expect(serviceTierFamily(model({ provider: "wisa", id: "claude-sonnet-4-5", api: "openai-completions" }))).toBeUndefined();
		expect(serviceTierFamily(model({ provider: "fireworks", id: "gpt-5", api: "openai-completions" }))).toBeUndefined();
		expect(
			serviceTierFamily(model({ provider: "github-copilot", id: "gpt-5", api: "openai-responses" })),
		).toBeUndefined();
	});

	it("reports no family for models without a serving-priority knob", () => {
		expect(serviceTierFamily(null)).toBeUndefined();
		expect(serviceTierFamily(model({ provider: "wisa", id: "wisa-pro", api: "openai-completions" }))).toBeUndefined();
		expect(supportsFastMode(model({ provider: "wisa", id: "wisa-pro" }))).toBe(false);
		expect(supportsFastMode(model({ provider: "anthropic", id: "claude-sonnet-4-5" }))).toBe(true);
	});
});
