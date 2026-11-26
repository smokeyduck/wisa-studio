/**
 * ChatStream pure helpers: transcript row construction and timeline marker derivation.
 * The renderer keeps only its UI and state wiring.
 */

import type { AgentMessage, MessageContent, RpcQueuedMessage } from "../../../shared/rpc-types";
import { isLegacyCompactionCommandMessage } from "../../lib/event-parser";
import { resultDetails } from "../../lib/format";
import { messageIdentity, messageTimestampMs } from "../../lib/message-identity";
import { isRenderableMessageText, messageText, splitReaction } from "../../lib/messages";
import type { ReadGroupEntry, ReadGroupUsage } from "../../lib/read-group";
import type { QueueLane } from "../../stores/queue";
import { todoPhasesFromToolResult } from "../../stores/todo";
import { type ToolEntry, toolEntryKey } from "../../stores/tools";
import type { TranscriptDetail } from "../../stores/ui";
import { isCompletionMessage, launchCompletionFailureCount } from "./completion-events";

interface ProcessMeta {
	stepCount: number;
	failedEvents: number;
	backgroundEvents: number;
	toolCallIds: string[];
	toolNames: string[];
}

type TimelineState = "done" | "running" | "error" | "launch";

export interface TimelineMarkerSeed {
	state: TimelineState;
	timestamp?: number | string;
	toolIds: string[];
}

export interface ConversationAnchor {
	key: string;
	rowIndex: number;
	preview: string;
	timestamp?: number | string;
}

const CONVERSATION_PREVIEW_LIMIT = 180;

/** Slack still counted as "the live edge" when deciding whether to follow the tail.
 * A single CSS pixel was brittle: row re-measurement, font loading and fractional
 * scrollTop routinely leave a few pixels under the last row, which read as "the
 * user scrolled away" and stopped all tail following. */
export const LIVE_EDGE_SLACK_PX = 24;

/** True at the live edge, within the tail-following slack. */
export function isTranscriptAtLiveEdge(metrics: {
	scrollHeight: number;
	scrollTop: number;
	clientHeight: number;
}): boolean {
	return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight < LIVE_EDGE_SLACK_PX;
}

/** Direction of the reader's last viewport gesture: `true` toward the tail, `false`
 * away from it, `null` when the movement was not attributed to a gesture at all (a
 * restored view, a scrollbar press, a touch flick). */
export type GestureTowardTail = boolean | null;

/** Re-engaging the tail is a claim about reader intent, so it takes a gesture toward
 * the tail rather than a viewport that merely happens to sit there. A tail-follow
 * write that slips into the same frame as an upward gesture lands at the live edge;
 * re-pinning from that position clears the gesture latch, every later append then
 * follows the tail again, and the view the reader just took is lost for the rest of
 * the run. Unattributed moves stay unpinned — releasing a drag or a flick at the edge
 * is the gesture that re-engages there. */
export function shouldRePinTranscript(gestureTowardTail: GestureTowardTail, atLiveEdge: boolean): boolean {
	return atLiveEdge && gestureTowardTail === true;
}

/**
 * How far from the end of the transcript a live commit can hand over rows, and
 * the largest growth that still reads as one turn. A wider jump is a hydrate or
 * a page of history arriving.
 */
export const ROW_ENTRANCE_TAIL_ROWS = 6;

export interface MountedTranscriptRow {
	index: number;
	key: string;
}

/** Bookkeeping for which rows have already been treated as arriving content. */
export interface RowEntranceState {
	sessionId: string | undefined;
	rowCount: number;
	seen: Set<string>;
}

export interface RowEntrancePass {
	sessionId: string | undefined;
	/**
	 * Whether this commit grew the transcript out of a live run. Hydration and
	 * pagination replace the message list without announcing an arrival, so a
	 * restored view must never cascade.
	 */
	live: boolean;
	rowKeys: readonly string[];
	mounted: readonly MountedTranscriptRow[];
}

export function createRowEntranceState(sessionId: string | undefined, rowKeys: readonly string[]): RowEntranceState {
	return { sessionId, rowCount: rowKeys.length, seen: new Set(rowKeys) };
}

/**
 * Claim the mounted rows whose content just arrived at the tail.
 *
 * Rows are recycled through the viewport, so mounting is not an arrival: an
 * entrance keyed on mount replays on every scroll, which is what made the
 * transcript's entrance motion unusable. A claim therefore needs a live run, a
 * row set that moved by one turn's worth at most, a slot at the end of the
 * transcript, and a key that has never been mounted before.
 */
export function claimRowEntrances(state: RowEntranceState, pass: RowEntrancePass): string[] {
	const { sessionId, live, rowKeys, mounted } = pass;
	if (state.sessionId !== sessionId) {
		// Switching sessions restores a view; none of it is content arriving.
		state.sessionId = sessionId;
		state.rowCount = rowKeys.length;
		state.seen = new Set(rowKeys);
		return [];
	}
	const jumped = Math.abs(rowKeys.length - state.rowCount) > ROW_ENTRANCE_TAIL_ROWS;
	state.rowCount = rowKeys.length;
	const tailFrom = rowKeys.length - 1 - ROW_ENTRANCE_TAIL_ROWS;
	const admitting = live && !jumped;

	const claims: string[] = [];
	for (const row of mounted) {
		if (state.seen.has(row.key)) continue;
		state.seen.add(row.key);
		if (!admitting || row.index < tailFrom) continue;
		claims.push(row.key);
	}
	return claims;
}

/**
 * The row showing the message with this session entry id: its own message row,
 * or the folded process group holding it (which has to open to show it).
 */
export function locateEntryRow(
	rows: readonly Row[],
	entryId: string,
): { index: number; kind: "message" | "process" } | null {
	for (const [index, row] of rows.entries()) {
		if (
			row.kind === "message" &&
			(row.message.entryId === entryId || row.todoReminders?.some(notice => notice.entryId === entryId))
		) {
			return { index, kind: "message" };
		}
		const process = row.kind === "process" ? row : row.kind === "streaming" ? row.process : undefined;
		if (process?.messages.some(message => message.entryId === entryId)) {
			return { index, kind: "process" };
		}
	}
	return null;
}

export type HistoryRow =
	| { kind: "message"; message: AgentMessage; reaction?: string; repeats?: number; todoReminders?: AgentMessage[] }
	| { kind: "readGroup"; entries: ReadGroupEntry[]; usage?: ReadGroupUsage[] }
	| ProcessRow
	| { kind: "subagent"; id: string; timestamp: number; reuse?: string };

export type ProcessRow = { kind: "process"; messages: AgentMessage[] } & ProcessMeta;

/** What one run changed on disk: distinct files and their line totals. */
export interface TurnChangeSummary {
	files: number;
	adds: number;
	removes: number;
}

/**
 * Summarize the file edits a run made since its prompt (`sinceMs`). Failed
 * edits changed nothing and virtual artifacts are not files, so neither
 * counts; a file edited several times counts once, its lines every time.
 * Null when the run changed no file — the transcript then shows no summary.
 */
export function summarizeTurnChanges(
	edits: ReadonlyArray<{
		file: string;
		timestamp: number;
		adds: number;
		removes: number;
		isError: boolean;
		isVirtual: boolean;
	}>,
	sinceMs: number,
): TurnChangeSummary | null {
	const files = new Set<string>();
	let adds = 0;
	let removes = 0;
	for (const edit of edits) {
		if (edit.timestamp < sinceMs || edit.isError || edit.isVirtual) continue;
		files.add(edit.file);
		adds += edit.adds;
		removes += edit.removes;
	}
	return files.size > 0 ? { files: files.size, adds, removes } : null;
}

/** Virtualized row: finalized history or one of the live streaming rows. */
export type Row =
	| HistoryRow
	| { kind: "streaming"; message: AgentMessage; process?: ProcessRow }
	| { kind: "pending" }
	| { kind: "turnChanges"; since: number; summary: TurnChangeSummary }
	| { kind: "noReply"; since: number }
	| { kind: "queued"; item: RpcQueuedMessage; lane: QueueLane };
function messageKey(message: AgentMessage): string {
	const identity = messageIdentity(message);
	if (identity) return identity;
	const firstTool = messageContent(message).find(block => block.type === "toolCall");
	if (firstTool?.type === "toolCall") return toolEntryKey(firstTool);
	return `${message.role}-${String(message.timestamp ?? "untimed")}`;
}

/** One process preference per assistant message, independent of row-key suffixes. */
export function processExpansionKey(message: AgentMessage): string {
	return `message-${messageKey(message)}`;
}

function transcriptRowBaseKey(row: Row): string {
	switch (row.kind) {
		case "queued":
			return `queued-${row.item.id}`;
		case "message":
			return `message-${messageKey(row.message)}`;
		case "process":
			// Compact mode may replace one live assistant row with a process row,
			// or split it into process + answer rows. Key the first finalized row
			// by the same assistant identity so the viewport anchor survives both.
			return processExpansionKey(row.messages[0]!);
		case "readGroup":
			return `read-${row.entries.map(entry => entry.toolKey).join("-")}`;
		case "subagent":
			return row.reuse ? `subagent-${row.id}-reuse-${row.reuse}` : `subagent-${row.id}`;
		case "streaming":
			// message_start and message_end carry the same assistant identity.
			// Reusing it prevents the virtualizer from replacing one huge measured
			// streaming row with a fresh 72px estimate, briefly clamping scrollTop
			// to the end before the finalized row is measured.
			return processExpansionKey(row.process?.messages[0] ?? row.message);
		case "pending":
			return row.kind;
		case "turnChanges":
			return `turn-changes-${row.since}`;
		case "noReply":
			return `no-reply-${row.since}`;
	}
}

export function buildTranscriptRowKeys(rows: readonly Row[]): string[] {
	const occurrences = new Map<string, number>();
	return rows.map(row => {
		const base = transcriptRowBaseKey(row);
		const occurrence = occurrences.get(base) ?? 0;
		occurrences.set(base, occurrence + 1);
		return occurrence === 0 ? base : `${base}-${occurrence}`;
	});
}

/** One stable minimap anchor per user-authored turn in the rendered row set. */
export function buildConversationAnchors(rows: readonly Row[], rowKeys: readonly string[]): ConversationAnchor[] {
	const anchors: ConversationAnchor[] = [];
	for (const [rowIndex, row] of rows.entries()) {
		if (row.kind !== "message" || row.message.role !== "user") continue;
		anchors.push({
			key: rowKeys[rowIndex] ?? `conversation-${rowIndex}`,
			rowIndex,
			preview: conversationPreview(messageText(row.message)),
			timestamp: row.message.timestamp,
		});
	}
	return anchors;
}

function conversationPreview(text: string): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= CONVERSATION_PREVIEW_LIMIT) return normalized;
	return `${normalized.slice(0, CONVERSATION_PREVIEW_LIMIT - 1).trimEnd()}…`;
}

/** Current user turn at or immediately before the first visible transcript row. */
export function findConversationAnchorIndex(anchors: readonly ConversationAnchor[], visibleRowIndex: number): number {
	if (anchors.length === 0) return -1;
	let low = 0;
	let high = anchors.length - 1;
	let match = 0;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		if (anchors[middle]!.rowIndex <= visibleRowIndex) {
			match = middle;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	return match;
}

/** Stable finalized-row identities used by the virtualizer and regression tests. */
export function buildHistoryRowKeys(rows: readonly HistoryRow[]): string[] {
	return buildTranscriptRowKeys(rows);
}

// These built-in tool argument warnings are instructions for the model, not chat.
const CORE_BUILTIN_STYLE_REMINDER =
	/^<system-reminder reason="rule_violation" rule="[^"\r\n]+" path="[^"\r\n]+">\r?\nBuilt-in style rule matched a pattern in tool-call arguments[^\r\n]*\r?\n[\s\S]*?^<\/system-reminder>[ \t]*\r?$/gm;

function messageContent(message: AgentMessage): MessageContent[] {
	if (Array.isArray(message.content)) return message.content;
	if (typeof message.content === "string") return [{ type: "text", text: message.content }];
	return [];
}

export function transcriptMessageContent(message: AgentMessage): MessageContent[] {
	const content = messageContent(message);
	if (message.role !== "developer" || message.attribution !== "agent") return content;
	return content.flatMap<MessageContent>(block => {
		if (block.type !== "text") return [block];
		const text = block.text.replace(CORE_BUILTIN_STYLE_REMINDER, "");
		if (text === block.text) return [block];
		return text.trim() ? [{ ...block, text: text.trim() }] : [];
	});
}

function splitMessageReaction(message: AgentMessage): { message: AgentMessage; reaction?: string } {
	if (message.role !== "assistant") return { message };
	if (typeof message.content === "string") {
		const split = splitReaction(message.content);
		return split.emoji ? { message: { ...message, content: split.body }, reaction: split.emoji } : { message };
	}
	if (!Array.isArray(message.content)) return { message };
	const index = message.content.findIndex(block => block.type === "text" && block.text.length > 0);
	const block = message.content[index];
	if (block?.type !== "text") return { message };
	const split = splitReaction(block.text);
	if (!split.emoji) return { message };
	const content = message.content.slice();
	content[index] = { ...block, text: split.body };
	return { message: { ...message, content }, reaction: split.emoji };
}

function messageToolIds(message: AgentMessage): string[] {
	return messageContent(message)
		.filter(block => block.type === "toolCall")
		.map(block => toolEntryKey(block));
}

/** A real narration/reasoning block starts a new visual execution phase. */
function hasProcessNarration(message: AgentMessage): boolean {
	return messageContent(message).some(block => {
		if (block.type === "text") return isRenderableMessageText(block.text);
		if (block.type === "thinking") return isRenderableMessageText(block.thinking);
		return false;
	});
}

/** A failed reply whose provider error is its whole body (nothing streamed). */
function isBareError(message: AgentMessage): boolean {
	return (
		message.role === "assistant" &&
		Boolean(message.errorMessage) &&
		!hasProcessNarration(message) &&
		!messageContent(message).some(block => block.type === "toolCall" || block.type === "image")
	);
}

/**
 * Keep zero-height/non-display messages out of the virtualizer. Estimating an
 * invisible toolResult row at 128px was the remaining source of blank bands
 * between cards; its content already lives in the matching ToolCard.
 */
export function isVisibleTranscriptMessage(message: AgentMessage): boolean {
	if (message.role === "toolResult") return false;
	if (isLegacyCompactionCommandMessage(message)) return false;
	if ((message.role === "custom" || message.role === "hookMessage") && message.display === false) return false;
	if (
		message.role === "user" ||
		message.role === "bashExecution" ||
		message.role === "pythonExecution" ||
		message.role === "branchSummary" ||
		message.role === "compactionSummary" ||
		message.role === "fileMention" ||
		message.role === "custom" ||
		message.role === "hookMessage"
	) {
		return true;
	}
	if (message.errorMessage || message.steering) return true;
	return transcriptMessageContent(message).some(block => {
		switch (block.type) {
			case "text":
				return isRenderableMessageText(block.text);
			case "thinking":
				return isRenderableMessageText(block.thinking);
			case "toolCall":
			case "image":
				return true;
		}
		return false;
	});
}

/** Whether the in-flight turn owns a real visible row right now. */
export function hasStreamingTranscriptContent(
	message: AgentMessage | null,
	streamingText: string,
	streamingThinking: string,
	activeTools: ReadonlyMap<string, ToolEntry>,
): boolean {
	if (!message) return false;
	if (isRenderableMessageText(streamingText) || isRenderableMessageText(streamingThinking)) return true;
	if (isVisibleTranscriptMessage(message)) return true;
	const streamStart = messageTimestampMs(message);
	for (const entry of activeTools.values()) {
		if ((entry.status === "pending" || entry.status === "running") && entry.startTime >= streamStart) return true;
	}
	return false;
}

function summarizeProcess(messages: AgentMessage[]): ProcessMeta {
	let thinkingCount = 0;
	let failedEvents = 0;
	let backgroundEvents = 0;
	const toolCallIds: string[] = [];
	const toolNames: string[] = [];
	for (const message of messages) {
		failedEvents += launchCompletionFailureCount(message);
		if (isBackgroundActivity(message)) backgroundEvents++;
		for (const block of messageContent(message)) {
			if (block.type === "thinking" && isRenderableMessageText(block.thinking)) thinkingCount++;
			if (block.type !== "toolCall") continue;
			toolCallIds.push(toolEntryKey(block));
			toolNames.push(block.name);
		}
	}
	return { stepCount: thinkingCount + toolCallIds.length, failedEvents, backgroundEvents, toolCallIds, toolNames };
}

function isBackgroundActivity(message: AgentMessage): boolean {
	return message.customType === "async-notify" || isCompletionMessage(message);
}

// Core persists these stop-time notices as developer messages for the model.
const CORE_TODO_REMINDER =
	/^<system-reminder>\nYou stopped with (\d+) incomplete todo item\(s\):\n([\s\S]+)\n\nPlease continue working on these tasks or mark them complete if finished\.\n\(Reminder (\d+)\/(\d+)\)\n<\/system-reminder>$/;

export function matchTodoReminder(message: AgentMessage): RegExpExecArray | null {
	if (message.role !== "developer" || message.attribution !== "agent") return null;
	const { content } = message;
	if (typeof content === "string") return CORE_TODO_REMINDER.exec(content);
	const block = content?.length === 1 ? content[0] : undefined;
	return block?.type === "text" ? CORE_TODO_REMINDER.exec(block.text) : null;
}

/** Successful structured todo updates already live in the checklist panel. */
function withoutChecklistUpdates(message: AgentMessage, messages: AgentMessage[], index: number): AgentMessage {
	const content = message.content;
	if (!Array.isArray(content) || !content.some(block => block.type === "toolCall" && block.name === "todo")) {
		return message;
	}
	const updates = new Set<string>();
	for (let next = index + 1; next < messages.length; next++) {
		const result = messages[next];
		if (!result || result.role !== "toolResult") break;
		if (
			result.toolName === "todo" && result.toolCallId && !result.isError && todoPhasesFromToolResult(result) !== undefined
		) {
			updates.add(result.toolCallId);
		}
	}
	if (updates.size === 0) return message;
	const remaining = content.filter(block => block.type !== "toolCall" || block.name !== "todo" || !updates.has(block.id));
	// Reasoning for a checklist-only maintenance turn isn't a new workflow step.
	return {
		...message,
		content: remaining.some(block => block.type === "toolCall" || block.type === "image")
			? remaining
			: remaining.filter(block => block.type !== "thinking"),
	};
}

/** Core's successful `write agent://…` receipt, not a guess from model prose or a URL. */
function subagentSendTarget(message: AgentMessage): string | undefined {
	if (message.role !== "toolResult" || message.toolName !== "write" || message.isError) return;
	const send = resultDetails(message)?.message;
	if (!send || typeof send !== "object" || !("op" in send) || send.op !== "send") return;
	if ("to" in send && typeof send.to === "string") return send.to;
}

function subagentNarrationTurns(messages: readonly AgentMessage[]): ReadonlySet<number> {
	const turns = new Set<number>();
	let turn = -1;
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index]!;
		if (message.role === "user" && !message.steering) turn = index;
		if (turns.has(turn)) continue;
		if (
			subagentSendTarget(message) ||
			(message.role === "assistant" &&
				Array.isArray(message.content) &&
				message.content.some(block => block.type === "toolCall" && block.name === "task"))
		) {
			turns.add(turn);
		}
	}
	return turns;
}

/**
 * Build finalized transcript rows. Tool calls fold into one process row per
 * phase in both details. Compact keeps progress with the work except in turns
 * delegating to a subagent, where the public narration explains the handoff.
 * Reasoning never needs its own top-level row in either view.
 */
export function buildHistoryRows(
	messages: AgentMessage[],
	detail: TranscriptDetail,
	preservedProcessStarts?: Pick<ReadonlySet<string>, "has">,
	subagentSpawns?: ReadonlyMap<string, number>,
): HistoryRow[] {
	const rows: HistoryRow[] = [];
	let processMessages: AgentMessage[] = [];
	const pendingReports: AgentMessage[] = [];
	let reactionTargetIndex: number | undefined;
	const narratedTurns = detail === "compact" ? subagentNarrationTurns(messages) : undefined;
	const reusedThisTurn = new Set<string>();
	let turn = -1;
	let turnTime = 0;
	const flushProcess = () => {
		if (processMessages.length > 0) {
			rows.push({ kind: "process", messages: processMessages, ...summarizeProcess(processMessages) });
			processMessages = [];
		}
	};
	const appendWork = (message: AgentMessage) => {
		for (const report of pendingReports) processMessages.push(report);
		pendingReports.length = 0;
		processMessages.push(message);
	};
	const flushReports = () => {
		flushProcess();
		for (const report of pendingReports) rows.push({ kind: "message", message: report });
		pendingReports.length = 0;
	};

	for (let index = 0; index < messages.length; index++) {
		const incoming = messages[index];
		if (!incoming) continue;
		if (incoming.role === "user" && !incoming.steering) {
			turn = index;
			turnTime = messageTimestampMs(incoming);
			reusedThisTurn.clear();
		}
		if (subagentSpawns?.size && incoming.toolCallId) {
			const id = subagentSendTarget(incoming);
			const spawn = id === undefined ? undefined : subagentSpawns.get(id);
			if (id !== undefined && spawn !== undefined && spawn < turnTime && !reusedThisTurn.has(id)) {
				reusedThisTurn.add(id);
				flushReports();
				rows.push({ kind: "subagent", id, timestamp: messageTimestampMs(incoming), reuse: incoming.toolCallId });
			}
		}
		const foldNarration = detail === "compact" && !narratedTurns?.has(turn);
		// Keep an interacted-with live phase separate on finalization and after closing it.
		if (preservedProcessStarts?.has(processExpansionKey(incoming))) flushReports();
		let message =
			detail === "compact" && incoming.role === "assistant" && !incoming.errorMessage && !incoming.steering
				? withoutChecklistUpdates(incoming, messages, index)
				: incoming;
		if (message.role === "assistant") {
			if (reactionTargetIndex !== undefined) {
				const split = splitMessageReaction(message);
				const target = rows[reactionTargetIndex];
				if (split.reaction && target?.kind === "message" && target.message.role === "user") {
					rows[reactionTargetIndex] = { ...target, reaction: split.reaction };
					message = split.message;
				}
			}
			reactionTargetIndex = undefined;
		}
		// toolResult/display:false/empty-filler messages must not split a process
		// run — they are invisible transport records, not transcript boundaries.
		if (!isVisibleTranscriptMessage(message)) continue;
		// A completed model loop can be followed by an automatic continuation. Its
		// reply is public even before the saved developer reminder reaches the GUI.
		const holdReport = foldNarration && message.stopReason !== "stop";
		// Keep background job notifications with the work they report on. A
		// supervised launch retains its own timeline marker in full detail.
		if (
			message.role === "custom" &&
			processMessages.length > 0 &&
			isBackgroundActivity(message) &&
			(detail === "compact" || message.customType !== "launch-completion")
		) {
			// A background completion by itself doesn't make an already delivered answer intermediate.
			if (pendingReports.length > 0) pendingReports.push(message);
			else processMessages.push(message);
			continue;
		}
		if (
			holdReport &&
			message.role === "assistant" &&
			!message.errorMessage &&
			!message.steering &&
			typeof message.content === "string"
		) {
			pendingReports.push(message);
			continue;
		}
		if (message.role !== "assistant" || message.errorMessage || message.steering || !Array.isArray(message.content)) {
			flushReports();
			const reply = rows.at(-1);
			if (
				reply?.kind === "message" &&
				reply.message.role === "assistant" &&
				!reply.message.errorMessage &&
				!reply.message.steering &&
				matchTodoReminder(message)
			) {
				reply.todoReminders ??= [];
				reply.todoReminders.push(message);
				continue;
			}
			// Auto-retry leaves one failed reply per attempt. The same bare error
			// back to back reads as one card with an attempt count, not a stack.
			const previous = rows.at(-1);
			if (
				isBareError(message) &&
				previous?.kind === "message" &&
				isBareError(previous.message) &&
				previous.message.errorMessage === message.errorMessage
			) {
				rows[rows.length - 1] = { kind: "message", message, repeats: (previous.repeats ?? 1) + 1 };
				continue;
			}
			rows.push({ kind: "message", message });
			if (message.role === "user") reactionTargetIndex = rows.length - 1;
			continue;
		}

		const hasToolCall = message.content.some(block => block.type === "toolCall");
		const hasImage = message.content.some(block => block.type === "image");
		if (hasToolCall && !hasImage) {
			// Commands are not the answer: the model's words stay in the transcript
			// and its tool calls fold into one disclosure per phase, so a long run
			// reads as prose with "Ran 9 commands ›" between the paragraphs instead
			// of a wall of shell headers.
			if (foldNarration) {
				appendWork(message);
				continue;
			}
			const prose: AgentMessage = {
				...message,
				content: message.content.filter(b => b.type === "text" && isRenderableMessageText(b.text)),
			};
			// Prose first, then the commands it introduced, so the run reads as the
			// model's paragraph followed by one collapsed activity line.
			if (isVisibleTranscriptMessage(prose)) {
				flushProcess();
				rows.push({ kind: "message", message: prose });
			}
			processMessages.push({ ...message, content: message.content.filter(b => b.type !== "text") });
			continue;
		}

		const thinking = message.content.filter(
			block => block.type === "thinking" && isRenderableMessageText(block.thinking),
		);
		if (thinking.length > 0) {
			const coreMessage: AgentMessage = {
				...message,
				content: message.content.filter(block => block.type !== "thinking"),
			};
			const reasoning = { ...message, content: thinking };
			// A terminal reasoning-only message must not bury an earlier public report.
			const hasCore = isVisibleTranscriptMessage(coreMessage);
			if (!hasCore && message.stopReason === "stop") processMessages.push(reasoning);
			else appendWork(reasoning);
			if (hasCore) {
				if (holdReport && !hasImage) pendingReports.push(coreMessage);
				else {
					flushReports();
					rows.push({ kind: "message", message: coreMessage });
				}
			}
			continue;
		}

		if (holdReport && !hasImage) pendingReports.push(message);
		else {
			flushReports();
			rows.push({ kind: "message", message });
		}
	}
	flushReports();
	return rows;
}

/** A permanent transcript row at the agent's first observed spawn, never at its completion. */
export function mergeSubagentRows(rows: HistoryRow[], agents: ReadonlyMap<string, number>): HistoryRow[] {
	if (agents.size === 0) return rows;
	const ordered = [...agents].sort((a, b) => a[1] - b[1]);
	const out: HistoryRow[] = [];
	let next = 0;
	for (const row of rows) {
		let ts: number | undefined;
		if (row.kind === "message") ts = messageTimestampMs(row.message);
		else if (row.kind === "subagent") ts = row.timestamp;
		else if (row.kind === "process" && row.messages[0]) ts = messageTimestampMs(row.messages[0]);
		else if (row.kind === "readGroup" && row.usage?.[0]?.timestamp !== undefined)
			ts = messageTimestampMs({ role: "assistant", timestamp: row.usage[0].timestamp });
		for (let entry = ordered[next]; ts !== undefined && entry && entry[1] < ts; entry = ordered[++next]) {
			out.push({ kind: "subagent", id: entry[0], timestamp: entry[1] });
		}
		out.push(row);
	}
	for (; next < ordered.length; next++) {
		const [id, timestamp] = ordered[next]!;
		out.push({ kind: "subagent", id, timestamp });
	}
	return out;
}

/**
 * Map finalized history rows onto semantic timeline phases. Punctuation-only
 * continuations share the phase's first marker and timestamp, and tool state is
 * aggregated so a later running/error call still updates that one marker.
 */
export function buildTimelineMarkers(rows: readonly HistoryRow[]): Array<TimelineMarkerSeed | null> {
	const markers: Array<TimelineMarkerSeed | null> = rows.map(() => null);
	let phaseOwner: number | null = null;

	for (let index = 0; index < rows.length; index++) {
		const row = rows[index];
		if (!row) continue;

		if (row.kind === "message" && (row.message.errorMessage || isCompletionMessage(row.message))) {
			phaseOwner = null;
			markers[index] = {
				state: row.message.errorMessage || launchCompletionFailureCount(row.message) > 0 ? "error" : "launch",
				timestamp: row.message.timestamp,
				toolIds: messageToolIds(row.message),
			};
			continue;
		}

		let timestamp: number | string | undefined;
		let toolIds: string[] = [];
		let startsPhase = false;
		let state: TimelineState = "done";
		if (row.kind === "process") {
			timestamp = row.messages[0]?.timestamp;
			toolIds = row.toolCallIds;
			startsPhase = true;
			if (row.failedEvents > 0) state = "error";
		} else if (row.kind === "readGroup") {
			timestamp = row.usage?.[0]?.timestamp;
			toolIds = row.entries.map(entry => entry.toolKey);
		} else if (row.kind === "message") {
			timestamp = row.message.timestamp;
			toolIds = messageToolIds(row.message);
			startsPhase = hasProcessNarration(row.message);
		}

		if (toolIds.length === 0 && row.kind !== "process") {
			phaseOwner = null;
			continue;
		}

		if (phaseOwner === null || startsPhase) {
			phaseOwner = index;
			markers[index] = { state, timestamp, toolIds: [...toolIds] };
			continue;
		}

		const owner = markers[phaseOwner];
		if (!owner) continue;
		owner.toolIds.push(...toolIds);
		owner.timestamp ??= timestamp;
	}

	return markers;
}

/**
 * Whether a tab that is still starting has a transcript on its way. A tab
 * spawned onto (or about to switch to) a session file must wait for that
 * history; a fresh tab has nothing to load, so its start screen can show while
 * the sidecar boots instead of a spinner on a blank page.
 */
export function tabAwaitsTranscript(tab: { sessionPath?: string; pendingSessionPath?: string } | undefined): boolean {
	return !tab || Boolean(tab.sessionPath || tab.pendingSessionPath);
}
