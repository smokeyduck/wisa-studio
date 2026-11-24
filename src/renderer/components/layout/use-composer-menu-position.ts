import { type CSSProperties, type RefObject, useLayoutEffect, useState } from "react";

const VIEWPORT_INSET = 8;
const TRIGGER_GAP = 6;

interface MenuPosition {
	left: number;
	top: number;
	width: number;
	maxHeight: number;
}

/** Place a portalled composer menu without measuring its animated transform. */
export function useComposerMenuPosition(
	open: boolean,
	triggerRef: RefObject<HTMLButtonElement | null>,
	menuRef: RefObject<HTMLDivElement | null>,
	preferredWidth: number,
): CSSProperties {
	const [position, setPosition] = useState<MenuPosition | null>(null);

	useLayoutEffect(() => {
		const trigger = triggerRef.current;
		const menu = menuRef.current;
		if (!open || !trigger || !menu) return;

		const place = () => {
			const anchor = trigger.getBoundingClientRect();
			const viewportWidth = window.innerWidth || preferredWidth + 2 * VIEWPORT_INSET;
			const viewportHeight = window.innerHeight || anchor.bottom + 2 * VIEWPORT_INSET;
			const width = Math.min(preferredWidth, Math.max(0, viewportWidth - 2 * VIEWPORT_INSET));
			// If start alignment would spill, align to the trigger's end before
			// clamping. This keeps the menu next to a trigger in a narrow right pane.
			const rightLimit = viewportWidth - VIEWPORT_INSET - width;
			const alignedLeft = anchor.left <= rightLimit ? anchor.left : anchor.right - width;
			const left = Math.max(VIEWPORT_INSET, Math.min(rightLimit, alignedLeft));
			const viewportBottom = viewportHeight - VIEWPORT_INSET;
			const upperEdge = Math.min(viewportBottom, anchor.top - TRIGGER_GAP);
			const lowerEdge = Math.max(VIEWPORT_INSET, anchor.bottom + TRIGGER_GAP);
			const above = Math.max(0, upperEdge - VIEWPORT_INSET);
			const below = Math.max(0, viewportBottom - lowerEdge);
			const height = (menu.scrollHeight || 0) + ((menu.offsetHeight || 0) - (menu.clientHeight || 0));
			const opensAbove = height <= above || above >= below;
			const maxHeight = opensAbove ? above : below;
			const top = opensAbove ? Math.max(VIEWPORT_INSET, upperEdge - Math.min(height, maxHeight)) : lowerEdge;

			setPosition(current =>
				current?.left === left && current.top === top && current.width === width && current.maxHeight === maxHeight
					? current
					: { left, top, width, maxHeight },
			);
		};
		place();

		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
		observer?.observe(trigger);
		observer?.observe(menu);
		const toolbar = trigger.closest(".omp-composer-toolbar");
		if (toolbar) observer?.observe(toolbar);
		// A nested trigger moves as its parent portal clamps, even if neither box
		// changes size (e.g. moving from one side of a split to the other).
		const parent = trigger.closest("[data-run-settings-menu]");
		const parentObserver = parent && typeof MutationObserver !== "undefined" ? new MutationObserver(place) : null;
		if (parent) parentObserver?.observe(parent, { attributes: true, attributeFilter: ["style"] });
		window.addEventListener("resize", place);
		window.addEventListener("scroll", place, true);
		return () => {
			observer?.disconnect();
			parentObserver?.disconnect();
			window.removeEventListener("resize", place);
			window.removeEventListener("scroll", place, true);
		};
	}, [open, triggerRef, menuRef, preferredWidth]);

	return position ?? { width: preferredWidth, visibility: "hidden" };
}
