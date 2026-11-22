import { describe, expect, it } from "vitest";
import { fitLabel, LABEL_MIN_FONT_PX } from "./fit-label";

/** 20 glyphs at 0.6em each: width scales with the applied font size, like text. */
const CHARS = 20;
const GLYPH_EM = 0.6;

function fakeLabel(boxPx: number) {
	const style = { fontSize: "", whiteSpace: "" };
	return {
		style,
		get scrollWidth() {
			return CHARS * GLYPH_EM * Number.parseFloat(style.fontSize || "0");
		},
		clientWidth: boxPx,
	} as unknown as HTMLElement & { style: { fontSize: string; whiteSpace: string } };
}

describe("fitLabel", () => {
	it("keeps the full size on one line when the label already fits", () => {
		const el = fakeLabel(300);
		fitLabel(el, 14);
		expect(el.style.fontSize).toBe("14px");
		expect(el.style.whiteSpace).toBe("nowrap");
	});

	it("shrinks the font just far enough to stay on one line", () => {
		const el = fakeLabel(150);
		fitLabel(el, 14);
		expect(el.style.fontSize).toBe("12.5px");
		expect(el.style.whiteSpace).toBe("nowrap");
	});

	it("never goes below the legible floor and wraps instead of clipping", () => {
		const el = fakeLabel(60);
		fitLabel(el, 14);
		expect(el.style.fontSize).toBe(`${LABEL_MIN_FONT_PX}px`);
		expect(el.style.whiteSpace).toBe("normal");
	});
});
