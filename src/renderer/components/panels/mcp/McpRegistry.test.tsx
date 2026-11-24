import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpCatalogEntry, McpCatalogPage, McpCatalogRequest } from "../../../../shared/mcp-catalog";
import type { RpcMcpServerInfo, RpcMcpServerInput, RpcResponse } from "../../../../shared/rpc-types";
import { I18nProvider } from "../../../lib/i18n";
import { resetTabRoute } from "../../../lib/tab-routing";
import { useSessionStore } from "../../../stores/session";
import { useTabsStore } from "../../../stores/tabs";
import { ExtensionSettingsPage } from "../ExtensionsPanel";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, {
	document,
	window,
	Event,
	HTMLElement,
	Element,
	Node,
	IS_REACT_ACT_ENVIRONMENT: true,
	requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
	cancelAnimationFrame: (handle: NodeJS.Timeout) => clearTimeout(handle),
});
Object.assign(window, { setTimeout, clearTimeout });

const INFERENCE: McpCatalogEntry = {
	name: "ac.inference.sh/mcp",
	title: "inference.sh",
	description: "Connect inference tools.",
	version: "2.0.1",
	remote: { transport: "http", url: "https://api.inference.sh/mcp" },
};
const FILESYSTEM: McpCatalogEntry = {
	name: "com.pulsemcp/remote-filesystem",
	description: "MCP server for remote filesystem operations on cloud storage.",
	version: "0.1.5",
};

const success = (command: string, data: unknown): RpcResponse => ({ type: "response", command, success: true, data });

let root: Root | undefined;
let container: InstanceType<typeof HTMLElement> | undefined;

async function mount(list: (request: McpCatalogRequest) => Promise<McpCatalogPage>) {
	useSessionStore.setState({ status: "ready", cwd: "/repo" });
	useTabsStore.setState({
		activeTabId: "t1",
		tabs: [{ id: "t1", cwd: "/repo", status: "ready", kind: "agent", unreadDone: false }],
		bundles: new Map(),
	});
	resetTabRoute();
	let servers: RpcMcpServerInfo[] = [];
	const mcpAdd = vi.fn(async (name: string, config: RpcMcpServerInput, scope: "user" | "project") => {
		servers = [
			{
				name,
				scope,
				enabled: true,
				authed: false,
				status: "connected",
				toolCount: 1,
				transport: config.transport,
				url: config.url,
			},
		];
		return success("mcp_add", { added: true });
	});
	const mcpAction = vi.fn(async (name: string, action: string, scope?: "user" | "project") => {
		if (action === "remove") servers = servers.filter(server => server.name !== name);
		return success("mcp_action", { name, action, scope });
	});
	Object.assign(window, {
		omp: {
			initialLanguage: "en",
			rpc: { getMcpServers: vi.fn(async () => success("get_mcp_servers", { servers })), mcpAdd, mcpAction },
			mcpCatalog: { list },
		},
	});
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container as unknown as globalThis.Element);
	await act(async () => {
		root?.render(
			<I18nProvider>
				<ExtensionSettingsPage query="" tabId="mcp" />
			</I18nProvider>,
		);
	});
	return { mcpAdd, mcpAction };
}

async function button(label: string) {
	const element = [...document.body.querySelectorAll("button")].find(
		candidate => candidate.textContent?.trim() === label || candidate.getAttribute("aria-label") === label,
	);
	if (!element) throw new Error(`Missing ${label}: ${document.body.textContent}`);
	await act(async () => element.click());
}

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	useTabsStore.getState().reset();
	useSessionStore.getState().reset();
	resetTabRoute();
});

describe("MCP Settings registry", () => {
	it("asks before connecting, refreshes the installed list, and confirms quick removal", async () => {
		const { mcpAdd, mcpAction } = await mount(async () => ({ entries: [INFERENCE, FILESYSTEM] }));
		expect(document.body.textContent).toContain("Manual setup required");
		expect(mcpAdd).not.toHaveBeenCalled();
		await button("Quick install");
		const dialog = document.body.querySelector('[role="dialog"]');
		expect(dialog?.textContent).toContain("https://api.inference.sh/mcp");
		expect(dialog?.textContent).toContain("/repo");
		expect(mcpAdd).not.toHaveBeenCalled();
		await button("Cancel");
		expect(mcpAdd).not.toHaveBeenCalled();
		await button("Quick install");
		await button("Trust and install");
		expect(mcpAdd).toHaveBeenCalledExactlyOnceWith("ac.inference.sh:mcp", INFERENCE.remote, "project");
		expect(document.body.querySelector('[aria-label="Configured servers"]')?.textContent).toContain("ac.inference.sh:mcp");
		await button("Remove ac.inference.sh:mcp");
		expect(mcpAction).not.toHaveBeenCalled();
		await button("Remove");
		expect(mcpAction).toHaveBeenCalledExactlyOnceWith("ac.inference.sh:mcp", "remove", "project");
		expect(document.body.querySelector('[aria-label="Configured servers"]')?.textContent).not.toContain("ac.inference.sh:mcp");
	});

	it("uses the official query and preserves search while following and backing out of an opaque cursor", async () => {
		const list = vi.fn(async ({ cursor }: McpCatalogRequest) =>
			cursor ? { entries: [FILESYSTEM] } : { entries: [INFERENCE], nextCursor: "opaque+cursor/2" },
		);
		await mount(list);
		expect(list).toHaveBeenLastCalledWith({ search: "" });
		expect(document.body.textContent).toContain(INFERENCE.name);
		const input = document.body.querySelector('input[type="search"]');
		if (!input) throw new Error("Missing registry search");
		const propsKey = Object.getOwnPropertyNames(input).find(key => key.startsWith("__reactProps$"));
		// React's test renderer metadata isn't part of the DOM types.
		const inputRecord = input as unknown as Record<string, unknown>;
		const props = propsKey ? inputRecord[propsKey] : undefined;
		if (!props || typeof props !== "object" || !("onChange" in props) || typeof props.onChange !== "function") {
			throw new Error("Missing registry input handler");
		}
		const onChange = props.onChange;
		await act(async () => onChange({ target: { value: " mcp " } }));
		await act(async () => input.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
		expect(list).toHaveBeenLastCalledWith({ search: "mcp" });
		await button("Next page");
		expect(list).toHaveBeenLastCalledWith({ search: "mcp", cursor: "opaque+cursor/2" });
		expect(document.body.textContent).toContain(FILESYSTEM.name);
		await button("Previous page");
		expect(list).toHaveBeenLastCalledWith({ search: "mcp" });
	});
});
