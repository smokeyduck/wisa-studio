/**
 * Bun's fetch, which carries every agent request, only speaks http:// and
 * https:// proxies. Any other scheme (socks5://, socks5h://, ...) fails before
 * touching the network; a value with no scheme is read as http://.
 */
export function isUnsupportedProxyUrl(value: string): boolean {
	const scheme = /^\s*([a-z][a-z0-9+.-]*):\/\//i.exec(value)?.[1]?.toLowerCase();
	return scheme !== undefined && scheme !== "http" && scheme !== "https";
}

/** A proxy the GUI kept from the agent. Never carries the value, which may hold credentials. */
export type DroppedProxy = { source: "setting" } | { source: "environment"; names: string[] } | { source: "system" };

/**
 * Core skips proxy injection for these targets, but Bun fetch can still pick
 * up an env proxy. Mirror Core's local/metadata rules in Bun's NO_PROXY syntax.
 */
export const LOCAL_NO_PROXY = [
	"localhost",
	".localhost",
	"127.0.0.0/8",
	"0.0.0.0/8",
	"::1",
	"::",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"169.254.0.0/16",
	"fe80::/10",
	"fc00::/7",
	"metadata.google.internal",
].join(",");

/** Combine Core-compatible comma/whitespace-separated lists for Bun fetch. */
export function mergeNoProxy(...lists: (string | undefined)[]): string {
	const seen = new Set<string>();
	const rules: string[] = [];
	for (const list of lists) {
		if (!list) continue;
		for (const rule of list.split(/[,\s]+/)) {
			if (!rule) continue;
			const key = rule.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			rules.push(rule);
		}
	}
	return rules.join(",");
}
