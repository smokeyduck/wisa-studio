import type { NotchAgent } from "./agent-notch";

export interface NotchIntegrationInfo {
	agent: NotchAgent;
	connected: boolean;
	configPath: string;
	command: string;
}

/** Local custom hook protocol v1. No terminal commands or credentials are accepted.
 * POST /events with Authorization: Bearer <token from bridge.json>, no Origin/Cookie.
 * Body: {agent:"custom",event:<hook_event_name>,payload:NotchCustomEvent}.
 * Notifications return {}; PermissionRequest waits at most 90 seconds and returns
 * {decision:"allow"|"deny",requestId} only after an explicit panel decision.
 * Empty response, disconnect, timeout or error means NO override: use your own prompt.
 * Close the HTTP connection to cancel. Tokens/bridge.json must never be exported.
 */
export interface NotchCustomEvent {
	session_id: string;
	hook_event_name:
		| "SessionStart"
		| "SessionEnd"
		| "UserPromptSubmit"
		| "PreToolUse"
		| "PostToolUse"
		| "Stop"
		| "StopFailure"
		| "Notification"
		| "PermissionRequest";
	cwd?: string;
	prompt?: string;
	tool_name?: string;
	tool_input?: Record<string, unknown>;
	message?: string;
	last_assistant_message?: string;
	/** Required, unique per outstanding permission request. */
	request_id?: string;
	/** Only custom callers explicitly declaring this capability may block. */
	response_mode?: "allow-deny";
}
