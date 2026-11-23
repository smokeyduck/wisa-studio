/**
 * DOM smoke test for the changelog window: ui-store open/close wiring and
 * the bundled CHANGELOG.md rendering through the sanitized markdown pipeline.
 * Same linkedom harness as the other dialog tests (no jsdom in this repo).
 */

import { parseHTML } from "linkedom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { useUiStore } from "../../stores/ui";
import { ChangelogDialog } from "./ChangelogDialog";

const { document, window, Event, HTMLElement, Node } = parseHTML("<html><body></body></html>");

const globals = globalThis as Record<string, unknown>;
globals.document = document;
globals.window = window;
globals.Event = Event;
globals.HTMLElement = HTMLElement;
globals.Node = Node;
globals.IS_REACT_ACT_ENVIRONMENT = true;
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);

const elementPrototype = HTMLElement.prototype as unknown as Record<string, unknown>;
if (typeof elementPrototype.scrollIntoView !== "function") elementPrototype.scrollIntoView = () => {};
if (typeof elementPrototype.focus !== "function") elementPrototype.focus = () => {};

let container: InstanceType<typeof HTMLElement> | null = null;
let root: Root | null = null;

async function mount(ui: ReactElement): Promise<void> {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	await act(async () => {
		root?.render(<I18nProvider>{ui}</I18nProvider>);
	});
}

afterEach(async () => {
	await act(async () => {
		root?.unmount();
	});
	container?.remove();
	container = null;
	root = null;
	useUiStore.getState().closeChangelog();
});

describe("ChangelogDialog", () => {
	it("stays hidden until the ui store opens it", async () => {
		await mount(<ChangelogDialog />);
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		await act(async () => {
			useUiStore.getState().openChangelog();
		});
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
	});

	it("renders the bundled changelog with navigable markdown headings", async () => {
		useUiStore.getState().openChangelog();
		await mount(<ChangelogDialog />);
		const dialog = document.querySelector('[role="dialog"]');
		expect(dialog).not.toBeNull();
		expect(dialog?.querySelector("h1")).not.toBeNull();
		expect(dialog?.querySelectorAll("h2").length).toBeGreaterThan(0);
	});

	it("closes back to an empty body", async () => {
		useUiStore.getState().openChangelog();
		await mount(<ChangelogDialog />);
		const dialog = document.querySelector('[role="dialog"]');
		expect(dialog).not.toBeNull();
		await act(async () => {
			(dialog?.querySelector("button") as HTMLElement | null)?.click();
		});
		// The modal lingers ~240ms for its exit animation before unmounting.
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 300));
		});
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(useUiStore.getState().changelogOpen).toBe(false);
	});
});
