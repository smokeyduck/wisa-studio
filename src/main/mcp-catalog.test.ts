import { describe, expect, it, vi } from "vitest";
import { MCP_REGISTRY_SERVERS_URL } from "../shared/mcp-catalog";
import { listMcpCatalog } from "./mcp-catalog";

function server(name: string, details: Record<string, unknown> = {}, status = "active") {
	return {
		server: { name, version: "2.0.1", description: "An MCP server", ...details },
		_meta: { "io.modelcontextprotocol.registry/official": { status } },
	};
}

const remote = (url: string, details: Record<string, unknown> = {}) => ({ type: "streamable-http", url, ...details });

function listResponse(servers: unknown[], nextCursor?: string): Response {
	return Response.json({ servers, metadata: { count: servers.length, nextCursor } });
}

describe("official MCP registry", () => {
	it("queries only the fixed latest-version API and forwards opaque search and page tokens", async () => {
		const cursor = "ac.inference.sh/mcp:2.0.1+next";
		const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
			listResponse(
				[
					server("ac.inference.sh/mcp", {
						title: "inference.sh",
						remotes: [remote("https://api.inference.sh/mcp")],
					}),
					server("io.example/deprecated", {}, "deprecated"),
					server("io.example/deleted", {}, "deleted"),
				],
				cursor,
			),
		);
		const page = await listMcpCatalog(fetch, { search: "  mcp & streams  ", cursor: "first+opaque/1" });
		const [[url, options]] = fetch.mock.calls;
		const parsed = new URL(url);
		expect(`${parsed.origin}${parsed.pathname}`).toBe(MCP_REGISTRY_SERVERS_URL);
		expect(parsed.searchParams.get("version")).toBe("latest");
		expect(parsed.searchParams.get("search")).toBe("mcp & streams");
		expect(parsed.searchParams.get("cursor")).toBe("first+opaque/1");
		expect(options).toMatchObject({ credentials: "omit", redirect: "error" });
		expect(page).toEqual({
			entries: [
				{
					name: "ac.inference.sh/mcp",
					title: "inference.sh",
					version: "2.0.1",
					description: "An MCP server",
					remote: { transport: "http", url: "https://api.inference.sh/mcp" },
				},
			],
			nextCursor: cursor,
		});
	});

	it("keeps unsupported entries visible without exposing local commands, headers, or URL templates", async () => {
		const fetch = vi.fn(async () =>
			listResponse([
				server("com.pulsemcp/remote-filesystem", {
					packages: [{ registryType: "npm", identifier: "remote-filesystem-mcp-server", runtimeHint: "npx" }],
				}),
				server("io.github.github/github-mcp-server", {
					remotes: [remote("https://api.githubcopilot.com/mcp/", { headers: [{ name: "Authorization" }] })],
				}),
				server("io.example/templated", { remotes: [remote("https://{tenant}.example.com/mcp")] }),
				server("io.example/insecure", { remotes: [remote("http://example.com/mcp")] }),
				server("io.example/loopback", { remotes: [remote("https://127.0.0.1/mcp")] }),
				server("io.example/valid-sse", {
					remotes: [remote("https://example.com/events", { type: "sse" })],
				}),
			]),
		);
		const { entries } = await listMcpCatalog(fetch, { search: "" });
		expect(entries).toHaveLength(6);
		for (const entry of entries.slice(0, -1)) {
			expect(Object.keys(entry).sort()).toEqual(["description", "name", "version"]);
		}
		expect(entries.at(-1)?.remote).toEqual({ transport: "sse", url: "https://example.com/events" });
	});

	it("rejects invalid IPC parameters and reports an upstream failure", async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 503 }));
		await expect(listMcpCatalog(fetch, { search: "x".repeat(201) })).rejects.toThrow("search");
		await expect(listMcpCatalog(fetch, { search: "", cursor: [] })).rejects.toThrow("cursor");
		expect(fetch).not.toHaveBeenCalled();
		await expect(listMcpCatalog(fetch, { search: "" })).rejects.toThrow("HTTP 503");
	});
});
