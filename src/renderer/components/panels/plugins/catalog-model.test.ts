import { describe, expect, it } from "vitest";
import type { RpcMarketplacePluginInfo } from "../../../../shared/rpc-types";
import {
	catalogCategories,
	DEFAULT_CATALOGS,
	dedupeCatalog,
	filterCatalog,
	humanizePluginName,
	isCatalogListed,
	stripReadmeImages,
	toCatalogPlugin,
} from "./catalog-model";

const MARKETPLACE = { name: "official", source: "anthropics/claude-plugins-official" };

function plugin(info: Partial<RpcMarketplacePluginInfo> & { name: string }) {
	return toCatalogPlugin(MARKETPLACE, { installed: false, ...info });
}

const PLUGINS = [
	plugin({ name: "slack", description: "Read channels", category: "productivity", tags: ["chat"] }),
	plugin({ name: "datadog-logs", displayName: "Datadog", category: "monitoring", installed: true }),
	plugin({ name: "notion", description: "Search pages", category: "productivity", author: "Makenotion" }),
];

const titles = (query: string, view: "all" | "installed" = "all", category: string | null = null): string[] =>
	filterCatalog(PLUGINS, { query, view, category, catalog: null }).map(entry => entry.title);

describe("filterCatalog", () => {
	it("sorts by what people see and searches every field shown on a card", () => {
		expect(titles("")).toEqual(["Datadog", "Notion", "Slack"]);
		expect(titles("channels")).toEqual(["Slack"]);
		expect(titles("MAKENOTION")).toEqual(["Notion"]);
		expect(titles("chat")).toEqual(["Slack"]);
	});

	it("needs every word to match, not just one", () => {
		expect(titles("search pages")).toEqual(["Notion"]);
		expect(titles("search channels")).toEqual([]);
	});

	it("combines the installed view and the category with the search", () => {
		expect(titles("", "installed")).toEqual(["Datadog"]);
		expect(titles("", "all", "productivity")).toEqual(["Notion", "Slack"]);
		expect(titles("", "installed", "productivity")).toEqual([]);
	});
});

describe("dedupeCatalog", () => {
	const FIRST = { name: "first", source: "a/first" };
	const SECOND = { name: "second", source: "b/second" };
	const from = (marketplace: typeof FIRST, info: Partial<RpcMarketplacePluginInfo>) =>
		toCatalogPlugin(marketplace, { name: "apollo", installed: false, ...info });
	const ids = (...plugins: ReturnType<typeof from>[]) => dedupeCatalog(plugins).map(entry => entry.id);

	it("keeps the OpenAI copy when browsing or searching that marketplace", () => {
		const openAi = { name: "openai-curated", source: "/fixture/openai-curated" };
		const rows = [from(FIRST, { description: "Search contacts" }), from(openAi, { description: "Search contacts" })];
		const filters = { query: "", category: null, view: "all" } as const;
		expect(filterCatalog(rows, { ...filters, catalog: null }).map(row => row.id)).toEqual(["apollo@first"]);
		expect(filterCatalog(rows, { ...filters, catalog: openAi.name }).map(row => row.id)).toEqual([
			"apollo@openai-curated",
		]);
		expect(filterCatalog(rows, { ...filters, catalog: null, query: "openai" }).map(row => row.id)).toEqual([
			"apollo@openai-curated",
		]);
	});

	it("shows the earlier catalog's copy of a plugin hosted in the same place, whatever commit each pins", () => {
		const url = "https://github.com/apolloio/plugin";
		expect(
			ids(
				from(FIRST, { source: { source: "url", url: `${url}.git`, sha: "aaa" } }),
				from(SECOND, { source: { source: "url", url, sha: "bbb" } }),
			),
		).toEqual(["apollo@first"]);
	});

	it("prefers the higher-ranked default when an upgraded registry lists it later", () => {
		const earlier = DEFAULT_CATALOGS[0];
		const later = DEFAULT_CATALOGS.at(-1);
		if (!earlier || !later || earlier === later) throw new Error("Expected two distinct default catalogs");
		const info = { description: "Prospect leads" };
		const firstDefault = from({ ...earlier, source: `https://github.com/${earlier.source}` }, info);
		const lastDefault = from(later, info);
		const custom = from(FIRST, info);
		expect(ids(lastDefault, firstDefault)).toEqual([firstDefault.id]);
		expect(ids(from(later, { ...info, installed: true }), firstDefault)).toEqual([lastDefault.id]);
		expect(ids(custom, lastDefault, firstDefault)).toEqual([custom.id]);
		expect(ids(firstDefault, custom)).toEqual([firstDefault.id]);
	});

	it("treats a matching description as the same plugin when one catalog carries its own copy", () => {
		expect(
			ids(
				from(FIRST, { description: "Prospect leads", source: { source: "url", url: "https://github.com/a/b" } }),
				from(SECOND, { description: "Prospect leads", source: "./partner-built/apollo" }),
			),
		).toEqual(["apollo@first"]);
	});

	it("keeps different plugins that happen to share a name", () => {
		expect(
			ids(
				from(FIRST, { name: "data", description: "Airflow pipelines", source: "./data" }),
				from(SECOND, { name: "data", description: "Write SQL", source: "./data" }),
			),
		).toEqual(["data@first", "data@second"]);
	});

	it("shows the installed copy, and both when both are installed, so either can be removed", () => {
		const url = "https://github.com/a/b";
		const entry = { source: { source: "url", url } as const };
		expect(ids(from(FIRST, entry), from(SECOND, { ...entry, installed: true }))).toEqual(["apollo@second"]);
		expect(ids(from(FIRST, { ...entry, installed: true }), from(SECOND, { ...entry, installed: true }))).toEqual([
			"apollo@first",
			"apollo@second",
		]);
	});
});

describe("DEFAULT_CATALOGS", () => {
	const names = new Map(DEFAULT_CATALOGS.map(catalog => [catalog.source, catalog.name]));

	it("ships the vendor catalogs that actually serve a marketplace.json", () => {
		// Each of these answered 200 with a `plugins` array when it was added; a
		// catalog that 404s would cost every user a failed download on first run.
		expect(
			DEFAULT_CATALOGS.map(catalog => catalog.source).filter(source =>
				[
					"cloudflare/skills",
					"getsentry/sentry-skills",
					"huggingface/skills",
					"microsoft/skills",
					"openai/codex-plugin-cc",
					"supabase/agent-skills",
				].includes(source),
			),
		).toHaveLength(6);
		expect(names.get("cloudflare/skills")).toBe("cloudflare");
		expect(names.get("supabase/agent-skills")).toBe("supabase-agent-skills");
		expect(names.get("getsentry/sentry-skills")).toBe("sentry-skills");
		expect(names.get("huggingface/skills")).toBe("huggingface-skills");
		// The catalog names itself "skills", and the agent keys its registry by that name.
		expect(names.get("microsoft/skills")).toBe("skills");
		expect(names.get("openai/codex-plugin-cc")).toBe("openai-codex");
		expect(names.get("aws/agent-toolkit-for-aws")).toBe("agent-toolkit-for-aws");
		expect(names.get("dotnet/skills")).toBe("dotnet-agent-skills");
		expect(names.get("flutter/agent-plugins")).toBe("dart-flutter");
	});

	it("recognises community catalogs by their declared names", () => {
		expect(names.get("EveryInc/compound-engineering-plugin")).toBe("compound-engineering-plugin");
		expect(names.get("anthropics/claude-plugins-community")).toBe("claude-community");
	});

	it("names every catalog once, and never with an address twice", () => {
		// The agent refuses a second marketplace under a name it already has (case-
		// insensitively, since the cache is a folder), so a duplicate would be an
		// error the person sees on first run for no reason.
		const lowered = DEFAULT_CATALOGS.map(catalog => catalog.name.toLowerCase());
		expect(new Set(lowered).size).toBe(lowered.length);
		const sources = DEFAULT_CATALOGS.map(catalog => catalog.source);
		expect(new Set(sources).size).toBe(sources.length);
		// `name@marketplace` ids are built from these, and both segments are slugs.
		for (const catalog of DEFAULT_CATALOGS) expect(catalog.name).toMatch(/^[a-z0-9][a-z0-9.-]*$/);
	});

	it("puts first-party catalogs before community ones, which is the duplicate tie-break", () => {
		// Earlier catalogs win when two list the same plugin, so Anthropic's and the
		// vendors' own go first and the community ones last.
		const position = new Map(DEFAULT_CATALOGS.map((catalog, index) => [catalog.source, index]));
		const lastVendor = Math.max(
			position.get("anthropics/claude-plugins-official") ?? Number.POSITIVE_INFINITY,
			position.get("microsoft/skills") ?? Number.POSITIVE_INFINITY,
			position.get("openai/codex-plugin-cc") ?? Number.POSITIVE_INFINITY,
			position.get("workos/skills") ?? Number.POSITIVE_INFINITY,
		);
		for (const community of [
			"wshobson/agents",
			"trailofbits/skills",
			"obra/superpowers-marketplace",
			"phuryn/pm-skills",
			"EveryInc/compound-engineering-plugin",
			"anthropics/claude-plugins-community",
		])
			expect(position.get(community)).toBeGreaterThan(lastVendor);
	});
});

describe("isCatalogListed", () => {
	const DEFAULT = { source: "trailofbits/skills", name: "trailofbits" };

	it("recognises a catalog added under another address or spelled in another case", () => {
		expect(isCatalogListed([{ name: "trailofbits", source: "https://github.com/trailofbits/skills" }], DEFAULT)).toBe(
			true,
		);
		expect(isCatalogListed([{ name: "TrailOfBits", source: "/tmp/copy" }], DEFAULT)).toBe(true);
		expect(isCatalogListed([{ name: "mine", source: "me/plugins" }], DEFAULT)).toBe(false);
	});
});

describe("catalogCategories", () => {
	it("orders by size and leaves out plugins with no category", () => {
		expect(catalogCategories([...PLUGINS, plugin({ name: "bare" })])).toEqual([
			{ id: "productivity", count: 2 },
			{ id: "monitoring", count: 1 },
		]);
	});
});

describe("toCatalogPlugin", () => {
	it("prefers the catalog's display name and uses the agent's id for the plugin", () => {
		const entry = plugin({ name: "datadog-logs", displayName: "Datadog" });
		expect(entry.title).toBe("Datadog");
		expect(entry.id).toBe("datadog-logs@official");
		expect(humanizePluginName("code_review-tool")).toBe("Code Review Tool");
		expect(humanizePluginName("agent-sdk-dev")).toBe("Agent SDK Dev");
		// Only whole words: "aiven" and "apify" stay names.
		expect(humanizePluginName("aiven-apify")).toBe("Aiven Apify");
	});
});

describe("stripReadmeImages", () => {
	it("removes badges, images and HTML images but leaves ordinary links", () => {
		const readme = [
			"# Title",
			"[![CI](https://x.test/b.svg)](https://x.test/ci)",
			"![shot](./a.png)",
			'<img src="https://x.test/a.png" width="10">',
			"See [the docs](https://x.test/docs).",
		].join("\n");
		expect(stripReadmeImages(readme)).toBe("# Title\n\nSee [the docs](https://x.test/docs).");
	});
});
