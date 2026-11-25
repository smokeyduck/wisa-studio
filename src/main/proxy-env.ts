/**
 * The proxy env each agent spawn gets. The agent reads proxy config from env
 * vars only (PI_PROXY_* → PI_PROXY → HTTPS_PROXY → ALL_PROXY). A Finder-launched
 * app has no shell env, so a proxy-only network (codex's chatgpt.com backend
 * behind a firewall) would silently hang every provider request. Resolution
 * order per spawn: explicit GUI pref → inherited env (terminal launch) → system
 * proxy. A source the agent can't use is skipped and reported, so the next one
 * still gets its chance. Direct mode skips all sources, and any usable proxy
 * gets the same local/metadata bypass list, including inherited proxy values.
 */
import { type DroppedProxy, isUnsupportedProxyUrl, LOCAL_NO_PROXY, mergeNoProxy } from "../shared/proxy";

export interface ProxySources {
	/** The saved `proxyUrl` preference, unvalidated: prefs.json may predate the settings check. */
	pref: unknown;
	/** Opt out of every proxy source, including the system proxy. */
	direct?: boolean;
	/** What the spawn would otherwise inherit. */
	inherited: NodeJS.ProcessEnv;
	/** Chromium's PAC result for a representative URL. */
	systemPac: () => Promise<string>;
}

export interface ProxyResolution {
	/** Layered over the inherited env; empty means "keep what's inherited". */
	env: Record<string, string>;
	dropped: DroppedProxy[];
}

const PROVIDER_PROXY_VAR = /^PI_PROXY_./;
const FALLBACK_PROXY_VAR = /^all_proxy$/i;
const PROXY_VAR = /^(?:PI_PROXY(?:_.+)?|https?_proxy|all_proxy)$/i;
const STANDARD_PROXY_VARS = [
	"PI_PROXY",
	"HTTPS_PROXY",
	"HTTP_PROXY",
	"ALL_PROXY",
	"https_proxy",
	"http_proxy",
	"all_proxy",
];

/** Expand one proxy URL into the full env-var set the agent and Bun honor. */
function proxyEnvVars(proxyUrl: string, inherited: NodeJS.ProcessEnv): Record<string, string> {
	const env = bypassEnvVars(inherited);
	for (const name of STANDARD_PROXY_VARS) env[name] = proxyUrl;
	return env;
}

function bypassEnvVars(inherited: NodeJS.ProcessEnv): Record<string, string> {
	const noProxy = mergeNoProxy(inherited.NO_PROXY, inherited.no_proxy, LOCAL_NO_PROXY);
	return { NO_PROXY: noProxy, no_proxy: noProxy };
}

/** Empty values must survive layering, rather than revealing inherited proxies again. */
function directEnvVars(inherited: NodeJS.ProcessEnv): Record<string, string> {
	const env: Record<string, string> = {};
	for (const name of STANDARD_PROXY_VARS) env[name] = "";
	for (const name of Object.keys(inherited)) {
		if (PROXY_VAR.test(name)) env[name] = "";
	}
	return env;
}

/** Accept "127.0.0.1:7890" shorthand; keep explicit schemes as-is. */
function normalizeProxyUrl(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.includes("://")) return trimmed;
	return `http://${trimmed}`;
}

/**
 * Walk a Chromium PAC result ("SOCKS5 h:p; PROXY h:p; DIRECT") in its own
 * fallback order, past the entries the agent can't use. `DIRECT` ends the walk:
 * anything after it was never going to be tried.
 */
function parsePacResult(pac: string): { url?: string; socksOnly: boolean } {
	let sawSocks = false;
	for (const entry of pac.split(";")) {
		const [kind, endpoint] = entry.trim().split(/\s+/, 2);
		if (kind === "DIRECT") break;
		if (!endpoint) continue;
		if (kind === "PROXY") return { url: `http://${endpoint}`, socksOnly: false };
		if (kind === "HTTPS") return { url: `https://${endpoint}`, socksOnly: false };
		if (kind?.startsWith("SOCKS")) sawSocks = true;
	}
	return { socksOnly: sawSocks };
}

export async function resolveProxyForSpawn({
	pref,
	direct,
	inherited,
	systemPac,
}: ProxySources): Promise<ProxyResolution> {
	if (direct) return { env: directEnvVars(inherited), dropped: [] };
	const usableProxy = (name: string) => {
		const value = inherited[name];
		return !!value && !isUnsupportedProxyUrl(value);
	};
	const unusableVars = Object.keys(inherited).filter(
		name => PROXY_VAR.test(name) && isUnsupportedProxyUrl(inherited[name] ?? ""),
	);
	const dropped: DroppedProxy[] = [];
	const reportVars = (names: string[]) => {
		if (names.length > 0) dropped.push({ source: "environment", names });
	};

	if (typeof pref === "string" && pref.trim()) {
		const url = normalizeProxyUrl(pref);
		if (!isUnsupportedProxyUrl(url)) {
			// The setting replaces every standard variable, so only a per-provider one can go unnoticed.
			reportVars(unusableVars.filter(name => PROVIDER_PROXY_VAR.test(name)));
			return { env: proxyEnvVars(url, inherited), dropped };
		}
		dropped.push({ source: "setting" });
	}

	// A provider-specific override does not choose an app-wide proxy for other providers.
	if (STANDARD_PROXY_VARS.some(usableProxy)) {
		// `all_proxy=socks5://…` beside a working https_proxy is what proxy clients'
		// "copy shell command" emits. Nothing the user asked for is lost without it.
		reportVars(unusableVars.filter(name => !FALLBACK_PROXY_VAR.test(name)));
		return { env: bypassEnvVars(inherited), dropped };
	}
	reportVars(unusableVars);

	try {
		const { url, socksOnly } = parsePacResult(await systemPac());
		if (url) return { env: proxyEnvVars(url, inherited), dropped };
		if (socksOnly) dropped.push({ source: "system" });
	} catch {
		// No system proxy answer: same as having none.
	}
	const hasProviderProxy = Object.keys(inherited).some(name => PROVIDER_PROXY_VAR.test(name) && usableProxy(name));
	return { env: hasProviderProxy ? bypassEnvVars(inherited) : {}, dropped };
}

/**
 * The last stop before an agent process: its proxy vars keep only what it can
 * use, whichever of the inherited, login-shell or GUI layers they came from.
 */
export function dropUnsupportedProxies(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const kept: NodeJS.ProcessEnv = {};
	for (const [name, value] of Object.entries(env)) {
		if (PROXY_VAR.test(name) && isUnsupportedProxyUrl(value ?? "")) continue;
		kept[name] = value;
	}
	return kept;
}
