/**
 * Provider branding contract for the model picker's group headers. Two things
 * must hold: known provider ids resolve to their own vendor row (with the
 * display casing the table declares, not a title-cased id), and anything the
 * table does not know still resolves to a usable brand instead of throwing or
 * rendering a blank header.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type BrandKey, providerBrand } from "./provider-brand";

describe("providerBrand — known ids", () => {
	const cases: Array<[string, BrandKey, string]> = [
		["openai", "openai", "OpenAI"],
		["anthropic", "anthropic", "Anthropic"],
		["google", "google", "Google"],
		["xai", "xai", "xAI"],
		["meta", "meta", "Meta"],
		["mistral", "mistral", "Mistral"],
		["deepseek", "deepseek", "DeepSeek"],
		["qwen", "qwen", "Qwen"],
		["minimax", "minimax", "MiniMax"],
		["moonshot", "moonshot", "Moonshot"],
	];

	it.each(cases)("resolves %s to %s / %s", (id, key, label) => {
		const brand = providerBrand(id);
		expect(brand.key).toBe(key);
		expect(brand.label).toBe(label);
		expect(typeof brand.Icon).toBe("function");
	});

	it("resolves the WISA gateway by its configured id", () => {
		const brand = providerBrand("wisa");
		expect(brand.key).toBe("wisa");
		expect(brand.label).toBe("Wisa");
	});

	it("keeps the WISA label when the gateway advertises an OpenAI api", () => {
		const brand = providerBrand("wisa", "openai-responses");
		expect(brand.key).toBe("wisa");
		expect(brand.label).toBe("Wisa");
	});
});

describe("providerBrand — id variants", () => {
	it("ignores casing, dashes and underscores", () => {
		expect(providerBrand("OpenAI").label).toBe("OpenAI");
		expect(providerBrand("openai-codex").key).toBe("openai");
		expect(providerBrand("openai_codex").key).toBe("openai");
		expect(providerBrand("MiniMax").label).toBe("MiniMax");
		expect(providerBrand("deep-seek").key).toBe("deepseek");
		expect(providerBrand("moonshot-ai").key).toBe("moonshot");
		expect(providerBrand("WISA").label).toBe("Wisa");
	});
});

describe("providerBrand — unknown ids", () => {
	it("falls back to the generic mark", () => {
		const brand = providerBrand("some-unheard-of-gateway");
		expect(brand.key).toBe("generic");
		expect(typeof brand.Icon).toBe("function");
	});

	it("labels the fallback with the id exactly as configured", () => {
		expect(providerBrand("mygateway").label).toBe("mygateway");
		expect(providerBrand("").label).toBe("Other");
	});

	it("uses the wire api only when it belongs to one vendor", () => {
		expect(providerBrand("gateway-a", "anthropic-messages").key).toBe("anthropic");
		expect(providerBrand("gateway-b", "openai-responses").key).toBe("openai");
		// The universal compatibility layer implies no vendor.
		expect(providerBrand("gateway-c", "openai-completions").key).toBe("generic");
	});

	it("prefers the provider id over the api hint", () => {
		expect(providerBrand("deepseek", "anthropic-messages").key).toBe("deepseek");
	});
});

describe("providerBrand — marks", () => {
	it("renders a 16px currentColor svg that carries no external reference", () => {
		const markup = renderToStaticMarkup(createElement(providerBrand("openai").Icon));
		expect(markup).toContain('width="16"');
		expect(markup).toContain('height="16"');
		expect(markup).toContain('stroke="currentColor"');
		expect(markup).not.toContain("http");
		expect(markup).toContain('aria-hidden="true"');
	});

	it("gives each vendor a distinct mark", () => {
		const keys = [
			"openai",
			"anthropic",
			"google",
			"xai",
			"meta",
			"mistral",
			"deepseek",
			"qwen",
			"minimax",
			"moonshot",
		];
		const marks = new Set(keys.map(key => renderToStaticMarkup(createElement(providerBrand(key).Icon))));
		expect(marks.size).toBe(keys.length);
	});
});
