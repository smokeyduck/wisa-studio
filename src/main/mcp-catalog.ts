import { isIP } from "node:net";
import {
	MCP_REGISTRY_SEARCH_MAX,
	MCP_REGISTRY_SERVERS_URL,
	type McpCatalogEntry,
	type McpCatalogPage,
} from "../shared/mcp-catalog";
import { readCapped } from "./install-safety";

const PAGE_SIZE = 24;
const MAX_CURSOR = 1024;
const MAX_BYTES = 1_000_000;
const REGISTRY_NAME = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;
const OFFICIAL_META = "io.modelcontextprotocol.registry/official";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function quickRemote(value: unknown): McpCatalogEntry["remote"] {
	const remote = record(value);
	const transport = remote?.type === "streamable-http" ? "http" : remote?.type === "sse" ? "sse" : undefined;
	const raw = remote?.url;
	if (!transport || typeof raw !== "string" || raw.length > 2048 || /[{}]|%7[bd]/i.test(raw)) return;
	// Never evaluate variables or pass arbitrary headers, env, arguments, or executables on to Core.
	if (remote?.headers !== undefined && (!Array.isArray(remote.headers) || remote.headers.length !== 0)) return;
	if (remote?.variables !== undefined) {
		const variables = record(remote.variables);
		if (!variables || Object.keys(variables).length !== 0) return;
	}
	// Only direct, user-reviewed HTTPS endpoints; don't quick-connect to local addresses.
	const url = URL.parse(raw);
	if (url?.protocol !== "https:" || url.username || url.password || url.hash) return;
	const host = url.hostname.replace(/\.$/, "");
	if (!host.includes(".") || isIP(host) || /\.(local|localhost|internal|test|invalid)$/.test(host)) return;
	return { transport, url: url.href };
}

function toEntry(value: unknown): McpCatalogEntry | undefined {
	const envelope = record(value);
	const server = record(envelope?.server);
	if (!server) return;
	const official = record(record(envelope?._meta)?.[OFFICIAL_META]);
	if (official?.status && official.status !== "active") return;
	const { name, title, description, version } = server;
	if (typeof name !== "string" || name.length > 512 || !REGISTRY_NAME.test(name)) return;
	if (typeof description !== "string" || typeof version !== "string" || !version || version.length > 128) return;
	let remote: McpCatalogEntry["remote"];
	if (Array.isArray(server.remotes)) {
		for (const value of server.remotes) {
			const candidate = quickRemote(value);
			if (candidate?.transport === "http") {
				remote = candidate;
				break;
			}
			remote ??= candidate;
		}
	}
	return {
		name,
		...(typeof title === "string" && title.trim() ? { title: title.slice(0, 160) } : {}),
		description: description.slice(0, 1_000),
		version,
		...(remote ? { remote } : {}),
	};
}

/** The renderer can only query a fixed, unauthenticated official endpoint. */
export async function listMcpCatalog(fetch: Fetch, payload: unknown): Promise<McpCatalogPage> {
	const { search, cursor } = record(payload) ?? {};
	if (typeof search !== "string" || search.length > MCP_REGISTRY_SEARCH_MAX) {
		throw new Error("Invalid MCP registry search");
	}
	if (cursor !== undefined && (typeof cursor !== "string" || !cursor || cursor.length > MAX_CURSOR)) {
		throw new Error("Invalid MCP registry cursor");
	}
	const url = new URL(MCP_REGISTRY_SERVERS_URL);
	url.searchParams.set("limit", String(PAGE_SIZE));
	url.searchParams.set("version", "latest");
	if (search.trim()) url.searchParams.set("search", search.trim());
	if (typeof cursor === "string") url.searchParams.set("cursor", cursor);
	const response = await fetch(url.href, {
		credentials: "omit",
		redirect: "error",
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) throw new Error(`MCP registry returned HTTP ${response.status}`);
	const bytes = await readCapped(response, MAX_BYTES);
	const body = bytes && record(JSON.parse(bytes.toString("utf8")));
	if (!body || !Array.isArray(body.servers)) throw new Error("Invalid MCP registry response");
	const next = record(body.metadata)?.nextCursor;
	const entries = new Map<string, McpCatalogEntry>();
	for (const item of body.servers.slice(0, PAGE_SIZE)) {
		const entry = toEntry(item);
		if (entry) entries.set(entry.name, entry);
	}
	return {
		entries: [...entries.values()],
		...(typeof next === "string" && next.length > 0 && next.length <= MAX_CURSOR && next !== cursor
			? { nextCursor: next }
			: {}),
	};
}
