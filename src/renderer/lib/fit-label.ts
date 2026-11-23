/** Smallest font a fitted label may reach and still read as legible. */
export const LABEL_MIN_FONT_PX = 11;

/**
 * Fit a single-line label into its box in one measured step: the width ratio
 * gives the font size that just fills the box, clamped to [minPx, maxPx].
 * At the legible floor, CSS ellipsis handles names that cannot fit. Never
 * wrap: a long name must not change the surrounding toolbar's height.
 * Call after layout (layout effect or ResizeObserver).
 */
export function fitLabel(el: HTMLElement, maxPx: number, minPx = LABEL_MIN_FONT_PX): void {
	el.style.whiteSpace = "nowrap";
	el.style.fontSize = `${maxPx}px`;
	const width = el.clientWidth;
	const natural = el.scrollWidth;
	if (natural > width && width > 0) {
		const fitted = Math.min(maxPx, Math.max(minPx, Math.floor(((maxPx * width) / natural) * 10) / 10));
		el.style.fontSize = `${fitted}px`;
	}
}
