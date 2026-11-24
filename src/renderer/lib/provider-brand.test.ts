import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { manufacturerIcon, providerLabel } from "./provider-brand";

describe("manufacturer artwork", () => {
	it.each([
		["OpenAI", "openai"],
		["Anthropic", "anthropic"],
		["Google", "google"],
		["xAI", "xai"],
		["Meta", "meta"],
		["meta-llama", "meta"],
		["Mistral", "mistral"],
		["DeepSeek", "deepseek"],
		["Qwen", "qwen"],
		["MiniMax", "minimax"],
		["Moonshot", "moonshot"],
		["Z.ai", "zai"],
		["NVIDIA", "nvidia"],
		["StepFun", "stepfun"],
		["CapCut", "capcut"],
	])("renders %s as a self-contained %s SVG", (manufacturer, key) => {
		const markup = renderToStaticMarkup(createElement(manufacturerIcon(manufacturer)));
		expect(markup).toContain(`data-brand="${key}"`);
		expect(markup).toContain('viewBox="0 0 24 24"');
		expect(markup).toContain('width="16"');
		expect(markup).toContain('height="16"');
		expect(markup).toContain('fill="currentColor"');
		expect(markup).toContain('aria-hidden="true"');
		expect(markup).toContain('<path d="M');
		expect(markup).not.toContain("href=");
	});

	it.each(["", "Wisa", "openrouter", "together", "my-gateway", "constructor"])(
		"uses a neutral icon for %s, not a relay's purported maker",
		label => {
			const markup = renderToStaticMarkup(createElement(manufacturerIcon(label)));
			expect(markup).toContain('data-brand="generic"');
		},
	);
});

describe("provider labels", () => {
	it.each([
		["WISA", "Wisa"],
		["openai-codex", "OpenAI"],
		["moonshot-ai", "Moonshot"],
		["together", "together"],
		["MyGateway", "MyGateway"],
		["", "Other"],
	])("labels the actual connection %s as %s", (provider, label) => {
		expect(providerLabel(provider)).toBe(label);
	});
});
