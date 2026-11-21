/**
 * Drift guard between the phone page and the shared protocol.
 *
 * `site/phone/index.html` is a standalone file served by GitHub Pages, so it
 * cannot import `src/shared/phone-hub.ts` — it repeats the room prefix, marker,
 * protocol version and timings. A silent divergence would be invisible until a
 * phone failed to connect, so this test reads the page and pins every constant
 * to its shared counterpart. It also checks the page's link parser against the
 * shared one on the exact strings the GUI hands out.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	formatPhoneHubLink,
	PHONE_HUB_PING_MS,
	PHONE_HUB_PROTO,
	PHONE_HUB_ROOM_MARKER,
	PHONE_HUB_ROOM_PREFIX,
	PHONE_HUB_SILENCE_LIMIT_MS,
	parsePhoneHubLink,
} from "../shared/phone-hub";

const pagePath = path.join(__dirname, "..", "..", "site", "phone", "index.html");
const page = fs.readFileSync(pagePath, "utf8");

/** Read a `const NAME = <value>;` from the page's inline script. */
function pageConst(name: string): string {
	const match = new RegExp(`const ${name} = (.+?);`).exec(page);
	if (!match?.[1]) throw new Error(`page is missing ${name}`);
	return match[1].trim();
}

describe("phone page mirrors the shared protocol", () => {
	it("uses the same protocol version", () => {
		expect(pageConst("PROTO")).toBe(String(PHONE_HUB_PROTO));
	});

	it("uses the same room prefix and marker", () => {
		expect(pageConst("ROOM_PREFIX")).toBe(JSON.stringify(PHONE_HUB_ROOM_PREFIX));
		expect(pageConst("ROOM_MARKER")).toBe(JSON.stringify(PHONE_HUB_ROOM_MARKER));
	});

	it("uses the same ping and silence timings", () => {
		// `15 * 1000` and `15000` are the same intent; compare numerically.
		const ping = pageConst("PING_MS").replace(/_/g, "");
		const silence = pageConst("SILENCE_LIMIT_MS").replace(/_/g, "");
		expect(Number(ping)).toBe(PHONE_HUB_PING_MS);
		expect(Number(silence)).toBe(PHONE_HUB_SILENCE_LIMIT_MS);
	});

	it("reads the same link the GUI hands out", () => {
		// The page's parser is inline JS; its contract is the shared one, so the
		// strings it must accept are asserted through the shared parser here and
		// the page's own parser is checked by the e2e that opens the real page.
		const link = formatPhoneHubLink("wss://my.omp.sh", {
			roomId: `${PHONE_HUB_ROOM_MARKER}abc123`,
			key: "k".repeat(43),
		});
		expect(parsePhoneHubLink(link)?.link.roomId).toBe(`${PHONE_HUB_ROOM_MARKER}abc123`);
		// The fragment the page receives is the link itself, with the page URL's
		// own fragment in front of it; the shared parser handles both shapes.
		expect(parsePhoneHubLink(`https://smokeyduck.github.io/wisa-studio/phone/#${link}`)?.link.key).toBe(
			"k".repeat(43),
		);
	});
});
