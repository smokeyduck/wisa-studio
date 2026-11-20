import type { ModelInfo } from "../../shared/rpc-types";

/** Provider families with their own serving-priority knob (see pi-ai's `serviceTierFamily`). */
export type ServiceTierFamily = "openai" | "anthropic" | "google";

const OPENAI_ID = /^(gpt-|o[1-9]|chatgpt-|codex-|computer-use-)/;
const OPENROUTER_PREFIX: Readonly<Record<string, ServiceTierFamily>> = {
	anthropic: "anthropic",
	google: "google",
	openai: "openai",
};

/**
 * Which family's service tier governs this model, or `undefined` when it has
 * none — the same classification pi-ai applies on the wire, mirrored here
 * because the wire carries `serviceTiers` but not `identity.class`.
 *
 * `undefined` is the answer that matters: the composer hides the speed control
 * rather than offering a knob the request will silently drop. Custom
 * OpenAI-compatible relays serving OpenAI model ids are the OpenAI family
 * unless the provider owns its own tier control (Fireworks) or rejects the
 * field outright (GitHub Copilot).
 */
export function serviceTierFamily(model: ModelInfo | null | undefined): ServiceTierFamily | undefined {
	if (!model) return undefined;
	const provider = model.provider;
	if (provider === "openrouter") return OPENROUTER_PREFIX[model.id.split("/", 1)[0] ?? ""];
	if (provider === "openai" || provider === "openai-codex") return "openai";
	// `anthropic` always speaks anthropic-messages; the api check also catches
	// Claude on Bedrock/Vertex, whose provider is not the family.
	if (provider === "anthropic" || model.api === "anthropic-messages") return "anthropic";
	if (provider === "google" || provider === "google-vertex") return "google";
	if (provider === "fireworks" || provider === "github-copilot") return undefined;
	const openAiApi =
		model.api === "openai-completions" || model.api === "openai-responses" || model.api === "openai-codex-responses";
	if (!openAiApi) return undefined;
	return OPENAI_ID.test(model.id) ? "openai" : undefined;
}

/** The composer's speed control has something to act on for this model. */
export function supportsFastMode(model: ModelInfo | null | undefined): boolean {
	return serviceTierFamily(model) !== undefined;
}
