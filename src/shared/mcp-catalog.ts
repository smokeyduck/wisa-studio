export const MCP_REGISTRY_SERVERS_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";
export const MCP_REGISTRY_SEARCH_MAX = 200;

export interface McpCatalogRequest {
	search: string;
	cursor?: string;
}

export interface McpCatalogEntry {
	name: string;
	title?: string;
	description: string;
	version: string;
	/** A directly usable remote. Local packages and parameterized remotes require manual setup. */
	remote?: { transport: "http" | "sse"; url: string };
}

export interface McpCatalogPage {
	entries: McpCatalogEntry[];
	nextCursor?: string;
}
