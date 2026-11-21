/**
 * Phone dialog contract: it lists one row per tab with that tab's own browser
 * link and a scannable QR symbol, and it says why a tab has none.
 *
 * The links are the agent's collab rooms (main-process snapshot); this test
 * pins that the dialog renders what main reports instead of inventing state.
 */

import { parseHTML } from "linkedom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CollabPhoneSnapshot } from "../../../shared/collab-phone";
import { I18nProvider } from "../../lib/i18n";
import { useCollabPhoneStore } from "../../stores/collab-phone";
import { useTabsStore } from "../../stores/tabs";
import { useUiStore } from "../../stores/ui";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis as Record<string, unknown>, {
	document,
	window,
	Event,
	HTMLElement,
	Element,
	Node,
	IS_REACT_ACT_ENVIRONMENT: true,
});

const snapshot = vi.fn<() => Promise<CollabPhoneSnapshot>>();
const start = vi.fn(async () => ({
	tabId: "t1",
	ready: true,
	role: "host" as const,
	readOnly: false,
	participants: 1,
	webLink: "https://my.omp.sh/#second",
}));
(window as unknown as { omp: unknown }).omp = {
	collabPhone: { snapshot, start, stop: vi.fn(), setAutoStart: vi.fn() },
	system: { openExternal: vi.fn() },
};

const { createRoot } = await import("react-dom/client");
const { PhoneDialog } = await import("./PhoneDialog");

let container: InstanceType<typeof HTMLElement>;
let root: Root;

async function openWith(data: CollabPhoneSnapshot): Promise<void> {
	snapshot.mockResolvedValue(data);
	useUiStore.getState().openPhone();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	await act(async () => {
		root.render(
			<I18nProvider>
				<PhoneDialog />
			</I18nProvider>,
		);
	});
	await act(async () => {
		await Promise.resolve();
	});
}

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	snapshot.mockReset();
	start.mockClear();
	useUiStore.getState().closePhone();
	useCollabPhoneStore.setState({ snapshot: null, pending: {}, error: null });
	useTabsStore.setState({ tabs: [], activeTabId: null, groups: [], split: null, bundles: new Map() });
});

describe("PhoneDialog", () => {
	it("shows one row per tab with its own link and a QR symbol", async () => {
		useTabsStore.setState({
			tabs: [
				{ kind: "agent", id: "t0", cwd: "/alpha", status: "ready", unreadDone: false, title: "Alpha work" },
				{ kind: "agent", id: "t1", cwd: "/beta", status: "ready", unreadDone: false },
			],
			activeTabId: "t0",
			bundles: new Map(),
		});
		await openWith({
			autoStart: "control",
			tabs: [
				{
					tabId: "t0",
					ready: true,
					role: "host",
					readOnly: false,
					participants: 2,
					webLink: "https://my.omp.sh/#first",
				},
				{
					tabId: "t1",
					ready: false,
					role: null,
					readOnly: false,
					participants: 0,
					error: "Sidecar not ready (booting)",
				},
			],
		});
		// The dialog renders through a portal on document.body, not in `container`.
		const text = document.body.textContent ?? "";
		expect(text).toContain("Alpha work");
		expect(text).toContain("https://my.omp.sh/#first");
		// A tab with no sidecar explains itself instead of showing an empty link.
		expect(text).toContain("Sidecar not ready (booting)");
		// Exactly one room is live, so exactly one QR symbol is drawn (linkedom
		// lowercases the attribute, hence `viewbox`).
		// The QR symbol is the only fixed-size (104px) SVG in the dialog.
		expect(document.body.querySelectorAll('svg[width="104"]')).toHaveLength(1);
	});

	it("hosts a tab from its row", async () => {
		useTabsStore.setState({
			tabs: [{ kind: "agent", id: "t1", cwd: "/beta", status: "ready", unreadDone: false }],
			activeTabId: "t1",
			bundles: new Map(),
		});
		await openWith({
			autoStart: "off",
			tabs: [{ tabId: "t1", ready: true, role: null, readOnly: false, participants: 0 }],
		});
		const hostButton = [...document.body.querySelectorAll("button")].find(button =>
			(button.textContent ?? "").includes("Host"),
		);
		expect(hostButton).toBeDefined();
		await act(async () => {
			hostButton?.dispatchEvent(new window.Event("click", { bubbles: true }));
		});
		expect(start).toHaveBeenCalledWith({ tabId: "t1" });
	});

	it("reports a failed snapshot instead of rendering an empty list", async () => {
		snapshot.mockRejectedValue(new Error("main unreachable"));
		useTabsStore.setState({
			tabs: [{ kind: "agent", id: "t0", cwd: "/alpha", status: "ready", unreadDone: false }],
			activeTabId: "t0",
			bundles: new Map(),
		});
		useUiStore.getState().openPhone();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		await act(async () => {
			root.render(
				<I18nProvider>
					<PhoneDialog />
				</I18nProvider>,
			);
		});
		await act(async () => {
			await Promise.resolve();
		});
		expect(document.body.textContent ?? "").toContain("main unreachable");
	});
});
