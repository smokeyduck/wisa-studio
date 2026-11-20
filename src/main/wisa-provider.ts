/**
 * WISA gateway provider, seeded once per profile.
 *
 * The gateway is a LiteLLM-style OpenAI-compatible endpoint (`/v1/models`
 * answers 401 without a key and a model list with one), so it needs no
 * hand-written model entries: `openai-models-list` discovery pulls the catalog
 * from the key. Seeding only writes the provider shell — no contextWindow or
 * maxTokens guesses, because the gateway does not report them.
 *
 * Idempotent: an existing `wisa` entry (including one the user edited) is left
 * untouched, so a deleted key or a custom baseUrl survives upgrades.
 */
import { WISA_PROVIDER_ID } from "../shared/wisa";
import { listModelsProviders, upsertModelsProvider } from "./models-config";

export { WISA_PROVIDER_ID };

const WISA_PROVIDER = {
	baseUrl: "https://api.askwisa.com/v1",
	api: "openai-completions",
	auth: "apiKey",
	discovery: { type: "openai-models-list" },
} as const;

/** Seed the WISA provider. Returns true when this run created it. */
export function ensureWisaProvider(): boolean {
	if (listModelsProviders().some(provider => provider.id === WISA_PROVIDER_ID)) return false;
	upsertModelsProvider({
		id: WISA_PROVIDER_ID,
		api: WISA_PROVIDER.api,
		baseUrl: WISA_PROVIDER.baseUrl,
		auth: WISA_PROVIDER.auth,
		discovery: WISA_PROVIDER.discovery,
		models: [],
	});
	return true;
}
