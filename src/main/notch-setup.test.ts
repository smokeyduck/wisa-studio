import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_NOTCH_SETTINGS } from "../shared/agent-notch";
import { normalizeAgentNotchSettings } from "./agent-notch-state";
import { decodeNotchSetup, encodeNotchSetup } from "./notch-setup";

describe("portable Notch setups", () => {
	it("round trips a user layout, including intentionally empty layouts and agent selections", () => {
		const settings = { ...DEFAULT_AGENT_NOTCH_SETTINGS, agents: [], widgets: [] };
		expect(decodeNotchSetup(encodeNotchSetup(settings))).toEqual(settings);
	});
	it("preserves widget order and text without treating it as markup or code", () => {
		const settings = {
			...DEFAULT_AGENT_NOTCH_SETTINGS,
			widgets: [
				{ id: "note-a", kind: "note" as const, title: "My layout", text: "<script>never run</script>" },
				{ id: "clock", kind: "clock" as const, title: "", text: "" },
			],
		};
		expect(decodeNotchSetup(encodeNotchSetup(settings))).toEqual(settings);
	});
	it.each([
		{ width: 1 },
		{ opacity: 0 },
		{ agents: ["untrusted"] },
		{ background: "url(https://remote)" },
		{ command: "execute me" },
		{
			widgets: [
				{ id: "dup", kind: "clock", title: "", text: "" },
				{ id: "dup", kind: "note", title: "", text: "" },
			],
		},
	])("rejects invalid imported settings instead of silently applying another layout: %j", patch => {
		expect(() =>
			decodeNotchSetup(
				JSON.stringify({
					format: "wisa-notch",
					version: 1,
					settings: { ...DEFAULT_AGENT_NOTCH_SETTINGS, ...patch },
				}),
			),
		).toThrow();
	});
	it("rejects unknown formats and preserves explicit legacy opt-outs during migration", () => {
		expect(() => decodeNotchSetup('{"format":"wisa-notch","version":2}')).toThrow();
		expect(normalizeAgentNotchSettings({ enabled: false, showWhenIdle: false })).toMatchObject({
			enabled: false,
			showWhenIdle: false,
			widgets: DEFAULT_AGENT_NOTCH_SETTINGS.widgets,
		});
	});
});
