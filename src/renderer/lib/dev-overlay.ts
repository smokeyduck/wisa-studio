/**
 * Recognising events that came from the dev-only Agentation overlay.
 *
 * Every popover in this app dismisses itself on an outside `pointerdown` /
 * `mousedown` / `focusin`, and that is right for the app's own surfaces. The
 * feedback overlay is not one of them: pressing Ctrl+Shift+F moves focus into
 * its shadow root and drops a toolbar over the window, which read as "the user
 * clicked elsewhere" and closed the very menu the user was trying to annotate —
 * the composer's model picker shut the instant the overlay opened.
 *
 * The overlay's internals live in a shadow root, so a plain `target.closest()`
 * cannot see the host element's markup. `composedPath()` crosses the boundary
 * and is the check that matters; the `closest()` fallback covers targets whose
 * path was never composed (and elements inside the light-DOM portal host).
 *
 * The selector mirrors the library's own hit-testing list, plus the portal and
 * settings panel it appends to `document.body`. It matches nothing when the
 * overlay is absent, so the guard is inert in a production build.
 */
const DEV_OVERLAY_SELECTOR = [
	"agentation-toolbar",
	"[data-agentation-root]",
	"[data-agentation-portal]",
	"[data-feedback-toolbar]",
	"[data-annotation-popup]",
	"[data-annotation-marker]",
	"[data-agentation-settings-panel]",
].join(", ");

function isOverlayNode(node: unknown): boolean {
	return (
		typeof node === "object" &&
		node !== null &&
		typeof (node as Element).matches === "function" &&
		(node as Element).matches(DEV_OVERLAY_SELECTOR)
	);
}

/** True when the event originated inside the Agentation overlay. */
export function isDevOverlayEvent(event: Event): boolean {
	if (typeof event.composedPath === "function") {
		for (const node of event.composedPath()) {
			if (isOverlayNode(node)) return true;
		}
	}
	const target = event.target;
	if (typeof target !== "object" || target === null) return false;
	if (isOverlayNode(target)) return true;
	return typeof (target as Element).closest === "function" && !!(target as Element).closest(DEV_OVERLAY_SELECTOR);
}
