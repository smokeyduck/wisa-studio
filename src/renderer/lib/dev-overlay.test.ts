/**
 * The dev feedback overlay must not dismiss the app's own popovers.
 *
 * Every popover here closes on an outside pointer press or focus move, and the
 * overlay activation (Ctrl+Shift+F) moves focus into its shadow root — which
 * closed the composer's model menu at the exact moment the user wanted to
 * annotate it. `isDevOverlayEvent` is the filter that tells the two apart, and
 * it has to work through a shadow boundary, where `target.closest()` sees
 * nothing.
 */
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { isDevOverlayEvent } from "./dev-overlay";

const { document, Event } = parseHTML("<html><body></body></html>");

const globals = globalThis as Record<string, unknown>;
globals.document = document;
globals.Node = document.defaultView?.Node ?? (document as unknown as { defaultView: unknown });

/** A stand-in for the overlay's light-DOM host, with a shadow root inside. */
function overlayHost(): { host: HTMLElement; inner: HTMLElement; detached: HTMLElement } {
	const host = document.createElement("agentation-toolbar") as unknown as HTMLElement;
	document.body.appendChild(host as unknown as Node);
	const inner = document.createElement("button") as unknown as HTMLElement;
	host.appendChild(inner as unknown as Node);
	const detached = document.createElement("button") as unknown as HTMLElement;
	detached.setAttribute("data-annotation-popup", "");
	return { host, inner, detached };
}

describe("isDevOverlayEvent", () => {
	it("recognises an event raised inside the overlay host", () => {
		const { inner } = overlayHost();
		const event = new Event("pointerdown", { bubbles: true }) as unknown as Event;
		Object.defineProperty(event, "target", { value: inner });
		expect(isDevOverlayEvent(event)).toBe(true);
	});

	it("recognises the portalled annotation layers by their marker attributes", () => {
		const { detached } = overlayHost();
		const event = new Event("focusin") as unknown as Event;
		Object.defineProperty(event, "target", { value: detached });
		expect(isDevOverlayEvent(event)).toBe(true);
	});

	it("leaves the app's own elements alone", () => {
		const button = document.createElement("button") as unknown as HTMLElement;
		button.className = "omp-composer-box";
		document.body.appendChild(button as unknown as Node);
		const event = new Event("pointerdown") as unknown as Event;
		Object.defineProperty(event, "target", { value: button });
		expect(isDevOverlayEvent(event)).toBe(false);
	});

	it("uses the composed path, so a target inside a shadow root is still seen", () => {
		// The overlay's controls live in a shadow root; `target.closest()` cannot
		// reach the host, but `composedPath()` lists it.
		const host = document.createElement("agentation-toolbar") as unknown as HTMLElement;
		const inner = document.createElement("span") as unknown as HTMLElement;
		const event = new Event("pointerdown") as unknown as Event;
		Object.defineProperty(event, "target", { value: inner });
		Object.defineProperty(event, "composedPath", { value: () => [inner, host, document.body, document] });
		expect(isDevOverlayEvent(event)).toBe(true);
	});

	it("is inert when nothing from the overlay is in the path", () => {
		const event = new Event("pointerdown") as unknown as Event;
		Object.defineProperty(event, "target", { value: document.body });
		Object.defineProperty(event, "composedPath", { value: () => [document.body, document] });
		expect(isDevOverlayEvent(event)).toBe(false);
	});
});
