import { describe, expect, it } from "vitest";
import { placeTourCard } from "./tutorial-layout";

describe("tour card placement", () => {
	it("keeps a sidebar visible instead of putting the explanation over it", () => {
		const target = { left: 8, top: 8, width: 260, height: 884 };
		const card = placeTourCard(target, { width: 1280, height: 900 }, 340);
		expect(card.left).toBeGreaterThan(target.left + target.width);
		expect(card.top).toBeGreaterThanOrEqual(88);
		expect(card.top + card.height).toBeLessThanOrEqual(884);
	});
	it("uses the left side of a right-hand inspector without covering it", () => {
		const target = { left: 890, top: 70, width: 370, height: 800 };
		const card = placeTourCard(target, { width: 1280, height: 900 }, 360);
		expect(card.left + card.width).toBeLessThan(target.left);
	});
	it("uses free space above a wide composer instead of covering its controls", () => {
		const target = { left: 270, top: 700, width: 980, height: 160 };
		const card = placeTourCard(target, { width: 1280, height: 900 }, 340);
		expect(card.top + card.height).toBeLessThan(target.top);
	});
	it("keeps a scrollable card and its footer inside a small window even without a target", () => {
		for (const target of [null, { left: 8, top: 80, width: 584, height: 460 }]) {
			const card = placeTourCard(target, { width: 600, height: 560 }, 700);
			expect(card.left).toBeGreaterThanOrEqual(16);
			expect(card.left + card.width).toBeLessThanOrEqual(584);
			expect(card.top).toBeGreaterThanOrEqual(88);
			expect(card.top + card.height).toBeLessThanOrEqual(544);
			expect(card.maxHeight).toBeLessThanOrEqual(456);
		}
	});
});
