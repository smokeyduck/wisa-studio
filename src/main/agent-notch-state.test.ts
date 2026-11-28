import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_NOTCH_SETTINGS } from "../shared/agent-notch";
import type { ExtensionUIRequest } from "../shared/rpc-types";
import { normalizeAgentNotchSettings, notchRequestPresentation, notchResponse } from "./agent-notch-state";

const request: ExtensionUIRequest = {
	type: "extension_ui_request",
	id: "questions",
	method: "ask",
	questions: [
		{ id: "q1", question: "Choose one", options: [{ label: "A" }, { label: "B" }] },
		{ id: "q2", question: "Choose several", multi: true, options: [{ label: "X" }, { label: "Y" }] },
	],
};

describe("native notch protocol validation", () => {
	it("normalizes persisted defaults without accepting arbitrary values", () => {
		expect(normalizeAgentNotchSettings(undefined)).toEqual(DEFAULT_AGENT_NOTCH_SETTINGS);
		expect(normalizeAgentNotchSettings({ enabled: "false", displays: "pointer", showWhenIdle: 1 })).toEqual({
			...DEFAULT_AGENT_NOTCH_SETTINGS,
			enabled: true,
			displays: "all",
			showWhenIdle: true,
		});
		expect(normalizeAgentNotchSettings({ enabled: false, displays: "primary", showWhenIdle: true })).toEqual({
			...DEFAULT_AGENT_NOTCH_SETTINGS,
			enabled: false,
			displays: "primary",
			showWhenIdle: true,
		});
		expect(normalizeAgentNotchSettings({ enabled: false, showWhenIdle: false })).toEqual({
			...DEFAULT_AGENT_NOTCH_SETTINGS,
			enabled: false,
			displays: "all",
			showWhenIdle: false,
		});
	});
	it("validates every question and returns upstream IDs in original order", () => {
		expect(
			notchResponse(request, {
				_request_id: "questions",
				behavior: "answer",
				answers: { "Choose several": "X, Y", "Choose one": "B" },
			}),
		).toEqual({
			type: "extension_ui_response",
			id: "questions",
			answers: [
				{ id: "q1", selectedOptions: ["B"] },
				{ id: "q2", selectedOptions: ["X", "Y"] },
			],
		});
	});
	it.each([
		{ "Choose one": "A" },
		{ "Choose one": "C", "Choose several": "X" },
		{ "Choose one": "A", "Choose several": "X, X" },
		{ "Choose one": "A", "Choose several": "X", extra: "Y" },
		{ "Choose one": "A", "Choose several": ["X"] },
	])("rejects partial, invented or malformed answers: %j", answers => {
		expect(notchResponse(request, { _request_id: "questions", behavior: "answer", answers })).toBeNull();
	});
	it("does not answer a different captured request even if its title matches", () => {
		expect(
			notchResponse(request, {
				_request_id: "other",
				behavior: "answer",
				answers: { "Choose one": "A", "Choose several": "X" },
			}),
		).toBeNull();
	});
	it("refuses Always unless exactly one actual offered option grants it", () => {
		const select: ExtensionUIRequest = {
			type: "extension_ui_request",
			id: "permission",
			method: "select",
			title: "Permission",
			options: ["Allow once", "Deny"],
		};
		expect(notchResponse(select, { _request_id: "permission", behavior: "allow" })).toEqual({
			type: "extension_ui_response",
			id: "permission",
			value: "Allow once",
		});
		expect(notchResponse(select, { _request_id: "permission", behavior: "always" })).toBeNull();
		expect(
			notchResponse(
				{ ...select, options: [...select.options, "Allow for this session"] },
				{ _request_id: "permission", behavior: "always" },
			),
		).toEqual({ type: "extension_ui_response", id: "permission", value: "Allow for this session" });
	});
	it("routes unsupported editor/login/forms and ambiguous native question encodings to Wisa", () => {
		expect(
			notchRequestPresentation({ type: "extension_ui_request", id: "editor", method: "editor", title: "Edit" }),
		).toBeNull();
		expect(
			notchRequestPresentation({ type: "extension_ui_request", id: "login", method: "input", title: "API key" }),
		).toBeNull();
		expect(
			notchRequestPresentation({ type: "extension_ui_request", id: "form", method: "form", sections: [] }),
		).toBeNull();
		if (request.method !== "ask") throw new Error("ask fixture required");
		expect(
			notchRequestPresentation({
				...request,
				questions: [{ ...request.questions[1]!, options: [{ label: "X, Y" }] }],
			}),
		).toBeNull();
		expect(
			notchRequestPresentation({
				...request,
				questions: [request.questions[0]!, { ...request.questions[0]!, id: "different" }],
			}),
		).toBeNull();
	});
});
