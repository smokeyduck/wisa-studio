/** Sidebar Plan controls apply receipts rather than optimistic state. */
import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpcResponse } from "../../../shared/rpc-types";
import { I18nProvider, translate } from "../../lib/i18n";
import { useSessionStore } from "../../stores/session";
import { useSettingsStore } from "../../stores/settings";
import { ComposerModes, SessionModeOptions } from "./ComposerModes";

const { document, window, Event, HTMLElement, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { document, window, Event, HTMLElement, Node, IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLDivElement;

function receipt(enabled: boolean): RpcResponse {
	return { type: "response", command: "set_plan_mode", success: true, data: { enabled } };
}

async function mount() {
	container = document.createElement("div") as unknown as HTMLDivElement;
	document.body.appendChild(container as never);
	root = createRoot(container);
	await act(async () => {
		root?.render(
			<I18nProvider>
				<ComposerModes />
				<SessionModeOptions />
			</I18nProvider>,
		);
	});
}

function planSwitch(): HTMLButtonElement {
	const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]');
	if (!toggle) throw new Error("Sidebar Plan switch missing");
	return toggle;
}

function planButton(): HTMLButtonElement | null {
	return (
		Array.from(container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")).find(
			button => button.getAttribute("aria-label") === translate("input.plan.title"),
		) ?? null
	);
}

afterEach(async () => {
	await act(async () => root?.unmount());
	root = undefined;
	container?.remove();
	useSessionStore.getState().reset();
	useSettingsStore.getState().reset();
});

describe("ComposerModes Plan receipts", () => {
	it("reflects authoritative enable and disable receipts from the sidebar", async () => {
		const enable = Promise.withResolvers<RpcResponse>();
		const keepEnabled = Promise.withResolvers<RpcResponse>();
		const disable = Promise.withResolvers<RpcResponse>();
		const setPlanMode = vi
			.fn<(enabled: boolean) => Promise<RpcResponse>>()
			.mockReturnValueOnce(enable.promise)
			.mockReturnValueOnce(keepEnabled.promise)
			.mockReturnValueOnce(disable.promise);
		(window as unknown as Record<string, unknown>).omp = { rpc: { setPlanMode } };
		await mount();

		expect(planButton()).toBeNull();
		const options = planSwitch().closest("details");
		expect(options).not.toBeNull();
		options?.setAttribute("open", "");
		expect(planSwitch().getAttribute("aria-checked")).toBe("false");
		await act(async () => planSwitch().click());
		expect(setPlanMode).toHaveBeenLastCalledWith(true);
		expect(planButton()).toBeNull();
		expect(planSwitch().parentElement?.getAttribute("aria-busy")).toBe("true");
		await act(async () => enable.resolve(receipt(true)));
		expect(planSwitch().getAttribute("aria-checked")).toBe("true");
		expect(planButton()).not.toBeNull();

		await act(async () => planButton()?.click());
		expect(setPlanMode).toHaveBeenLastCalledWith(false);
		expect(planButton()?.disabled).toBe(true);
		await act(async () => keepEnabled.resolve(receipt(true)));
		expect(planButton()?.disabled).toBe(false);
		expect(planSwitch().getAttribute("aria-checked")).toBe("true");

		await act(async () => planButton()?.click());
		await act(async () => disable.resolve(receipt(false)));
		expect(planButton()).toBeNull();
		expect(planSwitch().getAttribute("aria-checked")).toBe("false");
	});

	it("does not apply a late sidebar receipt after the originating session changes", async () => {
		const pending = Promise.withResolvers<RpcResponse>();
		const setPlanMode = vi.fn(() => pending.promise);
		(window as unknown as Record<string, unknown>).omp = { rpc: { setPlanMode } };
		useSessionStore.setState({ sessionId: "origin" });
		await mount();
		await act(async () => planSwitch().click());
		await act(async () => useSessionStore.setState({ sessionId: "replacement", planModeEnabled: false }));
		await act(async () => pending.resolve(receipt(true)));
		expect(useSessionStore.getState().planModeEnabled).toBe(false);
		expect(planButton()).toBeNull();
		expect(planSwitch().parentElement?.getAttribute("aria-busy")).toBe("false");
	});
});
