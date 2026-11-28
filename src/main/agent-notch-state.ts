import {
	type AgentNotchSettings,
	DEFAULT_AGENT_NOTCH_SETTINGS,
	NOTCH_AGENTS,
	type NotchWidget,
} from "../shared/agent-notch";
import type { ExtensionUIRequest, ExtensionUIResponse } from "../shared/rpc-types";

export function normalizeAgentNotchSettings(value: unknown): AgentNotchSettings {
	const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	const defaults = DEFAULT_AGENT_NOTCH_SETTINGS;
	const configuredAgents = source.agents;
	const flag = (key: keyof AgentNotchSettings): boolean =>
		typeof source[key] === "boolean" ? (source[key] as boolean) : (defaults[key] as boolean);
	const number = (key: keyof AgentNotchSettings, min: number, max: number): number =>
		typeof source[key] === "number" && Number.isFinite(source[key])
			? Math.min(max, Math.max(min, source[key] as number))
			: (defaults[key] as number);
	const color = (key: "background" | "foreground" | "accent"): string =>
		typeof source[key] === "string" && /^#[0-9a-f]{6}$/i.test(source[key]) ? source[key] : defaults[key];
	const widgets: NotchWidget[] = [];
	const ids = new Set<string>();
	if (Array.isArray(source.widgets)) {
		for (const item of source.widgets.slice(0, 12)) {
			if (!item || typeof item !== "object") continue;
			const widget = item as Record<string, unknown>;
			if (typeof widget.id !== "string" || !/^[\w-]{1,64}$/.test(widget.id) || ids.has(widget.id)) continue;
			if (
				widget.kind !== "sessions" &&
				widget.kind !== "clock" &&
				widget.kind !== "note" &&
				widget.kind !== "activity"
			)
				continue;
			ids.add(widget.id);
			widgets.push({
				id: widget.id,
				kind: widget.kind,
				title: typeof widget.title === "string" ? widget.title.slice(0, 120) : "",
				text: typeof widget.text === "string" ? widget.text.slice(0, 4000) : "",
			});
		}
	}
	return {
		enabled: flag("enabled"),
		displays: source.displays === "primary" ? "primary" : "all",
		showWhenIdle: flag("showWhenIdle"),
		agents: Array.isArray(configuredAgents)
			? NOTCH_AGENTS.filter(agent => configuredAgents.includes(agent))
			: [...defaults.agents],
		openOnHover: flag("openOnHover"),
		openForApprovals: flag("openForApprovals"),
		approveInNotch: flag("approveInNotch"),
		shortcuts: flag("shortcuts"),
		sounds: flag("sounds"),
		width: Math.round(number("width", 560, 1100)),
		maxCards: Math.round(number("maxCards", 1, 10)),
		background: color("background"),
		foreground: color("foreground"),
		accent: color("accent"),
		opacity: number("opacity", 0.4, 1),
		radius: Math.round(number("radius", 0, 48)),
		widgets: Array.isArray(source.widgets) ? widgets : defaults.widgets.map(widget => ({ ...widget })),
	};
}

const ONCE = /^(?:allow(?: once| this time)?|approve(?: once)?|yes)$/i;
const DENY = /^(?:deny|reject|no|cancel)$/i;
const ALWAYS = /^(?:always allow|allow always|allow for this session|always approve)$/i;

/** Only exact offered choices can be sent back. Native's generic Always never invents a grant. */
export function notchRequestPresentation(request: ExtensionUIRequest): Record<string, unknown> | null {
	if (request.method === "confirm") return { tool_name: request.title, tool_input: { command: request.message } };
	if (request.method === "select") {
		if (
			request.options.filter(option => ONCE.test(option)).length === 1 &&
			request.options.some(option => DENY.test(option))
		) {
			return {
				tool_name: request.title,
				tool_input: { command: request.title },
				permission_suggestions: request.options.filter(option => ALWAYS.test(option)),
			};
		}
		if (new Set(request.options).size !== request.options.length || !request.options.length) return null;
		return {
			tool_name: "AskUserQuestion",
			tool_input: {
				questions: [
					{ question: request.title, options: request.options.map(label => ({ label })), multiSelect: false },
				],
			},
		};
	}
	if (request.method !== "ask" && request.method !== "askDialog") return null;
	if (
		!request.questions.length ||
		new Set(request.questions.map(question => question.question)).size !== request.questions.length ||
		new Set(request.questions.map(question => question.id)).size !== request.questions.length ||
		request.questions.some(
			question =>
				!question.options.length ||
				(question.multi && question.options.some(option => option.label.includes(", "))) ||
				new Set(question.options.map(option => option.label)).size !== question.options.length,
		)
	)
		return null;
	return {
		tool_name: "AskUserQuestion",
		tool_input: {
			questions: request.questions.map(question => ({
				question: question.question,
				header: question.header,
				options: question.options,
				multiSelect: question.multi === true,
			})),
		},
	};
}

export function notchResponse(request: ExtensionUIRequest, input: unknown): ExtensionUIResponse | null {
	if (!input || typeof input !== "object") return null;
	const reply = input as Record<string, unknown>;
	if (reply._request_id !== request.id || !notchRequestPresentation(request)) return null;
	const base = { type: "extension_ui_response" as const, id: request.id };
	if (request.method === "confirm") {
		return reply.behavior === "allow"
			? { ...base, confirmed: true }
			: reply.behavior === "deny"
				? { ...base, confirmed: false }
				: null;
	}
	if (request.method === "select" && reply.behavior !== "answer") {
		const pattern =
			reply.behavior === "allow"
				? ONCE
				: reply.behavior === "deny"
					? DENY
					: reply.behavior === "always"
						? ALWAYS
						: null;
		const options = pattern ? request.options.filter(option => pattern.test(option)) : [];
		return options.length === 1 ? { ...base, value: options[0]! } : null;
	}
	if (
		reply.behavior !== "answer" ||
		!reply.answers ||
		typeof reply.answers !== "object" ||
		Array.isArray(reply.answers)
	)
		return null;
	const answers = reply.answers as Record<string, unknown>;
	const questions =
		request.method === "select"
			? [
					{
						id: request.id,
						question: request.title,
						options: request.options.map(label => ({ label })),
						multi: false,
					},
				]
			: request.method === "ask" || request.method === "askDialog"
				? request.questions
				: [];
	const selections = questions.map(question => {
		const answer = answers[question.question];
		return typeof answer !== "string" ? [] : question.multi ? answer.split(", ") : [answer];
	});
	if (
		Object.keys(answers).length !== questions.length ||
		!questions.every(
			(question, index) =>
				Object.hasOwn(answers, question.question) &&
				selections[index]!.length > 0 &&
				new Set(selections[index]).size === selections[index]!.length &&
				selections[index]!.every(label => question.options.some(option => option.label === label)),
		)
	)
		return null;
	if (request.method === "select") return { ...base, value: answers[request.title] as string };
	if (request.method === "ask")
		return {
			...base,
			answers: questions.map((question, index) => ({ id: question.id, selectedOptions: selections[index]! })),
		};
	return {
		...base,
		askDialog: {
			kind: "submit",
			results: questions.map((question, index) => ({
				id: question.id,
				question: question.question,
				options: question.options.map(option => option.label),
				multi: question.multi === true,
				selectedOptions: selections[index]!,
			})),
		},
	};
}
