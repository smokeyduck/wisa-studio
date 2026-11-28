export interface TourRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface TourCardLayout extends TourRect {
	maxHeight: number;
	side: "left" | "right" | "above" | "below" | "corner";
}

const MARGIN = 16;
const HEADER = 88;
const GAP = 18;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, Math.max(min, max)));

/** Keep the explanation beside its target; short/narrow windows get a scrollable corner card. */
export function placeTourCard(
	target: TourRect | null,
	viewport: { width: number; height: number },
	measuredHeight: number,
): TourCardLayout {
	const width = Math.min(392, Math.max(0, viewport.width - MARGIN * 2));
	const maxHeight = Math.max(0, viewport.height - HEADER - MARGIN);
	const height = Math.min(measuredHeight || 360, maxHeight);
	const corner: TourCardLayout = {
		left: Math.max(MARGIN, viewport.width - width - MARGIN),
		top: Math.max(HEADER, viewport.height - height - MARGIN),
		width,
		height,
		maxHeight,
		side: "corner",
	};
	if (!target) return corner;
	const right = target.left + target.width;
	const bottom = target.top + target.height;
	const y = clamp(target.top, HEADER, viewport.height - height - MARGIN);
	const rightSpace = viewport.width - right - GAP - MARGIN;
	const leftSpace = target.left - GAP - MARGIN;
	if (rightSpace >= 280)
		return { ...corner, left: right + GAP, top: y, width: Math.min(width, rightSpace), side: "right" };
	if (leftSpace >= 280) {
		const cardWidth = Math.min(width, leftSpace);
		return { ...corner, left: target.left - GAP - cardWidth, top: y, width: cardWidth, side: "left" };
	}
	const x = clamp(target.left + (target.width - width) / 2, MARGIN, viewport.width - width - MARGIN);
	const below = viewport.height - bottom - GAP - MARGIN;
	if (below >= Math.min(height, 240)) {
		return {
			...corner,
			left: x,
			top: bottom + GAP,
			height: Math.min(height, below),
			maxHeight: below,
			side: "below",
		};
	}
	const above = target.top - GAP - HEADER;
	if (above >= Math.min(height, 240)) {
		return {
			...corner,
			left: x,
			top: target.top - GAP - Math.min(height, above),
			height: Math.min(height, above),
			maxHeight: above,
			side: "above",
		};
	}
	return corner;
}
