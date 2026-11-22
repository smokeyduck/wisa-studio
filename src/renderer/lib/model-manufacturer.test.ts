import { describe, expect, it } from "vitest";
import { manufacturerLabel } from "./model-manufacturer";

describe("manufacturerLabel", () => {
	it("shows a vendor/ namespace as written, without treating it as a known maker", () => {
		expect(manufacturerLabel({ id: "openai/gpt-4o" })).toBe("openai");
		expect(manufacturerLabel({ id: "acme-labs/model-x" })).toBe("acme-labs");
	});

	it("infers the maker from a known family prefix on a bare id", () => {
		expect(manufacturerLabel({ id: "gpt-5" })).toBe("OpenAI");
		expect(manufacturerLabel({ id: "o3-mini" })).toBe("OpenAI");
		expect(manufacturerLabel({ id: "claude-sonnet-4-5" })).toBe("Anthropic");
		expect(manufacturerLabel({ id: "gemini-2.5-pro" })).toBe("Google");
	});

	it.each([
		["grok-4.7", "xAI"],
		["deepseek-v4-pro", "DeepSeek"],
		["glm-5.3", "Z.ai"],
		["kimi-k3", "Moonshot"],
		["glm-5.3-flash", "Z.ai"],
		["minimax-m3.1-flash", "MiniMax"],
		["nemotron-3-nano-omni-30b-a3b-reasoning", "NVIDIA"],
		["nemotron-3-ultra-550b-a55b", "NVIDIA"],
		["nemotron-3.5-super-vl-120b-a12b", "NVIDIA"],
		["step-5-preview", "StepFun"],
		["deepseek-v4.1-flash", "DeepSeek"],
		["auto", ""],
		["codex-auto-review", "OpenAI"],
		["grok-4.3", "xAI"],
		["grok-4.5", "xAI"],
		["grok-4.6", "xAI"],
		["grok-4.7-build-fast", "xAI"],
		["qwen3.8-flash", "Qwen"],
		["qwen3.8-max", "Qwen"],
		["kimi-k3.1-pro-standard", "Moonshot"],
		["grok-composer-2.5-fast-standard", "xAI"],
		["kimi-k3.1-pro-free", "Moonshot"],
		["deepseek-v4.1-flash-1017-standard", "DeepSeek"],
		["capcut-tts", "CapCut"],
		["Grok4.7", "xAI"],
		["GLM5.3Flash", "Z.ai"],
	])("classifies catalog model %s as %s", (id, label) => {
		expect(manufacturerLabel({ id })).toBe(label);
	});

	it.each([
		"step-by-step",
		"stepwise",
		"kimiko",
		"glmatrix",
		"grokking",
		"claudette",
		"geminiproxy",
		"codexy",
		"qwenproxy",
		"capcutting",
	])("does not invent a maker for unrelated id %s", id => {
		expect(manufacturerLabel({ id })).toBe("");
	});

	it("returns empty for unknown ids so the picker uses the connection label", () => {
		expect(manufacturerLabel({ id: "llama-3" })).toBe("");
		expect(manufacturerLabel({ id: "my-local-model" })).toBe("");
	});
});
