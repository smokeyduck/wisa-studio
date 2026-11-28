import type { NotchIntegrationInfo } from "./notch-integrations";

export const AGENT_NOTCH_PREF = "agentNotch";

export const AGENT_NOTCH_CHANNELS = {
	get: "agent-notch:get",
	configure: "agent-notch:configure",
	changed: "agent-notch:changed",
	exportSetup: "agent-notch:export",
	importSetup: "agent-notch:import",
	integrations: "agent-notch:integrations",
	connectAgent: "agent-notch:connect-agent",
} as const;

export const NOTCH_AGENTS = ["wisa", "claude", "codex", "cursor", "gemini", "copilot", "opencode", "custom"] as const;
export type NotchAgent = (typeof NOTCH_AGENTS)[number];
export type NotchWidgetKind = "sessions" | "clock" | "note" | "activity";
export interface NotchWidget {
	id: string;
	kind: NotchWidgetKind;
	title: string;
	text: string;
}

export interface AgentNotchSettings {
	enabled: boolean;
	displays: "all" | "primary";
	showWhenIdle: boolean;
	agents: NotchAgent[];
	openOnHover: boolean;
	openForApprovals: boolean;
	approveInNotch: boolean;
	shortcuts: boolean;
	sounds: boolean;
	width: number;
	maxCards: number;
	background: string;
	foreground: string;
	accent: string;
	opacity: number;
	radius: number;
	widgets: NotchWidget[];
}

export interface AgentNotchState {
	settings: AgentNotchSettings;
	available: boolean;
	/** A missing helper or launch failure must not be presented as an enabled panel. */
	error: string | null;
}

export const DEFAULT_AGENT_NOTCH_SETTINGS: AgentNotchSettings = {
	enabled: true,
	displays: "all",
	showWhenIdle: true,
	agents: ["wisa"],
	openOnHover: true,
	openForApprovals: true,
	approveInNotch: true,
	shortcuts: false,
	sounds: true,
	width: 720,
	maxCards: 5,
	background: "#101012",
	foreground: "#ffffff",
	accent: "#c8ad75",
	opacity: 1,
	radius: 26,
	widgets: [{ id: "sessions", kind: "sessions", title: "", text: "" }],
};

export interface AgentNotchApi {
	getState(): Promise<AgentNotchState>;
	configure(settings: AgentNotchSettings): Promise<AgentNotchState>;
	exportSetup(): Promise<boolean>;
	importSetup(): Promise<AgentNotchState | null>;
	integrations(): Promise<NotchIntegrationInfo[]>;
	connectAgent(agent: NotchAgent, connected: boolean): Promise<NotchIntegrationInfo[]>;
	onChanged(callback: (state: AgentNotchState) => void): () => void;
}
