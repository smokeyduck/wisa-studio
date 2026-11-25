/**
 * What an agent spawn ends up with for each place a proxy can come from: a proxy
 * the agent can't use fails every request before it leaves the machine, so it is
 * skipped for the next source and reported, without ever repeating its value.
 */
import { describe, expect, it, vi } from "vitest";
import { LOCAL_NO_PROXY } from "../shared/proxy";
import { dropUnsupportedProxies, type ProxySources, resolveProxyForSpawn } from "./proxy-env";

const SOCKS = "socks5://127.0.0.1:1085";
const HTTP = "http://127.0.0.1:7890";

const resolve = (sources: Partial<ProxySources>) =>
	resolveProxyForSpawn({ pref: undefined, inherited: {}, systemPac: async () => "DIRECT", ...sources });

describe("resolveProxyForSpawn: saved setting", () => {
	it("gives a usable setting to every variable the agent and Bun read", async () => {
		const { env, dropped } = await resolve({ pref: HTTP, systemPac: async () => "PROXY 10.0.0.1:1" });
		expect(env).toEqual({
			PI_PROXY: HTTP,
			HTTPS_PROXY: HTTP,
			HTTP_PROXY: HTTP,
			ALL_PROXY: HTTP,
			https_proxy: HTTP,
			http_proxy: HTTP,
			all_proxy: HTTP,
			NO_PROXY: LOCAL_NO_PROXY,
			no_proxy: LOCAL_NO_PROXY,
		});
		expect(dropped).toEqual([]);
	});

	it("reads a value with no scheme as http", async () => {
		const { env } = await resolve({ pref: " 127.0.0.1:7890 " });
		expect(env.HTTPS_PROXY).toBe(HTTP);
	});

	it("skips a saved SOCKS setting for the system proxy and reports it", async () => {
		const { env, dropped } = await resolve({ pref: SOCKS, systemPac: async () => "PROXY 127.0.0.1:7890" });
		expect(env.HTTPS_PROXY).toBe(HTTP);
		expect(dropped).toEqual([{ source: "setting" }]);
	});

	it("skips a saved SOCKS setting for a usable inherited proxy without asking the system", async () => {
		const systemPac = vi.fn(async () => "PROXY 10.0.0.1:1");
		const { env, dropped } = await resolve({ pref: SOCKS, inherited: { HTTPS_PROXY: HTTP }, systemPac });
		expect(env).toEqual({ NO_PROXY: LOCAL_NO_PROXY, no_proxy: LOCAL_NO_PROXY });
		expect(dropped).toEqual([{ source: "setting" }]);
		expect(systemPac).not.toHaveBeenCalled();
	});

	it("overrides an inherited SOCKS proxy silently, since the setting replaces it", async () => {
		const { dropped } = await resolve({ pref: HTTP, inherited: { HTTPS_PROXY: SOCKS, ALL_PROXY: SOCKS } });
		expect(dropped).toEqual([]);
	});

	it("reports a per-provider SOCKS override the setting doesn't replace", async () => {
		const { dropped } = await resolve({ pref: HTTP, inherited: { PI_PROXY_ANTHROPIC: SOCKS } });
		expect(dropped).toEqual([{ source: "environment", names: ["PI_PROXY_ANTHROPIC"] }]);
	});
});

describe("resolveProxyForSpawn: inherited environment", () => {
	it("reports an inherited SOCKS proxy by name and lets the system proxy take over", async () => {
		const { env, dropped } = await resolve({
			inherited: { HTTPS_PROXY: SOCKS, https_proxy: SOCKS },
			systemPac: async () => "PROXY 127.0.0.1:7890",
		});
		expect(env.HTTPS_PROXY).toBe(HTTP);
		expect(dropped).toEqual([{ source: "environment", names: ["HTTPS_PROXY", "https_proxy"] }]);
	});

	it("reports ALL_PROXY when it was the only choice", async () => {
		const { dropped } = await resolve({ inherited: { ALL_PROXY: SOCKS } });
		expect(dropped).toEqual([{ source: "environment", names: ["ALL_PROXY"] }]);
	});

	it("stays quiet about all_proxy beside a working https_proxy, the shape proxy clients' shell command emits", async () => {
		const systemPac = vi.fn(async () => "PROXY 10.0.0.1:1");
		const { env, dropped } = await resolve({
			inherited: { https_proxy: HTTP, http_proxy: HTTP, all_proxy: SOCKS },
			systemPac,
		});
		expect(env).toEqual({ NO_PROXY: LOCAL_NO_PROXY, no_proxy: LOCAL_NO_PROXY });
		expect(dropped).toEqual([]);
		expect(systemPac).not.toHaveBeenCalled();
	});

	it("preserves an inherited HTTP-only choice without promoting it to HTTPS", async () => {
		const systemPac = vi.fn(async () => "PROXY 10.0.0.1:1");
		const { env } = await resolve({ inherited: { HTTP_PROXY: HTTP }, systemPac });
		expect(env).toEqual({ NO_PROXY: LOCAL_NO_PROXY, no_proxy: LOCAL_NO_PROXY });
		expect(systemPac).not.toHaveBeenCalled();
	});

	it("keeps a provider-only override without converting it to a global proxy", async () => {
		const { env } = await resolve({ inherited: { PI_PROXY_OPENAI: HTTP } });
		expect(env).toEqual({ NO_PROXY: LOCAL_NO_PROXY, no_proxy: LOCAL_NO_PROXY });
	});

	it("still reports a SOCKS HTTP_PROXY beside a working https_proxy", async () => {
		const { dropped } = await resolve({ inherited: { HTTPS_PROXY: HTTP, HTTP_PROXY: SOCKS } });
		expect(dropped).toEqual([{ source: "environment", names: ["HTTP_PROXY"] }]);
	});

	it("names the variable without repeating a value that may hold credentials", async () => {
		const { dropped } = await resolve({ inherited: { HTTPS_PROXY: "socks5://user:hunter2@127.0.0.1:1085" } });
		expect(JSON.stringify(dropped)).not.toContain("hunter2");
	});
});

describe("resolveProxyForSpawn: system proxy", () => {
	it.each([
		["PROXY 127.0.0.1:7890", "http://127.0.0.1:7890", []],
		["HTTPS 127.0.0.1:7890", "https://127.0.0.1:7890", []],
		["SOCKS5 127.0.0.1:1085; PROXY 127.0.0.1:7890; DIRECT", "http://127.0.0.1:7890", []],
		["SOCKS5 127.0.0.1:1085", undefined, [{ source: "system" }]],
		["SOCKS 127.0.0.1:1085; DIRECT", undefined, [{ source: "system" }]],
		["DIRECT", undefined, []],
		["DIRECT; SOCKS5 127.0.0.1:1085", undefined, []],
	])("%s", async (pac, proxy, warnings) => {
		const { env, dropped } = await resolve({ systemPac: async () => pac });
		expect(env.HTTPS_PROXY).toBe(proxy);
		expect(env.NO_PROXY).toBe(proxy ? LOCAL_NO_PROXY : undefined);
		expect(dropped).toEqual(warnings);
	});

	it("treats a failed system lookup as having no proxy", async () => {
		const result = await resolve({ systemPac: () => Promise.reject(new Error("no session")) });
		expect(result).toEqual({ env: {}, dropped: [] });
	});
});

describe("resolveProxyForSpawn: bypass rules", () => {
	it.each([
		{ pref: HTTP },
		{ inherited: { HTTPS_PROXY: HTTP } },
		{ systemPac: async () => "PROXY 127.0.0.1:7890" },
	] satisfies Partial<ProxySources>[])("merges user lists with local and metadata rules: %j", async sources => {
		const { env } = await resolve({
			...sources,
			inherited: {
				...sources.inherited,
				NO_PROXY: "git.corp.example .internal",
				no_proxy: "GIT.CORP.EXAMPLE, wiki.example:443, *",
			},
		});
		expect(env.NO_PROXY).toBe(`git.corp.example,.internal,wiki.example:443,*,${LOCAL_NO_PROXY}`);
		expect(env.no_proxy).toBe(env.NO_PROXY);
	});

	it("bypasses the pinned Core's local, private and metadata ranges", () => {
		expect(LOCAL_NO_PROXY.split(",")).toEqual([
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
		]);
	});
});

describe("resolveProxyForSpawn: direct connection", () => {
	it("clears launch and per-provider proxy variables without consulting PAC or modifying NO_PROXY", async () => {
		const systemPac = vi.fn(async () => "PROXY 10.0.0.1:1");
		const inherited = { HTTPS_PROXY: HTTP, PI_PROXY_ANTHROPIC: HTTP, Http_Proxy: SOCKS, NO_PROXY: "git.example" };
		const { env, dropped } = await resolve({ direct: true, pref: HTTP, inherited, systemPac });
		expect(env).toEqual({
			PI_PROXY: "",
			HTTPS_PROXY: "",
			HTTP_PROXY: "",
			ALL_PROXY: "",
			https_proxy: "",
			http_proxy: "",
			all_proxy: "",
			PI_PROXY_ANTHROPIC: "",
			Http_Proxy: "",
		});
		expect(dropped).toEqual([]);
		expect(systemPac).not.toHaveBeenCalled();
	});
});

describe("dropUnsupportedProxies", () => {
	it("removes only proxy variables the agent can't use", () => {
		expect(
			dropUnsupportedProxies({
				HTTPS_PROXY: HTTP,
				HTTP_PROXY: "127.0.0.1:7890",
				ALL_PROXY: SOCKS,
				all_proxy: "SOCKS5://127.0.0.1:1085",
				https_proxy: "socks5h://127.0.0.1:1085",
				PI_PROXY: "ftp://127.0.0.1:21",
				PI_PROXY_ANTHROPIC: SOCKS,
				NO_PROXY: "localhost",
				DOCS_URL: SOCKS,
			}),
		).toEqual({ HTTPS_PROXY: HTTP, HTTP_PROXY: "127.0.0.1:7890", NO_PROXY: "localhost", DOCS_URL: SOCKS });
	});
});
