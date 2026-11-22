/** Smallest font a fitted label may reach and still read as legible. */
export const LABEL_MIN_FONT_PX = 11;

/**
 * Fit a single-line label into its box in one measured step: the width ratio
 * gives the font size that just fills the box, clamped to [minPx, maxPx]. The
 * label is measured again once, and only if even the floor overflows does it
 * wrap. It never ellipsizes, since a clipped model name is unreadable. Call it
 * after layout (layout effect or ResizeObserver).
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
	el.style.whiteSpace = el.scrollWidth > el.clientWidth ? "normal" : "nowrap";
}
