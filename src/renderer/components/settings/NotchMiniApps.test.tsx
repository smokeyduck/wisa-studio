import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotchAppsSnapshot } from "../../../shared/notch-apps";
import { I18nProvider } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settings";
import { NotchMiniApps } from "./NotchMiniApps";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { document, window, Event, HTMLElement, Element, Node, IS_REACT_ACT_ENVIRONMENT: true });
const initial: NotchAppsSnapshot = {
	apps: [
		{
			id: "timer",
			name: "Timer",
			currentRevision: "new",
			revisions: [
				{ id: "new", createdAt: "2026-11-29T10:00:00Z" },
				{ id: "old", createdAt: "2026-11-29T09:00:00Z" },
			],
		},
	],
	active: { appId: "timer", revisionId: "new" },
	preview: null,
};
let root: Root | undefined;
let container: globalThis.HTMLElement;
async function mount() {
	const command = vi.fn(async (_args: Record<string, unknown>) => initial);
	Object.assign(window, { omp: { notchApps: { command, onChanged: () => () => {} } } });
	container = document.createElement("div") as unknown as globalThis.HTMLElement;
	document.body.appendChild(container as never);
	root = createRoot(container);
	await act(async () => {
		root?.render(
			<I18nProvider>
				<NotchMiniApps />
			</I18nProvider>,
		);
	});
	return command;
}
function button(label: string) {
	const result = Array.from(container.querySelectorAll("button")).find(element => element.textContent === label);
	if (!result) throw new Error(`Missing button: ${label}`);
	return result;
}
afterEach(async () => {
	await act(async () => {
		root?.unmount();
	});
	root = undefined;
	container?.remove();
	useSettingsStore.getState().reset();
});
describe("NotchMiniApps", () => {
	it("restores the selected source revision and provides an independent stop action", async () => {
		const command = await mount();
		const select = container.querySelector("select");
		if (!select) throw new Error("Missing revision selector");
		Object.defineProperty(select, "value", { configurable: true, value: "old" });
		await act(async () => {
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
		await act(async () => {
			button("Restore version").click();
		});
		expect(command).toHaveBeenLastCalledWith({ action: "rollback", id: "timer", revisionId: "old" });
		await act(async () => {
			button("Stop mini-app · restore default notch").click();
		});
		expect(command).toHaveBeenLastCalledWith({ action: "stop", id: undefined, revisionId: undefined });
	});
	it("does not delete source revisions until the user confirms the named app", async () => {
		const command = await mount();
		await act(async () => {
			button("Remove").click();
		});
		expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain("Timer");
		expect(command).toHaveBeenCalledTimes(1);
		await act(async () => {
			button("Cancel").click();
		});
		expect(command).toHaveBeenCalledTimes(1);
		await act(async () => {
			button("Remove").click();
		});
		await act(async () => {
			container.querySelector<globalThis.HTMLButtonElement>('[role="alertdialog"] button')?.click();
		});
		expect(command).toHaveBeenLastCalledWith({ action: "delete", id: "timer", revisionId: undefined });
	});
});
