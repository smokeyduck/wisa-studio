/**
 * Model picker contract: manufacturer headers use display names and brand marks,
 * connection metadata retains the provider, and INT explains its catalog estimate.
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
		// Known families get maker sections; unknown ids retain their connection label.
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
		expect(brands).toContain("generic");
		expect(brands).toContain("xai");
	});

	it("shows the exact provider namespace in high-contrast bold text", async () => {
		useModelStore.setState({ availableModels: CATALOG });
		await openPicker();

		const provider = panel()?.querySelector('[data-model-provider="xai"]');
		expect(provider?.textContent).toBe("xai");
		expect(provider?.classList.contains("font-bold")).toBe(true);
		expect(provider?.classList.contains("text-(--omp-text)")).toBe(true);
	});

	it("opens cold with the live model and lets the user pick it while discovery is pending", async () => {
		const pending = Promise.withResolvers<RpcResponse>();
		command.mockImplementationOnce(() => pending.promise);
		useModelStore.setState({ model: { provider: "example", id: "live", name: "Live model" } });
		await openPicker();

		const option = panel()?.querySelector('[role="option"][aria-selected="true"]');
		expect(option?.textContent).toContain("Live model");
		expect(option?.hasAttribute("disabled")).toBe(false);
		await act(async () => {
			option?.dispatchEvent(new Event("click", { bubbles: true }));
		});
		expect(command).toHaveBeenCalledWith(
			{ type: "set_model", provider: "example", modelId: "live" },
			expect.any(Number),
		);

		await act(async () => {
			pending.resolve({
				type: "response",
				command: "get_available_models",
				success: true,
				data: { models: CATALOG, generation: 1, refreshPending: false },
			});
		});
	});

	it("shows cached rows immediately and keeps them through a bounded refresh", async () => {
		const pending = Promise.withResolvers<RpcResponse>();
		command.mockImplementationOnce(() => pending.promise);
		useModelStore.setState({ availableModels: CATALOG, catalogGeneration: 1 });
		await openPicker();

		expect(command).toHaveBeenCalledWith({ type: "get_available_models", forceRefresh: false }, undefined);
		expect(panel()?.querySelectorAll('[role="option"]').length).toBe(CATALOG.length);

		await act(async () => {
			pending.resolve({
				type: "response",
				command: "get_available_models",
				success: true,
				data: {
					models: [{ provider: "wisa", id: "discovered", name: "Discovered model" }],
					refreshPending: true,
					discoveryStates: [],
					generation: 1,
				},
			});
		});
		expect(panel()?.querySelectorAll('[role="option"]').length).toBe(CATALOG.length + 1);
		expect(panel()?.textContent).toContain("Discovered model");
		expect(panel()?.querySelector('[role="listbox"]')?.getAttribute("aria-busy")).toBe("true");

		await act(async () => useUiStore.getState().closeModelPicker());
		await act(async () => useUiStore.getState().openModelPicker());
		expect(command.mock.calls.filter(([request]) => request.type === "get_available_models")).toHaveLength(1);
		expect(panel()?.querySelectorAll('[role="option"]').length).toBe(CATALOG.length + 1);

		await act(async () => {
			useModelStore.getState().applyCatalogUpdate({
				type: "model_catalog_update",
				models: [{ provider: "wisa", id: "gpt-5", name: "New model" }],
				providers: [],
				discoveryStates: [],
				generation: 2,
				refreshPending: false,
			});
		});
		expect(panel()?.querySelector('[role="option"]')?.textContent).toContain("New model");
		expect(panel()?.querySelectorAll('[role="option"]').length).toBe(1);
	});

	it("keeps cached rows when background revalidation fails", async () => {
		command.mockResolvedValueOnce({
			type: "response",
			command: "get_available_models",
			success: false,
			error: "Offline",
		});
		useModelStore.setState({ availableModels: CATALOG });
		await openPicker();

		expect(panel()?.querySelectorAll('[role="option"]').length).toBe(CATALOG.length);
		expect(panel()?.textContent).toContain(translate("modelPicker.retry"));
		const retry = Array.from(panel()?.querySelectorAll("button") ?? []).find(
			button => button.textContent === translate("modelPicker.retry"),
		);
		await act(async () => {
			retry?.dispatchEvent(new Event("click", { bubbles: true }));
		});
		expect(command).toHaveBeenCalledWith({ type: "get_available_models", forceRefresh: true }, undefined);
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
		const row = panel()?.querySelector("[role='option'][aria-selected='true']");
		expect(row?.textContent).toContain("Wisa GPT");
		const badge = Array.from(row?.querySelectorAll("[title]") ?? []).find(
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
