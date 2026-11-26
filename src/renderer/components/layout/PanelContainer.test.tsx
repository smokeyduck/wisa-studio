/** Inspector filtering and links: plan/review stay here, execution cards stay in chat. */

import { parseHTML } from "linkedom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { MarkdownRenderer } from "../../lib/markdown";
import { useSessionStore } from "../../stores/session";
import { useTabsStore } from "../../stores/tabs";
import { useToastStore } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";
import { useFileTabs } from "../panels/file-tabs";
import { PanelContainer } from "./PanelContainer";

// Tool-driven terminal output still loads xterm; the launcher button does not use it.
vi.hoisted(() => {
	(globalThis as Record<string, unknown>).self = globalThis;
});

const { document, window, Event, HTMLElement, Node } = parseHTML("<html><body></body></html>");

const globals = globalThis as Record<string, unknown>;
globals.document = document;
globals.window = window;
globals.Event = Event;
globals.HTMLElement = HTMLElement;
globals.Node = Node;
globals.IS_REACT_ACT_ENVIRONMENT = true;
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);
const ompWindow = window as unknown as { omp?: unknown };
const initialOmp = ompWindow.omp;

interface TestElement {
	textContent: string | null;
	remove: () => void;
}

let container: TestElement;
let root: Root;

async function flush(): Promise<void> {
	await act(async () => {
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 0);
		await promise;
	});
}

async function mount(element: ReactElement, paneWidth?: number): Promise<void> {
	container = document.createElement("div") as unknown as TestElement;
	if (paneWidth !== undefined) Object.defineProperty(container, "clientWidth", { value: paneWidth });
	document.body.appendChild(container as never);
	root = createRoot(container as unknown as Element);
	await act(async () => {
		root.render(<I18nProvider>{element}</I18nProvider>);
	});
	await flush();
}

afterEach(async () => {
	if (root) {
		await act(async () => {
			root.unmount();
		});
	}
	container?.remove();
	useSessionStore.getState().reset();
	useTabsStore.getState().reset();
	useFileTabs.setState({ workspaces: new Map() });
	useUiStore.setState({ panelTab: "files", panelVisible: true, filePreviewPath: null, filePreviewLine: null });
	useToastStore.setState({ toasts: [] });
	if (initialOmp === undefined) delete ompWindow.omp;
	else ompWindow.omp = initialOmp;
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});

function seedActiveTab(kind: "agent" | "chat"): void {
	useTabsStore.setState({
		tabs: [{ id: "t0", cwd: "/work", status: "ready", kind, unreadDone: false }],
		activeTabId: "t0",
		bundles: new Map(),
	});
}

function drawerTabLabels(): string[] {
	return [...document.querySelectorAll("aside > header button[aria-pressed]")].map(
		button => button.getAttribute("title") ?? "",
	);
}

function FileLinkHarness({ content = "[report](docs/report.md)" }: { content?: string }) {
	const panelVisible = useUiStore(s => s.panelVisible);
	return (
		<>
			<MarkdownRenderer content={content} />
			{panelVisible && <PanelContainer />}
		</>
	);
}

describe("PanelContainer chat tab filter", () => {
	it("renders the side questions and files tabs in a chat tab", async () => {
		seedActiveTab("chat");
		useUiStore.setState({ panelTab: "files", panelVisible: true });
		await mount(<PanelContainer />);

		const labels = drawerTabLabels();
		expect(labels).toContain("Files");
		expect(labels).toContain("Side questions");
		for (const agentOnly of ["Agents", "Changes", "Plan", "Browser"]) {
			expect(labels).not.toContain(agentOnly);
		}
		expect(document.querySelector('aside > header button[aria-label="Terminal"]')).toBeNull();
	});

	it("falls back to the files surface when the agent-only diff tab was selected before entering chat", async () => {
		seedActiveTab("chat");
		useUiStore.setState({ panelTab: "diff", panelVisible: true });
		await mount(<PanelContainer />);

		expect(document.querySelector('button[aria-label="Refresh file tree"]')).not.toBeNull();
	});

	it("renders all drawer tabs in an agent tab", async () => {
		seedActiveTab("agent");
		useUiStore.setState({ panelTab: "files", panelVisible: true });
		await mount(<PanelContainer />);

		const labels = drawerTabLabels();
		for (const visible of ["Plan", "Side questions", "Changes", "Files"]) {
			expect(labels).toContain(visible);
		}
		for (const absent of ["Agents", "Browser", "Todo", "Queue", "Logs", "Terminal"]) {
			expect(labels).not.toContain(absent);
		}
		expect(document.querySelector('aside > header button[aria-label="Agents"]')).toBeNull();
	});

	it("launches the OS terminal for the active tab without selecting a view or closing the drawer", async () => {
		seedActiveTab("agent");
		const openTerminal = vi.fn(async () => ({ ok: false, error: "Launcher failed" }));
		ompWindow.omp = { system: { openTerminal } };
		useUiStore.getState().setPanelTab("files");
		await mount(<PanelContainer />);

		const terminal = document.querySelector('aside > header button[aria-label="Terminal"]');
		expect(terminal?.hasAttribute("aria-pressed")).toBe(false);
		await act(async () => terminal?.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
		expect(openTerminal).toHaveBeenCalledExactlyOnceWith("t0");
		expect(useUiStore.getState()).toMatchObject({ panelTab: "files", panelVisible: true, panelOwnerTabId: "t0" });
		expect(useToastStore.getState().toasts).toEqual([
			expect.objectContaining({ variant: "error", message: "Couldn't start a terminal: Launcher failed" }),
		]);
	});

	it("consumes Escape inside the inspector and clears its owner", async () => {
		seedActiveTab("agent");
		useUiStore.getState().setPanelTab("files");
		await mount(<PanelContainer />);
		const event = new Event("keydown", { bubbles: true, cancelable: true });
		Object.defineProperties(event, {
			key: { value: "Escape" },
			eventPhase: { value: 0, writable: true, configurable: true },
		});
		await act(async () => document.querySelector('aside > header button[aria-label="Files"]')?.dispatchEvent(event));
		expect(event.defaultPrevented).toBe(true);
		expect(useUiStore.getState()).toMatchObject({ panelTab: "files", panelVisible: false, panelOwnerTabId: null });
	});

	it("sizes an overlay against its pane body rather than the window", async () => {
		seedActiveTab("agent");
		useUiStore.getState().setPanelTab("files");
		await mount(<PanelContainer />, 320);
		const overlay = document.querySelector("aside.omp-inspector");
		expect(overlay?.classList.contains("absolute")).toBe(true);
		expect(overlay?.getAttribute("style")).toContain("width:320px");
		expect(overlay?.querySelector('[role="separator"]')?.getAttribute("aria-valuemax")).toBe("320");
	});

	it("keeps the chosen view selected and lets the user close it from the same control", async () => {
		seedActiveTab("agent");
		await act(async () => useUiStore.getState().setPanelTab("files"));
		await mount(<PanelContainer />);

		const files = document.querySelector('aside > header button[aria-label="Files"]');
		const close = document.querySelector('aside > header button[aria-label="Close"]');
		expect(files?.getAttribute("aria-pressed")).toBe("true");
		expect(close?.parentElement).toBe(files?.parentElement);
		await act(async () => close?.dispatchEvent(new Event("click", { bubbles: true })));
		expect(useUiStore.getState().panelVisible).toBe(false);
	});

	it("opens a local markdown link inside the Files drawer", async () => {
		seedActiveTab("agent");
		useUiStore.setState({ panelVisible: false, filePreviewPath: null });
		const read = vi.fn(async () => ({
			ok: true,
			content: "# Preview heading\n\nRendered body.",
			truncated: false,
			binary: false,
			size: 34,
		}));
		ompWindow.omp = {
			fs: {
				explore: vi.fn(async () => ({ ok: true, entries: [], truncated: false })),
				read,
			},
			system: {
				openExternal: vi.fn(async () => {}),
				openPath: vi.fn(async () => ({ ok: true })),
			},
		};
		await mount(<FileLinkHarness />);

		await act(async () => {
			document
				.querySelector(`[role="link"]`)
				?.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
		});
		await flush();

		expect(useUiStore.getState()).toMatchObject({
			panelVisible: true,
			panelTab: "files",
			filePreviewPath: "docs/report.md",
		});
		expect(read).toHaveBeenCalledWith("docs/report.md", 200_000);
		expect(document.querySelector("aside h1")?.textContent).toBe("Preview heading");
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it("decodes an absolute file URL and renders non-Markdown text as code", async () => {
		seedActiveTab("agent");
		useUiStore.setState({ panelVisible: false, filePreviewPath: null });
		const read = vi.fn(async () => ({
			ok: true,
			content: "SELECT 1;",
			truncated: false,
			binary: false,
			size: 9,
		}));
		ompWindow.omp = {
			fs: {
				explore: vi.fn(async () => ({ ok: true, entries: [], truncated: false })),
				read,
			},
			system: {
				openExternal: vi.fn(async () => {}),
				openPath: vi.fn(async () => ({ ok: true })),
			},
		};
		await mount(<FileLinkHarness content="[sql](file:///tmp/my%20query.sql)" />);

		await act(async () => {
			document
				.querySelector(`[role="link"]`)
				?.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
		});
		await flush();

		expect(read).toHaveBeenCalledWith("/tmp/my query.sql", 200_000);
		expect(document.querySelector("aside pre")?.textContent).toContain("SELECT 1;");
	});

	it("opens a Markdown link that names a line as source with that line marked", async () => {
		seedActiveTab("agent");
		useUiStore.setState({ panelVisible: false, filePreviewPath: null });
		ompWindow.omp = {
			fs: {
				explore: vi.fn(async () => ({ ok: true, entries: [], truncated: false })),
				read: vi.fn(async () => ({
					ok: true,
					content: "# Title\n\nIntro.\n\n## Usage\n",
					truncated: false,
					binary: false,
					size: 30,
				})),
			},
			system: {
				openExternal: vi.fn(async () => {}),
				openPath: vi.fn(async () => ({ ok: true })),
			},
		};
		await mount(<FileLinkHarness content="[usage](docs/guide.md#L5)" />);

		await act(async () => {
			document
				.querySelector(`[role="link"]`)
				?.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
		});
		await flush();

		// Rendered prose has no line 5 to land on; the source does.
		expect(document.querySelector("aside h1")).toBeNull();
		expect(document.querySelector("aside pre")?.textContent).toContain("## Usage");
		expect(document.querySelector("aside [data-marked]")?.textContent).toBe("5");
	});
});
