import type { ModelInfo } from "../../shared/rpc-types";

const OPENAI_HOST = /^https:\/\/api\.openai\.com(?:\/|$)/i;
const CODEX_HOST = /^https:\/\/chatgpt\.com(?:\/|$)/i;
const ANTHROPIC_HOST = /^https:\/\/api\.anthropic\.com(?:\/|$)/i;
const GOOGLE_HOST = /^https:\/\/generativelanguage\.googleapis\.com(?:\/|$)/i;
const VERTEX_HOST = /^https:\/\/(?:[a-z0-9-]+-)?aiplatform\.googleapis\.com(?:\/|$)/i;

// https://platform.claude.com/docs/en/build-with-claude/fast-mode#feature-availability
const ANTHROPIC_FAST_MODELS = ["claude-fable-5-2", "claude-mythos-5-2", "claude-opus-5-5", "claude-opus-5"];

function isDirect(model: ModelInfo, host: RegExp): boolean {
	return model.baseUrl === undefined || host.test(model.baseUrl);
}

function usesApi(model: ModelInfo, api: string): boolean {
	return model.api === undefined || model.api === api;
}

function isOpenAiCompatible(model: ModelInfo): boolean {
	return (
		(model.api === "openai-completions" || model.api === "openai-responses" || model.api === "openai-codex-responses") &&
		(model.identity?.class === undefined || model.identity.class === "openai") &&
		model.provider !== "fireworks" &&
		model.provider !== "github-copilot"
	);
}

/**
 * Metadata is authoritative when supplied. Without it, only known first-party
 * routes qualify: a compatible request schema or familiar model name alone
 * does not mean a relay realizes priority service.
 *
 * Protocol checks also exclude routes the bundled agent does not wire up
 * (notably compatible Anthropic endpoints and OpenRouter's Anthropic route).
 */
export function supportsPriorityMode(model: ModelInfo | null | undefined): boolean {
	if (!model) return false;
	const advertised = model.serviceTiers?.includes("priority");
	if (advertised === false) return false;
	switch (model.provider) {
		case "openai":
			return (
				((model.api === undefined || isOpenAiCompatible(model)) && isDirect(model, OPENAI_HOST)) ||
				(advertised === true && isOpenAiCompatible(model))
			);
		case "openai-codex":
			return (
				(usesApi(model, "openai-codex-responses") && isDirect(model, CODEX_HOST)) ||
				(advertised === true && isOpenAiCompatible(model))
			);
		case "anthropic":
			return (
				usesApi(model, "anthropic-messages") &&
				isDirect(model, ANTHROPIC_HOST) &&
				(advertised === true || ANTHROPIC_FAST_MODELS.includes(model.id))
			);
		case "google":
			return usesApi(model, "google-generative-ai") && (advertised === true || isDirect(model, GOOGLE_HOST));
		case "google-vertex":
			return usesApi(model, "google-vertex") && (advertised === true || isDirect(model, VERTEX_HOST));
		case "openrouter":
			if (!advertised) return false;
			if (model.identity?.class) return model.identity.class === "openai" || model.identity.class === "gemini";
			return model.id.startsWith("openai/") || model.id.startsWith("google/");
		default:
			return advertised === true && isOpenAiCompatible(model);
	}
}

/** Ultrafast is a separate premium tier, requiring its own exact advertisement. */
export function supportsUltrafastMode(model: ModelInfo | null | undefined): boolean {
	if (!model?.serviceTiers?.includes("ultrafast") || model.provider === "openrouter") return false;
	return (
		isOpenAiCompatible(model) ||
		(model.api === undefined && (model.provider === "openai" || model.provider === "openai-codex"))
	);
}

export function supportsFastMode(model: ModelInfo | null | undefined): boolean {
	return supportsPriorityMode(model) || supportsUltrafastMode(model);
}
