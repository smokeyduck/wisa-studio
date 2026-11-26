import type { AgentMessage, AgentSessionEvent } from "../../shared/rpc-types";

/** Core emits this alongside the structured compaction summary. */
export function isLegacyCompactionSuccess(text: string): boolean {
	return /^Compaction complete\.(?: Tokens: \d+ -> \d+ \(saved -?\d+\)\.)?$/.test(text.trim());
}

export function isLegacyCompactionCommandMessage(message: AgentMessage): boolean {
	if (message.role !== "custom" || message.customType !== "command") return false;
	const { content } = message;
	if (typeof content === "string") return isLegacyCompactionSuccess(content);
	const block = content?.length === 1 ? content[0] : undefined;
	return block?.type === "text" && isLegacyCompactionSuccess(block.text);
}

export function isAgentStart(event: AgentSessionEvent): event is Extract<AgentSessionEvent, { type: "agent_start" }> {
	return event.type === "agent_start";
}

export function isAgentEnd(event: AgentSessionEvent): event is Extract<AgentSessionEvent, { type: "agent_end" }> {
	return event.type === "agent_end";
}

export function isTurnStart(event: AgentSessionEvent): event is Extract<AgentSessionEvent, { type: "turn_start" }> {
	return event.type === "turn_start";
}

export function isTurnEnd(event: AgentSessionEvent): event is Extract<AgentSessionEvent, { type: "turn_end" }> {
	return event.type === "turn_end";
}

export function isMessageStart(
	event: AgentSessionEvent,
): event is Extract<AgentSessionEvent, { type: "message_start" }> {
	return event.type === "message_start";
}

export function isMessageUpdate(
	event: AgentSessionEvent,
): event is Extract<AgentSessionEvent, { type: "message_update" }> {
	return event.type === "message_update";
}

export function isMessageEnd(event: AgentSessionEvent): event is Extract<AgentSessionEvent, { type: "message_end" }> {
	return event.type === "message_end";
}

export function isToolExecutionStart(
	event: AgentSessionEvent,
): event is Extract<AgentSessionEvent, { type: "tool_execution_start" }> {
	return event.type === "tool_execution_start";
}

export function isToolExecutionUpdate(
	event: AgentSessionEvent,
): event is Extract<AgentSessionEvent, { type: "tool_execution_update" }> {
	return event.type === "tool_execution_update";
}

export function isToolExecutionEnd(
	event: AgentSessionEvent,
): event is Extract<AgentSessionEvent, { type: "tool_execution_end" }> {
	return event.type === "tool_execution_end";
}

export function isAutoCompactionStart(
	event: AgentSessionEvent,
): event is Extract<AgentSessionEvent, { type: "auto_compaction_start" }> {
	return event.type === "auto_compaction_start";
}

export function isAutoCompactionEnd(
	event: AgentSessionEvent,
): event is Extract<AgentSessionEvent, { type: "auto_compaction_end" }> {
	return event.type === "auto_compaction_end";
}

export function isNotice(event: AgentSessionEvent): event is Extract<AgentSessionEvent, { type: "notice" }> {
	return event.type === "notice";
}

export function isTodoReminder(
	event: AgentSessionEvent,
): event is Extract<AgentSessionEvent, { type: "todo_reminder" }> {
	return event.type === "todo_reminder";
}

export function isThinkingLevelChanged(
	event: AgentSessionEvent,
): event is Extract<AgentSessionEvent, { type: "thinking_level_changed" }> {
	return event.type === "thinking_level_changed";
}
