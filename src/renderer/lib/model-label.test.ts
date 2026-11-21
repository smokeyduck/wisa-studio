/**
 * The composer label must read like a product name, not a catalog key. These
 * cases pin the two halves of `modelLabel`: a real `name` wins, otherwise the
 * id is prettified — with vendor acronyms, dotted versions, and mixed
 * separators all surviving intact.
 */

import { describe, expect, it } from "vitest";
import { modelLabel, prettifyModelId } from "./model-label";

describe("prettifyModelId", () => {
	it("turns a vendor id into a spaced, cased name", () => {
		expect(prettifyModelId("minimax-m3.1-flash")).toBe("MiniMax M3.1 Flash");
	});

	it("keeps vendor casing that title-casing would destroy", () => {
		expect(prettifyModelId("xai-grok-4")).toBe("xAI Grok 4");
		expect(prettifyModelId("deepseek-v3")).toBe("DeepSeek V3");
		expect(prettifyModelId("openai-gpt-5")).toBe("OpenAI GPT 5");
		expect(prettifyModelId("moonshot-kimi-k2")).toBe("Moonshot Kimi K2");
	});

	it("keeps acronyms upper-case", () => {
		expect(prettifyModelId("qwen-vl-max")).toBe("Qwen VL Max");
		expect(prettifyModelId("llama-3-moe")).toBe("Llama 3 MoE");
	});

	it("treats underscores and slashes as separators", () => {
		expect(prettifyModelId("anthropic_claude_sonnet")).toBe("Anthropic Claude Sonnet");
		expect(prettifyModelId("google/gemini-2.5-pro")).toBe("Google Gemini 2.5 Pro");
	});

	it("keeps a version glued to its letter prefix", () => {
		expect(prettifyModelId("gpt-4o-mini")).toBe("GPT 4o Mini");
		expect(prettifyModelId("o3-mini")).toBe("O3 Mini");
	});

	it("leaves an already-clean single token alone", () => {
		expect(prettifyModelId("gpt")).toBe("GPT");
	});

	it("does not invent text from an empty id", () => {
		expect(prettifyModelId("")).toBe("");
		expect(prettifyModelId("   ")).toBe("");
	});
});

describe("modelLabel", () => {
	it("returns null when there is no model", () => {
		expect(modelLabel(null)).toBeNull();
		expect(modelLabel(undefined)).toBeNull();
	});

	it("prefers the catalog name", () => {
		expect(modelLabel({ id: "minimax-m3.1-flash", name: "MiniMax M3.1 Flash" })).toBe("MiniMax M3.1 Flash");
	});

	it("falls back to a prettified id when the name is missing or blank", () => {
		expect(modelLabel({ id: "minimax-m3.1-flash" })).toBe("MiniMax M3.1 Flash");
		expect(modelLabel({ id: "minimax-m3.1-flash", name: null })).toBe("MiniMax M3.1 Flash");
		expect(modelLabel({ id: "minimax-m3.1-flash", name: "  " })).toBe("MiniMax M3.1 Flash");
	});

	it("ignores a name that merely echoes the id", () => {
		expect(modelLabel({ id: "claude-sonnet-4", name: "claude-sonnet-4" })).toBe("Claude Sonnet 4");
	});

	it("survives an empty id", () => {
		expect(modelLabel({ id: "" })).toBeNull();
		expect(modelLabel({ id: "", name: "Local model" })).toBe("Local model");
	});
});
