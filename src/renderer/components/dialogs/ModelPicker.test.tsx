/**
 * Model picker contract for the vendor-grouped list: group headers read as
 * display names with a brand mark (never a raw provider id), search matches
 * the brand label too, and the INT score carries the catalog-estimate hint.
 * Same linkedom harness as the other dialog tests (no jsdom in this repo).
 */

import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { createSessionRpcClient } from "../../../shared/rpc-client";
import type { ModelInfo, RpcResponse } from "../../../shared/rpc-types";
import { I18nProvider, translate } from "../../lib/i18n";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";
import { ModelPicker } from "./ModelPicker";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");

const CATALOG: ModelInfo[] = [
	{ provider: "wisa", id: "wisa-gpt", name: "Wisa GPT", int: 41, api: "openai-completions" },
	{ provider: "minimax", id: "minimax-m3.1-flash", int: 55 },
	{ provider: "xai", id: "grok-4" },
];

const command: Mock<(request: { type: string }) => Promise<RpcResponse>> = vi.fn(async request =>
	request.type === "get_login_providers"
		? { type: "response", command: request.type, success: true, data: { providers: [] } }
		: {
				type: "response",
				command: request.type,
				success: true,
				data: { models: CATALOG, providers: [], discoveryStates: [], generation: 1 },
			},
);

// The picker reads through the tab RPC client, which falls back to
// `window.omp.rpc` when no session runtime is mounted — so the mock is a real
// client over a stubbed transport, not a hand-rolled subset of methods.
Object.assign(window, { omp: { rpc: createSessionRpcClient(command) } });

const globals = globalThis as Record<string, unknown>;
globals.document = document;
globals.window = window;
globals.Event = Event;
globals.HTMLElement = HTMLElement;
globals.Element = Element;
globals.Node = Node;
globals.IS_REACT_ACT_ENVIRONMENT = true;

const elementPrototype = HTMLElement.prototype as unknown as Record<string, unknown>;
if (typeof elementPrototype.focus !== "function") elementPrototype.focus = () => {};
if (typeof elementPrototype.scrollIntoView !== "function") elementPrototype.scrollIntoView = () => {};
elementPrototype.getClientRects = () => [];
elementPrototype.getBoundingClientRect = () => ({
	bottom: 0,
	height: 0,
	left: 0,
	right: 0,
	top: 0,
	width: 0,
	x: 0,
	y: 0,
	toJSON: () => ({}),
});
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);
globals.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });

let container: InstanceType<typeof HTMLElement>;
let root: Root;

async function openPicker(): Promise<void> {
	useSessionStore.setState({ status: "ready" });
	useUiStore.getState().openModelPicker();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	await act(async () => {
		root.render(
			<I18nProvider>
				<ModelPicker />
			</I18nProvider>,
		);
	});
	await act(async () => {
		await Promise.resolve();
	});
	await act(async () => {
		await Promise.resolve();
	});
}

function panel(): Element | null {
	return document.getElementById("omp-model-picker");
}

function groupLabels(): string[] {
	const sections = Array.from(panel()?.querySelectorAll("section[role='group']") ?? []);
	return sections.map(section => section.getAttribute("aria-label") ?? "");
}

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	useUiStore.getState().closeModelPicker();
	useModelStore.getState().reset();
	command.mockClear();
});

describe("ModelPicker vendor groups", () => {
	it("labels each group with the vendor's display name, not the provider id", async () => {
		// The current model's provider opens with the picker; the others stay shut.
		useModelStore.setState({ model: { provider: "wisa", id: "wisa-gpt" }, availableModels: CATALOG });
		await openPicker();

		const labels = groupLabels();
		expect(labels).toContain("Wisa");
		expect(labels).toContain("MiniMax");
		expect(labels).toContain("xAI");
		expect(labels).not.toContain("wisa");
	});

	it("sorts groups by display name, so xAI does not trail the lower-case ids", async () => {
		useModelStore.setState({ availableModels: CATALOG });
		await openPicker();

		expect(groupLabels()).toEqual(["MiniMax", "Wisa", "xAI"]);
	});

	it("renders an inline brand mark per header", async () => {
		useModelStore.setState({ availableModels: CATALOG });
		await openPicker();

		const marks = panel()?.querySelectorAll("svg[data-brand]") ?? [];
		const brands = Array.from(marks).map(mark => mark.getAttribute("data-brand"));
		expect(brands).toContain("minimax");
		expect(brands).toContain("wisa");
		expect(brands).toContain("xai");
	});

	it("shows a human model name in the open group", async () => {
		useModelStore.setState({ model: { provider: "minimax", id: "minimax-m3.1-flash" }, availableModels: CATALOG });
		await openPicker();

		expect(panel()?.textContent).toContain("MiniMax M3.1 Flash");
	});

	it("explains the INT tier on the score itself", async () => {
		useModelStore.setState({ model: { provider: "wisa", id: "wisa-gpt" }, availableModels: CATALOG });
		await openPicker();

		const hint = translate("modelPicker.intelligenceHint");
		const badge = Array.from(panel()?.querySelectorAll("[title]") ?? []).find(
			element => element.getAttribute("title") === hint,
		);
		expect(badge).toBeDefined();
		expect(badge?.textContent).toBe(translate("modelPicker.intelligence", { value: 41 }));
	});

	it("keeps the panel's id contract for the composer's aria-controls", async () => {
		useModelStore.setState({ availableModels: CATALOG });
		await openPicker();

		expect(panel()).not.toBeNull();
		expect(panel()?.getAttribute("role")).toBe("region");
	});
});
