import { describe, expect, it } from "vitest";
import { type PanelRequest, parsePanelEvent, validPanelAnswer } from "./notch-panel";

describe("portable notch wire boundary", () => {
	it("accepts snapshot fields without carrying arbitrary hook data", () => {
		const event = parsePanelEvent({
			hook_event_name: "WisaSnapshot",
			session_id: "tab",
			_agent: "wisa",
			_title: "Work",
			running: true,
			last_assistant_message: "<script>not markup</script>",
			secrets: "hidden",
		});
		expect(event).toMatchObject({
			sessionId: "tab",
			agent: "wisa",
			running: true,
			preview: "<script>not markup</script>",
		});
		expect(event).not.toHaveProperty("secrets");
	});
	it("rejects unknown events, missing identities and oversized identities", () => {
		expect(parsePanelEvent({ hook_event_name: "__proto__", session_id: "x" })).toBeNull();
		expect(parsePanelEvent({ hook_event_name: "PermissionRequest", session_id: "x" })).toBeNull();
		expect(parsePanelEvent({ hook_event_name: "Stop", session_id: "x".repeat(1025) })).toBeNull();
	});
	it("keeps unsupported forms out of the approval buttons", () => {
		expect(
			parsePanelEvent({
				hook_event_name: "PermissionRequest",
				session_id: "x",
				_request_id: "r",
				tool_name: "AskUserQuestion",
				tool_input: {},
			})?.supported,
		).toBe(false);
	});
	it("rejects ambiguous questions rather than synthesizing selections", () => {
		const question = { question: "Pick", options: [{ label: "A" }, { label: "A" }] };
		expect(
			parsePanelEvent({
				hook_event_name: "PermissionRequest",
				session_id: "x",
				_request_id: "r",
				tool_name: "AskUserQuestion",
				tool_input: { questions: [question] },
			}),
		).toBeNull();
	});
	it("only renders an actual supplied diff", () => {
		expect(
			parsePanelEvent({
				hook_event_name: "PreToolUse",
				session_id: "x",
				tool_input: { file_path: "/tmp/file", content: "not a diff" },
			})?.detail,
		).toBe("");
		expect(
			parsePanelEvent({ hook_event_name: "PreToolUse", session_id: "x", tool_input: { diff: "-old\n+new" } })
				?.detail,
		).toBe("-old\n+new");
	});
});

describe("portable notch answer validation", () => {
	const request: PanelRequest = {
		id: "r",
		identity: "immutable",
		sessionId: "s",
		tool: "AskUserQuestion",
		detail: "",
		supported: true,
		always: false,
		questions: [
			{ question: "Single", options: ["One", "Two"], multi: false },
			{ question: "Multiple", options: ["A", "B"], multi: true },
		],
	};
	it("accepts exact single and multiple offered choices", () => {
		expect(validPanelAnswer(request, { Single: "Two", Multiple: "A, B" })).toBe(true);
	});
	it("rejects missing, invented, duplicate and extra selections", () => {
		for (const answers of [
			{ Single: "One" },
			{ Single: "Other", Multiple: "A" },
			{ Single: "One", Multiple: "A, A" },
			{ Single: "One", Multiple: "A", Extra: "B" },
			{ Single: "One, Two", Multiple: "B" },
		])
			expect(validPanelAnswer(request, answers)).toBe(false);
	});
	it("does not accept inherited answers", () => {
		expect(validPanelAnswer(request, Object.create({ Single: "One", Multiple: "A" }))).toBe(false);
	});
});
