import type { AgentNotchSettings, NotchAgent } from "./agent-notch";
import { NOTCH_AGENTS } from "./agent-notch";

export const NOTCH_PANEL_CHANNELS = {
	get: "notch-panel:get",
	state: "notch-panel:state",
	action: "notch-panel:action",
} as const;
export interface PanelQuestion {
	question: string;
	options: string[];
	multi: boolean;
}
export interface PanelRequest {
	id: string;
	identity: string;
	sessionId: string;
	tool: string;
	detail: string;
	questions: PanelQuestion[] | null;
	always: boolean;
	supported: boolean;
}
export interface PanelSession {
	id: string;
	agent: NotchAgent;
	title: string;
	cwd: string;
	running: boolean;
	failed: boolean;
	waiting: boolean;
	tool: string;
	preview: string;
}
export interface NotchPanelState {
	settings: AgentNotchSettings;
	labels: Record<string, string>;
	expanded: boolean;
	sessions: PanelSession[];
	requests: PanelRequest[];
	activity: string[];
}
export type PanelAction =
	| { type: "expand" | "collapse" | "disable" }
	| { type: "open"; sessionId: string }
	| {
			type: "respond";
			requestId: string;
			identity: string;
			behavior: "allow" | "always" | "deny" | "answer";
			answers?: Record<string, string>;
	  };
export interface NotchPanelApi {
	get(): Promise<NotchPanelState>;
	events(callback: (state: NotchPanelState) => void): () => void;
	action(action: PanelAction): void;
}
export interface PanelEvent {
	kind: string;
	sessionId: string;
	agent: NotchAgent;
	title: string;
	cwd: string;
	running: boolean;
	tool: string;
	preview: string;
	requestId: string;
	detail: string;
	questions: PanelQuestion[] | null;
	supported: boolean;
	always: boolean;
}
const EVENTS: Record<string, true> = {
	WisaSnapshot: true,
	SessionEnd: true,
	PermissionRequest: true,
	SessionStart: true,
	UserPromptSubmit: true,
	PreToolUse: true,
	PostToolUse: true,
	Stop: true,
	StopFailure: true,
	Notification: true,
};
const record = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 12000): string => (typeof value === "string" ? value.slice(0, max) : "");
/** Copies only the supported wire fields; arbitrary hook payloads never cross into the renderer. */
export function parsePanelEvent(value: unknown): PanelEvent | null {
	if (
		!record(value) ||
		typeof value.hook_event_name !== "string" ||
		!Object.hasOwn(EVENTS, value.hook_event_name) ||
		typeof value.session_id !== "string" ||
		!value.session_id ||
		value.session_id.length > 1024
	)
		return null;
	const agent =
		typeof value._agent === "string" && NOTCH_AGENTS.includes(value._agent as NotchAgent)
			? (value._agent as NotchAgent)
			: "custom";
	const input = record(value.tool_input) ? value.tool_input : {};
	const tool = text(value.tool_name, 512);
	let questions: PanelQuestion[] | null = null;
	if (
		tool === "AskUserQuestion" &&
		Array.isArray(input.questions) &&
		input.questions.length > 0 &&
		input.questions.length <= 20
	) {
		const parsed: PanelQuestion[] = [];
		for (const item of input.questions) {
			if (
				!record(item) ||
				typeof item.question !== "string" ||
				!item.question ||
				item.question.length > 4000 ||
				!Array.isArray(item.options) ||
				!item.options.length ||
				item.options.length > 40
			)
				return null;
			const options: string[] = [];
			for (const option of item.options) {
				if (!record(option) || typeof option.label !== "string" || !option.label || option.label.length > 2000)
					return null;
				options.push(option.label);
			}
			if (
				new Set(options).size !== options.length ||
				(item.multiSelect === true && options.some(option => option.includes(", ")))
			)
				return null;
			parsed.push({ question: item.question, options, multi: item.multiSelect === true });
		}
		if (new Set(parsed.map(question => question.question)).size !== parsed.length) return null;
		questions = parsed;
	}
	const requestId = text(value._request_id, 1024);
	if (value.hook_event_name === "PermissionRequest" && (!requestId || requestId !== value._request_id)) return null;
	const detail = [text(input.command), text(input.description), text(input.diff), text(value.message)]
		.filter(Boolean)
		.join("\n")
		.slice(0, 24000);
	return {
		kind: value.hook_event_name,
		sessionId: value.session_id,
		agent,
		title: text(value._title, 512),
		cwd: text(value.cwd, 4096),
		running: value.running === true,
		tool,
		preview: text(value.last_assistant_message),
		requestId,
		detail,
		questions,
		supported: tool !== "AskUserQuestion" || questions !== null,
		always: Array.isArray(value.permission_suggestions) && value.permission_suggestions.length > 0,
	};
}
export function validPanelAnswer(request: PanelRequest, value: unknown): value is Record<string, string> {
	if (!request.questions || !record(value) || Object.keys(value).length !== request.questions.length) return false;
	return request.questions.every(question => {
		if (!Object.hasOwn(value, question.question) || typeof value[question.question] !== "string") return false;
		const labels = question.multi ? (value[question.question] as string).split(", ") : [value[question.question]];
		return (
			labels.length > 0 &&
			new Set(labels).size === labels.length &&
			labels.every(label => question.options.includes(label as string))
		);
	});
}
