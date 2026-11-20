/**
 * WISA STUDIO sign-in from the browser: `omp://wisa-auth?code=…`.
 *
 * The web app at askwisa.com holds the wallet key behind a JWT in an httpOnly
 * cookie, which this app cannot read and has no session for. So the browser
 * mints a one-time code and hands it over in the deep link; we trade the code
 * for the key over HTTPS and write it into the `wisa` provider entry.
 *
 * The key never passes through the renderer: the exchange and the models.yml
 * write both happen here. A renderer-side exchange would put the key in a page
 * context where every injected script can read it, and `models.yml` is the only
 * place the agent reads credentials from anyway.
 */
import { CUSTOM_PROVIDER_APIS, type CustomProviderApi, type CustomProviderInput } from "../shared/ipc-types";
import { WISA_PROVIDER_ID, WISA_WEB_ORIGIN } from "../shared/wisa";
import { listModelsProviders, upsertModelsProvider } from "./models-config";

/** The route the web app answers with a wallet key for a valid code. */
export const WISA_EXCHANGE_URL = `${WISA_WEB_ORIGIN}/api/desktop/exchange`;

/** A code is valid for two minutes; do not sit on the request longer than that. */
const EXCHANGE_TIMEOUT_MS = 20_000;

export type WisaConnectResult = { ok: true; email: string; baseUrl: string } | { ok: false; reason: string };

type ExchangeBody = {
	apiKey?: unknown;
	baseUrl?: unknown;
	email?: unknown;
	error?: unknown;
};

function asNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Trade a one-time code for the wallet key. Returns the failure message rather
 * than throwing: every failure here is something the user must read ("code
 * expired, press Connect again"), not a crash.
 */
export async function exchangeWisaCode(
	code: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; apiKey: string; baseUrl?: string; email?: string } | { ok: false; reason: string }> {
	const trimmed = code.trim();
	if (trimmed.length === 0) return { ok: false, reason: "Empty connection code." };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), EXCHANGE_TIMEOUT_MS);
	try {
		const response = await fetchImpl(WISA_EXCHANGE_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify({ code: trimmed }),
			signal: controller.signal,
		});

		let body: ExchangeBody = {};
		try {
			body = (await response.json()) as ExchangeBody;
		} catch {
			// Non-JSON body (a proxy error page): fall through to the status check.
		}

		if (!response.ok) {
			// The server's own sentence is the one the user can act on.
			const message = asNonEmptyString(body.error);
			return { ok: false, reason: message ?? `The server answered ${response.status}.` };
		}

		const apiKey = asNonEmptyString(body.apiKey);
		if (!apiKey) return { ok: false, reason: "The server returned no key." };

		return {
			ok: true,
			apiKey,
			baseUrl: asNonEmptyString(body.baseUrl),
			email: asNonEmptyString(body.email),
		};
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return { ok: false, reason: aborted ? "The server took too long to answer." : "Could not reach the server." };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * models.yml is free-form: an api value outside the enum would fail the agent's
 * validation and take every provider down with it, so fall back to the default.
 */
function asProviderApi(value: string | undefined): CustomProviderApi {
	return CUSTOM_PROVIDER_APIS.includes(value as CustomProviderApi)
		? (value as CustomProviderApi)
		: "openai-completions";
}

/**
 * Store the key on the `wisa` provider. Everything the user configured stays:
 * base URL, model list, headers, routing transport. Only `apiKey` is written,
 * because an exchange is a sign-in, not a provider reset.
 */
export function applyWisaCredentials(input: { apiKey: string; baseUrl?: string }): void {
	const existing = listModelsProviders().find(provider => provider.id === WISA_PROVIDER_ID);
	const entry: CustomProviderInput = {
		id: WISA_PROVIDER_ID,
		// A seeded entry already carries these; a fresh profile gets the defaults.
		api: asProviderApi(existing?.api),
		baseUrl: existing?.baseUrl ?? input.baseUrl ?? "https://api.askwisa.com/v1",
		apiKey: input.apiKey,
		auth: existing?.auth ?? "apiKey",
		discovery: existing?.discovery ?? { type: "openai-models-list" },
		models: existing?.models ?? [],
	};
	// Only set what the user actually has, so an untouched entry stays untouched.
	if (existing?.headers) entry.headers = existing.headers;
	if (existing?.authHeader !== undefined) entry.authHeader = existing.authHeader;
	if (existing?.disableStrictTools !== undefined) entry.disableStrictTools = existing.disableStrictTools;
	if (existing?.transport !== undefined) entry.transport = existing.transport;
	if (existing?.extraBody) entry.extraBody = existing.extraBody;
	upsertModelsProvider(entry);
}

/** Deep-link code → stored key. The one entry point the IPC handler calls. */
export async function connectWisa(code: string, fetchImpl: typeof fetch = fetch): Promise<WisaConnectResult> {
	const exchanged = await exchangeWisaCode(code, fetchImpl);
	if (!exchanged.ok) return { ok: false, reason: exchanged.reason };
	applyWisaCredentials({ apiKey: exchanged.apiKey, baseUrl: exchanged.baseUrl });
	return { ok: true, email: exchanged.email ?? "", baseUrl: exchanged.baseUrl ?? "" };
}
