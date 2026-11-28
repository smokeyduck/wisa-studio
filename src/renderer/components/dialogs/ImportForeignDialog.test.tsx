import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RpcOfficialArchiveImportResult, RpcOfficialArchivePreview, RpcResponse } from "../../../shared/rpc-types";
import { I18nProvider } from "../../lib/i18n";
import { useSessionStore } from "../../stores/session";
import { useTabsStore } from "../../stores/tabs";
import { ImportForeignDialog } from "./ImportForeignDialog";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { document, window, Event, HTMLElement, Element, Node, IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(globalThis, { requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0) });

interface TestElement {
	textContent: string | null;
	value: string;
	disabled: boolean;
	dispatchEvent(event: object): boolean;
	remove(): void;
}
const TIMESTAMP = "2026-11-28T00:00:00.000Z";
const preview: RpcOfficialArchivePreview = {
	archiveId: "digest",
	source: "claude",
	fileName: "synthetic.zip",
	projectCount: 1,
	fileCount: 2,
	warnings: [],
	sessions: ["alpha", "beta"].map(id => ({
		id,
		path: `/source/${id}.json`,
		title: id,
		cwd: "/profile/import",
		created: TIMESTAMP,
		modified: TIMESTAMP,
		messageCount: 2,
	})),
};
function success(data: unknown): RpcResponse {
	return { type: "response", command: "test", success: true, data };
}
function result(ids: string[], failed: string[] = []): RpcOfficialArchiveImportResult {
	return {
		source: "claude",
		imported: ids.map(id => ({
			sourceId: id,
			sessionPath: `/sessions/${id}.jsonl`,
			sessionId: id,
			cwd: "/profile/import",
		})),
		failed: failed.map(sourceId => ({ sourceId, error: "synthetic conversion error" })),
		archivePath: "/profile/original.zip",
		workspacePath: "/profile/import",
		projectCount: 1,
		fileCount: 2,
		warnings: [],
	};
}
let root: Root;
let container: HTMLElement;
let previewRpc = vi.fn(async () => success(preview));
let importRpc = vi.fn(async (_path: string, _digest: string, ids: string[]) => success(result(ids)));
let localList = vi.fn(async (_source: string) => success({ sessions: preview.sessions }));
let localImport = vi.fn(async (_source: string, id: string) =>
	success({ sessionPath: `/sessions/${id}.jsonl`, sessionId: id, cwd: "/profile/import" }),
);
let reveal = vi.fn(async (_path: string) => ({ ok: true }));
let openPath = vi.fn(async (_path: string) => ({ ok: true }));

beforeEach(async () => {
	previewRpc = vi.fn(async () => success(preview));
	importRpc = vi.fn(async (_path: string, _digest: string, ids: string[]) => success(result(ids)));
	localList = vi.fn(async (_source: string) => success({ sessions: preview.sessions }));
	localImport = vi.fn(async (_source: string, id: string) =>
		success({ sessionPath: `/sessions/${id}.jsonl`, sessionId: id, cwd: "/profile/import" }),
	);
	reveal = vi.fn(async (_path: string) => ({ ok: true }));
	openPath = vi.fn(async (_path: string) => ({ ok: true }));
	Object.assign(window, {
		omp: {
			rpc: {
				previewOfficialArchive: previewRpc,
				importOfficialArchive: importRpc,
				listForeignSessions: localList,
				importForeignSession: localImport,
			},
			system: {
				showOpenDialog: vi.fn(async () => ["/synthetic.zip"]),
				revealPath: reveal,
				openPath,
			},
		},
	});
	useSessionStore.setState({ status: "ready" });
	useTabsStore.setState({ activeTabId: "original" });
	container = document.createElement("div") as unknown as HTMLElement;
	document.body.appendChild(container as never);
	root = createRoot(container as unknown as Element);
	await act(async () => {
		root.render(
			<I18nProvider>
				<ImportForeignDialog />
			</I18nProvider>,
		);
	});
});
afterEach(async () => {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	vi.restoreAllMocks();
	useSessionStore.getState().reset();
	useTabsStore.setState({ activeTabId: null });
});
function button(text: string): TestElement {
	const found = Array.from(document.querySelectorAll("button")).find(node => node.textContent?.includes(text));
	if (!found) throw new Error(`Missing button: ${text}`);
	return found as unknown as TestElement;
}
async function click(text: string): Promise<void> {
	const event = new Event("click", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "eventPhase", { value: 0, writable: true });
	await act(async () => {
		button(text).dispatchEvent(event);
	});
}

describe("official archive import", () => {
	it("defaults to official preview, selects every archive chat and clears selection", async () => {
		expect(localList).not.toHaveBeenCalled();
		await click("Choose export");
		expect(previewRpc).toHaveBeenCalledWith("/synthetic.zip");
		expect(document.body.textContent).toContain("2 chats · 1 projects · 2 files");
		const input = document.querySelector("input[placeholder]") as unknown as Record<string, unknown>;
		const propsKey = Object.getOwnPropertyNames(input).find(key => key.startsWith("__reactProps$"));
		if (!propsKey) throw new Error("Missing React input props");
		const props = input[propsKey] as { onChange(event: { target: { value: string } }): void };
		await act(async () => {
			props.onChange({ target: { value: "alpha" } });
		});
		expect(document.body.textContent).toContain("0 selected / 2 total · 1 shown");
		await click("Select all archive chats");
		expect(document.body.textContent).toContain("2 selected / 2 total · 1 shown");
		await click("Clear selection");
		expect(document.body.textContent).toContain("0 selected / 2 total");
	});

	it("keeps failed selections for retry without submitting successful chats again", async () => {
		importRpc.mockResolvedValueOnce(success(result(["alpha"], ["beta"])));
		await click("Choose export");
		await click("Select all archive chats");
		await click("Import 2");
		expect(document.body.textContent).toContain("synthetic conversion error");
		expect(document.body.textContent).toContain("1 selected / 2 total");
		await click("Import 1");
		expect(importRpc.mock.calls.map(call => call[2])).toEqual([["alpha", "beta"], ["beta"]]);
		expect(document.body.textContent).toContain("2 chats imported");
		await click("Reveal original export");
		expect(reveal).toHaveBeenCalledWith("/profile/original.zip");
		await click("Open preserved workspace");
		expect(openPath).toHaveBeenCalledWith("/profile/import");
	});

	it("blocks same-tick duplicate imports synchronously", async () => {
		const deferred = Promise.withResolvers<RpcResponse>();
		importRpc.mockReturnValueOnce(deferred.promise);
		await click("Choose export");
		await click("Select all archive chats");
		const target = button("Import 2");
		await act(async () => {
			for (let i = 0; i < 2; i++) {
				const event = new Event("click", { bubbles: true });
				Object.defineProperty(event, "eventPhase", { value: 0, writable: true });
				target.dispatchEvent(event);
			}
		});
		expect(importRpc).toHaveBeenCalledTimes(1);
		await act(async () => {
			deferred.resolve(success(result(["alpha", "beta"])));
		});
	});

	it("discards a preview after tab context changes", async () => {
		const deferred = Promise.withResolvers<RpcResponse>();
		previewRpc.mockReturnValueOnce(deferred.promise);
		await click("Choose export");
		await act(async () => {
			useTabsStore.setState({ activeTabId: "other" });
		});
		await act(async () => {
			deferred.resolve(success(preview));
		});
		expect(document.body.textContent).not.toContain("synthetic.zip");
		expect(button("Choose export").disabled).toBe(false);
	});

	it("discards an import result after tab context changes", async () => {
		const deferred = Promise.withResolvers<RpcResponse>();
		importRpc.mockReturnValueOnce(deferred.promise);
		await click("Choose export");
		await click("Select all archive chats");
		await click("Import 2");
		await act(async () => {
			useTabsStore.setState({ activeTabId: "other" });
		});
		await act(async () => {
			deferred.resolve(success(result(["alpha", "beta"])));
		});
		expect(document.body.textContent).not.toContain("chats imported");
		expect(document.body.textContent).not.toContain("Reveal original export");
	});

	it("opens a real imported session through the normal tab API", async () => {
		const openTab = vi.spyOn(useTabsStore.getState(), "openTab").mockResolvedValue("opened");
		await click("Choose export");
		await click("Select all archive chats");
		await click("Import 2");
		await click("Open chat: alpha");
		expect(openTab).toHaveBeenCalledWith({ sessionPath: "/sessions/alpha.jsonl" });
	});

	it("retains separately labeled Claude Code and Codex local import commands", async () => {
		await click("Claude Code (local)");
		expect(localList).toHaveBeenLastCalledWith("claude");
		await click("Select all archive chats");
		await click("Import 2");
		expect(localImport.mock.calls).toEqual([
			["claude", "alpha"],
			["claude", "beta"],
		]);
		await click("Codex (local)");
		expect(localList).toHaveBeenLastCalledWith("codex");
	});
});
