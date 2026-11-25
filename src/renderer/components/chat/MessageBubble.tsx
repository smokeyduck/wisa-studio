import {
	Archive,
	Bell,
	Bot,
	Check,
	CircleAlert,
	Copy,
	CornerDownRight,
	FileText,
	GitBranch,
	Pencil,
	RotateCw,
	Square,
	Terminal,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useId, useLayoutEffect, useRef, useState } from "react";
import { languageDetails } from "../../../shared/languages";
import type { AgentMessage, ImageContent, MessageContent, ToolCallContent } from "../../../shared/rpc-types";
import { OutputText } from "../../lib/ansi";
import { splitAttachmentMentions } from "../../lib/attachment-mentions";
import { describeProviderError, isCyberPolicyError } from "../../lib/errors";
import { copyText, cx, formatClock, formatTokens } from "../../lib/format";
import { useLang, useT } from "../../lib/i18n";
import { MarkdownRenderer } from "../../lib/markdown";
import { editFromMessage, forkSessionFromMessageInNewTab, isRenderableMessageText } from "../../lib/messages";
import { extractModelMentions, type ModelMentionChip } from "../../lib/model-mentions";
import { approvedPlanInMessage } from "../../lib/plan-tool";
import { PREVIEW_SCROLL_LG } from "../../lib/preview";
import { useTabRpc } from "../../lib/tab-rpc";
import { useMessagesStore } from "../../stores/messages";
import { useSessionStore } from "../../stores/session";
import { useRuntimeTabId } from "../../stores/session-runtime-context";
import { toast } from "../../stores/toast";
import { toolEntryKey } from "../../stores/tools";
import { useUiStore } from "../../stores/ui";
import { FileAttachmentCard } from "../common/FileAttachmentCard";
import { ZoomableImage } from "../common/ImageViewer";
import { TechnicalDetails } from "../common/TechnicalDetails";
import { type RunningIndicator, ToolCard } from "../tools/ToolCard";
import { CustomMessageCard, isCustomMessageCardType } from "./CustomMessageCard";
import { matchTodoReminder } from "./chat-stream-utils";
import { ThinkingBlock } from "./ThinkingBlock";
import { useReadOnlyTranscript } from "./transcript-mode";
import { UsageRow } from "./UsageRow";

export interface MessageBubbleProps {
	message: AgentMessage;
	/** Suppress per-message footer/padding inside an expanded Process group. */
	compact?: boolean;
	/** The timeline or process group can own the one animated running state. */
	runningIndicator?: RunningIndicator;
	/** Opening assistant emoji projected onto this user turn. */
	reaction?: string;
	/** Identical failed replies collapsed into this one (auto-retry attempts). */
	repeats?: number;
	todoReminders?: AgentMessage[];
	rowKey?: string;
	userTextExpanded?: boolean;
	onUserTextExpandedChange?: (rowKey: string, expanded: boolean) => void;
}

const COMPACTION_METHOD_KEYS: Record<string, string> = {
	remote: "chat.context.compactionMethod.remote",
	soft: "chat.context.compactionMethod.soft",
	handoff: "chat.context.compactionMethod.handoff",
	snapcompact: "chat.context.compactionMethod.snapcompact",
	shake: "chat.context.compactionMethod.shake",
};

// Core persists this diagnostic as prose, with grouping from its own locale.
// Match only its complete template; preserve other summaries as authored.
const SNAPCOMPACT_ARCHIVE_SUMMARY =
	/^Archived (\p{Decimal_Number}+(?:[.,\p{Zs}٬’']\p{Decimal_Number}+)*) chars of history onto (\d+) snapcompact frames?(?: \(\+(\p{Decimal_Number}+(?:[.,\p{Zs}٬’']\p{Decimal_Number}+)*) chars as text\))?$/u;

function formatArchiveCount(value: string, locale: string): string {
	const count = Number(value.replace(/[.,\p{Zs}٬’']/gu, ""));
	return Number.isSafeInteger(count) ? count.toLocaleString(locale) : value;
}

function InlineImage({ image }: { image: ImageContent }) {
	const t = useT();
	const src = `data:${image.mimeType};base64,${image.data}`;
	return (
		<ZoomableImage
			src={src}
			alt={t("chat.attachedImage")}
			onOpen={() => useUiStore.getState().openImagePreview(src, t("chat.attachedImage"))}
			className="my-1 max-h-48 max-w-64 rounded-md border border-[var(--omp-border-muted)] object-contain"
		/>
	);
}

/**
 * A reply the provider failed. The latest one, once the agent has settled,
 * offers Retry (the agent's own /retry, which knows what the failed turn was);
 * older ones are history and only say what went wrong.
 */
/** The agent's text for a plain user abort, which adds nothing to "Stopped". */
const GENERIC_ABORT_RE = /^(?:Request was aborted\.?|Stopped before model call)?$/;

function MessageError({ message, repeats = 1 }: { message: AgentMessage; repeats?: number }) {
	const t = useT();
	const rpc = useTabRpc();
	const [retrying, setRetrying] = useState(false);
	const readOnly = useReadOnlyTranscript();
	const isLatest = useMessagesStore(s => (s.liveMessages.at(-1) ?? s.messages.at(-1)) === message);
	const idle = useSessionStore(s => !s.isStreaming && s.retryInfo === null && s.status === "ready");
	const stillTrying = useSessionStore(s => s.isStreaming || s.retryInfo !== null) && isLatest && !readOnly;
	const retry = async () => {
		setRetrying(true);
		try {
			const response = await rpc.retry();
			if (!response.success) throw new Error(response.error);
			if (!(response.data as { retried?: boolean } | undefined)?.retried) {
				toast({ variant: "warning", title: t("palette.retryNothing"), message: t("palette.retryNothingDesc") });
			}
		} catch (cause) {
			toast({ variant: "error", title: t("chat.error.retryFailed"), message: String(cause) });
		} finally {
			setRetrying(false);
		}
	};
	const policyBlocked = isCyberPolicyError(message.errorMessage);
	const retryButton = !policyBlocked && !readOnly && isLatest && idle && (
		<button
			type="button"
			disabled={retrying}
			onClick={() => void retry()}
			className="omp-pressable -my-0.5 flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[var(--omp-border)] px-2.5 text-omp-sm font-medium text-[var(--omp-text)] hover:bg-[var(--omp-selected-bg)] disabled:opacity-50"
		>
			<RotateCw aria-hidden size={12} className={cx(retrying && "animate-spin")} />
			{t("common.retry")}
		</button>
	);
	// A reply the user stopped is not a failure: a quiet note, with the abort
	// reason only when it says more than that the request was aborted.
	if (message.stopReason === "aborted") {
		const reason = GENERIC_ABORT_RE.test(message.errorMessage ?? "") ? null : message.errorMessage;
		return (
			<div className="omp-message-stopped mt-2 flex min-w-0 items-center gap-2 text-omp-sm text-[var(--omp-dim)]">
				<Square aria-hidden size={10} className="shrink-0 fill-current" />
				<span className="min-w-0 truncate" title={reason ?? undefined}>
					{t("chat.stopped")}
					{reason && <span className="text-[var(--omp-muted)]"> - {describeProviderError(reason)}</span>}
				</span>
				{retryButton}
			</div>
		);
	}
	const described = describeProviderError(message.errorMessage);
	return (
		<div
			role={stillTrying ? "status" : "alert"}
			className={cx(
				"omp-message-error mt-2 flex min-w-0 items-start gap-3 rounded-xl border px-3.5 py-2.5",
				stillTrying && "omp-message-error-retrying",
			)}
		>
			<CircleAlert
				aria-hidden
				size={15}
				className={cx("mt-0.5 shrink-0", stillTrying ? "text-[var(--omp-warning)]" : "text-[var(--omp-error)]")}
			/>
			<div className="min-w-0 flex-1">
				<p className="text-omp-md font-medium text-[var(--omp-text)]">
					{policyBlocked
						? t("chat.error.cyberPolicyTitle")
						: stillTrying
							? t("chat.error.retryingTitle")
							: t("chat.error.title")}
					{repeats > 1 && (
						<span className="ml-2 text-omp-sm font-normal tabular-nums text-[var(--omp-dim)]">
							{t("chat.error.repeats", { count: repeats })}
						</span>
					)}
				</p>
				<p className="mt-0.5 break-words text-omp-sm text-[var(--omp-muted)]">{described}</p>
				{policyBlocked && (
					<a
						className="mt-1 inline-block text-omp-sm text-(--omp-link) hover:underline"
						href="https://learn.chatgpt.com/docs/cyber-safety#false-positives"
						rel="noreferrer"
						target="_blank"
					>
						{t("chat.error.cyberPolicyHelp")}
					</a>
				)}
				<TechnicalDetails className="mt-1" raw={message.errorMessage} shown={described} />
			</div>
			{retryButton}
		</div>
	);
}

/** ToolCard subscribes to the tools store itself, so the tool result lands inline. */
function ToolCardWithResult({ call, runningIndicator }: { call: ToolCallContent; runningIndicator: RunningIndicator }) {
	return (
		<ToolCard
			toolCallId={toolEntryKey(call)}
			toolName={call.name}
			args={call.arguments}
			runningIndicator={runningIndicator}
		/>
	);
}

const FILE_PREVIEW_CHARS = 12_000;

function ExecutionBubble({ message }: { message: AgentMessage }) {
	const t = useT();
	const rpc = useTabRpc();
	// Local placeholder appended by the composer while an `$` eval is in flight
	// (InputArea): offers abortEval; the hydrated transcript record replaces it
	// on completion, mirroring the bash flow.
	const running = message.running === true;
	const [abortSent, setAbortSent] = useState(false);
	const readOnly = useReadOnlyTranscript();
	const python = message.role === "pythonExecution";
	const input = python ? message.code : message.command;
	const status = running
		? t("chat.exec.running")
		: message.cancelled
			? t("chat.exec.cancelled")
			: message.exitCode == null
				? t("chat.exec.finished")
				: t("chat.exec.exit", { code: message.exitCode });
	const failed = !running && (message.cancelled || (message.exitCode != null && message.exitCode !== 0));

	return (
		<div className="omp-execution-turn px-6 py-4">
			<div className="omp-transcript-content overflow-hidden rounded-[10px] border border-[var(--omp-border-muted)] bg-[var(--omp-code-bg)] shadow-[var(--omp-shadow-sm)]">
				<div className="flex items-center gap-2 border-b border-[var(--omp-border-muted)] px-3.5 py-2">
					<Terminal className="text-[var(--omp-status-path)]" size={13} />
					<span className="text-omp-sm font-semibold text-[var(--omp-text)]">
						{python ? t("chat.exec.python") : t("chat.exec.shell")}
					</span>
					<span
						className="ml-auto rounded-full px-2 py-0.5 font-mono text-omp-xxs font-medium tracking-wide"
						style={{
							background: running
								? "var(--omp-info-dim)"
								: failed
									? "var(--omp-error-dim)"
									: "var(--omp-success-dim)",
							color: running ? "var(--omp-info)" : failed ? "var(--omp-error)" : "var(--omp-success)",
						}}
					>
						{status}
					</span>
					{running && !readOnly && (
						<button
							type="button"
							disabled={abortSent}
							title={t("common.cancel")}
							onClick={() => {
								setAbortSent(true);
								void rpc.abortEval();
							}}
							className="omp-pressable flex items-center rounded-full px-2 py-0.5 text-omp-xxs font-medium tracking-wide text-[var(--omp-error)] hover:bg-[var(--omp-error-dim)] disabled:opacity-50"
						>
							{t("common.cancel")}
						</button>
					)}
				</div>
				{input && (
					<pre className="border-b border-[var(--omp-border-muted)] px-3.5 py-2.5 font-mono text-omp-sm leading-[1.6] break-words whitespace-pre-wrap text-[var(--omp-status-path)]">
						{python ? input : `$ ${input}`}
					</pre>
				)}
				{!running && (
					<pre
						className={cx(
							"px-3.5 py-2.5 font-mono text-omp-sm leading-[1.6] break-words whitespace-pre-wrap text-[var(--omp-tool-output)]",
							PREVIEW_SCROLL_LG,
						)}
					>
						{message.output ? <OutputText text={message.output} /> : t("chat.exec.noOutput")}
						{message.truncated ? `\n${t("chat.exec.truncated")}` : ""}
					</pre>
				)}
			</div>
		</div>
	);
}

function ContextBubble({ message }: { message: AgentMessage }) {
	const t = useT();
	const { lang } = useLang();
	const [expanded, setExpanded] = useState(false);
	const isFiles = message.role === "fileMention";
	const compactionMethodKey = message.method ? COMPACTION_METHOD_KEYS[message.method] : undefined;
	const compactionMethod = message.method
		? compactionMethodKey
			? t(compactionMethodKey)
			: message.method
		: undefined;
	const label =
		message.role === "compactionSummary"
			? compactionMethod && message.tokensBefore !== undefined && message.tokensAfter !== undefined
				? t("chat.context.compactedByFromTo", {
						method: compactionMethod,
						before: formatTokens(message.tokensBefore),
						after: formatTokens(message.tokensAfter),
					})
				: compactionMethod
					? t("chat.context.compactedBy", { method: compactionMethod })
					: message.tokensBefore
						? t("chat.context.compactedFrom", { tokens: message.tokensBefore.toLocaleString() })
						: t("chat.context.compacted")
			: message.role === "branchSummary"
				? t("chat.context.branchSummary")
				: t("chat.context.referencedFiles");
	const { shortSummary } = message;
	const archive =
		message.role === "compactionSummary" && message.method === "snapcompact" && shortSummary
			? SNAPCOMPACT_ARCHIVE_SUMMARY.exec(shortSummary)
			: null;
	let archiveSummary: string | undefined;
	if (archive) {
		const [, chars, frames, textChars] = archive;
		const { locale } = languageDetails(lang);
		const counts = { chars: formatArchiveCount(chars, locale), frames: formatArchiveCount(frames, locale) };
		archiveSummary = textChars
			? t("chat.context.snapcompactArchiveWithText", { ...counts, textChars: formatArchiveCount(textChars, locale) })
			: t("chat.context.snapcompactArchive", counts);
	}

	return (
		<div className="omp-context-turn px-6 py-3">
			<div className="omp-transcript-content rounded-[10px] border border-[var(--omp-border-muted)] px-3.5 py-3">
				<div className="mb-2 flex items-center gap-1.5 text-omp-xs font-semibold text-[var(--omp-status-context)]">
					{isFiles ? <FileText size={12} /> : <Archive size={12} />}
					{label}
				</div>
				{isFiles ? (
					<div className="space-y-1.5">
						{(message.files ?? []).map(file => (
							<details
								className="overflow-hidden rounded-lg border border-[var(--omp-border-muted)] bg-[var(--omp-code-bg)]"
								key={file.path}
							>
								<summary className="cursor-pointer px-3 py-2 font-mono text-omp-sm text-[var(--omp-status-path)]">
									{file.path}
									{file.skippedReason ? ` - ${file.skippedReason}` : ""}
								</summary>
								<pre
									className={cx(
										"border-t border-[var(--omp-border-muted)] px-3 py-2.5 font-mono text-omp-xs leading-[1.6] break-words whitespace-pre-wrap text-[var(--omp-tool-output)]",
										PREVIEW_SCROLL_LG,
									)}
								>
									{file.content.slice(0, FILE_PREVIEW_CHARS)}
									{file.content.length > FILE_PREVIEW_CHARS ? `\n${t("chat.context.previewTruncated")}` : ""}
								</pre>
							</details>
						))}
					</div>
				) : (
					<>
						{shortSummary && <MarkdownRenderer content={archiveSummary ?? shortSummary} />}
						{typeof message.warning === "string" && (
							<p role="status" className="text-omp-md text-(--omp-warning)">
								{message.warning}
							</p>
						)}
						<details onToggle={event => setExpanded(event.currentTarget.open)}>
							<summary className="cursor-pointer py-2 text-omp-md text-(--omp-muted)">
								{t("chat.context.details")}
							</summary>
							{expanded && (
								<div className={PREVIEW_SCROLL_LG}>
									<MarkdownRenderer content={message.summary ?? ""} />
								</div>
							)}
						</details>
					</>
				)}
			</div>
		</div>
	);
}

function UserMessageText({
	children,
	assignment,
	expanded: controlledExpanded,
	onExpandedChange,
}: {
	children: ReactNode;
	assignment: boolean;
	expanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
}) {
	const t = useT();
	const id = useId();
	const viewport = useRef<HTMLDivElement>(null);
	const body = useRef<HTMLDivElement>(null);
	const [localExpanded, setLocalExpanded] = useState(false);
	const expanded = controlledExpanded ?? localExpanded;
	const setExpanded = onExpandedChange ?? setLocalExpanded;
	const [overflows, setOverflows] = useState(false);
	const lines = assignment ? 3 : 8;
	useLayoutEffect(() => {
		const clip = viewport.current;
		const content = body.current;
		if (!clip || !content || typeof window.getComputedStyle !== "function") return;
		const measure = () => {
			const limit = Number.parseFloat(window.getComputedStyle(clip).lineHeight) * lines;
			setOverflows(content.offsetHeight > limit + 1);
		};
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(clip);
		observer.observe(content);
		return () => observer.disconnect();
	}, [lines]);
	return (
		<>
			<div
				className={cx(
					"text-omp-xl leading-[1.55]",
					!expanded && "overflow-clip",
					!expanded && overflows && "omp-user-text-cut",
				)}
				id={id}
				onFocusCapture={event => {
					if (expanded || !overflows) return;
					if (event.target.getBoundingClientRect().bottom > event.currentTarget.getBoundingClientRect().bottom) {
						setExpanded(true);
					}
				}}
				ref={viewport}
				style={expanded ? undefined : { maxHeight: `${lines}lh` }}
			>
				<div className="flow-root" ref={body}>
					{children}
				</div>
			</div>
			{overflows && (
				<button
					aria-controls={id}
					aria-expanded={expanded}
					className="omp-pressable mt-1 text-omp-sm font-medium text-[var(--omp-link)] hover:underline"
					onClick={() => setExpanded(!expanded)}
					type="button"
				>
					{assignment
						? t(expanded ? "agents.page.showLess" : "agents.page.showAll")
						: t(expanded ? "chat.userMessage.collapse" : "chat.userMessage.expand")}
				</button>
			)}
		</>
	);
}

function TodoReminderCard({ reminder, actions }: { reminder: RegExpExecArray; actions?: ReactNode }) {
	const t = useT();
	const [, count, tasks, attempt, maxAttempts] = reminder;
	return (
		<div className="flex min-w-0 items-start gap-2 rounded-lg border border-(--omp-border-muted) px-2.5 py-1.5 text-omp-sm">
			<Bell aria-hidden="true" className="mt-0.5 shrink-0 text-(--omp-warning)" size={13} />
			<div className="min-w-0 flex-1">
				<p className="font-medium text-(--omp-text)">{t("todoPanel.reminderCount", { count: Number(count) })}</p>
				<div className="whitespace-pre-wrap wrap-anywhere text-(--omp-text-secondary)">{tasks}</div>
				<p className="text-(--omp-muted)">{t("chat.todoReminder.instruction")}</p>
				<div className="flex flex-wrap items-center justify-between gap-x-2">
					<p className="text-omp-xs text-(--omp-dim)">
						{t("chat.todoReminder.attempt", { attempt: Number(attempt), maxAttempts: Number(maxAttempts) })}
					</p>
					{actions}
				</div>
			</div>
		</div>
	);
}

/**
 * One finalized message. User messages sit right-aligned; assistant messages
 * render text, thinking, images, and tool cards. Standalone toolResult messages
 * are folded into their matching card through the tools store.
 */
export const MessageBubble = memo(function MessageBubble({
	message,
	compact = false,
	reaction,
	repeats,
	runningIndicator = "spinner",
	todoReminders,
	rowKey,
	userTextExpanded,
	onUserTextExpandedChange,
}: MessageBubbleProps) {
	const t = useT();
	const rpc = useTabRpc();
	const tabId = useRuntimeTabId();
	const [copied, setCopied] = useState(false);
	const [branching, setBranching] = useState(false);
	const switchPending = useSessionStore(state => state.switchPending !== null);
	const isStreaming = useSessionStore(state => state.isStreaming);
	// A subagent page: copy stays, edit and branch would act on the main session.
	const readOnly = useReadOnlyTranscript();
	if (message.role === "bashExecution" || message.role === "pythonExecution") {
		return <ExecutionBubble message={message} />;
	}
	if (message.role === "branchSummary" || message.role === "compactionSummary" || message.role === "fileMention") {
		return <ContextBubble message={message} />;
	}
	if (message.role === "custom" || message.role === "hookMessage") {
		if (message.display === false) return null;
		// Dedicated cards for the TUI customType set; unknown types fall through
		// to the generic label + content bubble below.
		if (isCustomMessageCardType(message.customType)) {
			return <CustomMessageCard inProcess={compact} message={message} />;
		}
	}
	if (message.role === "toolResult") return null;

	const content: MessageContent[] = Array.isArray(message.content)
		? message.content
		: typeof message.content === "string"
			? [{ type: "text", text: message.content }]
			: [];
	const reminder = matchTodoReminder(message);
	if (reminder) {
		return (
			<div className="omp-assistant-turn--compact px-6 py-1">
				<TodoReminderCard reminder={reminder} />
			</div>
		);
	}
	const isUser = message.role === "user";
	const approvedPlan = approvedPlanInMessage(message);
	const isAssistant = message.role === "assistant";
	const isSteering = Boolean(message.steering);
	const timestamp = formatClock(message.timestamp);
	// User delegations (`^provider/model`, persisted as <model …/> tags) render
	// as atomic chips; the raw tags/selectors are stripped from the body text.
	// Computed inline (no hook) because this component early-returns above.
	const userMentions = (() => {
		if (!isUser || approvedPlan) return { chips: [] as ModelMentionChip[], files: [] as string[], blocks: content };
		const chips: ModelMentionChip[] = [];
		const files = new Set<string>();
		const blocks = content.map(block => {
			if (block.type !== "text") return block;
			const extracted = extractModelMentions(block.text);
			const attachments = splitAttachmentMentions(extracted.body);
			chips.push(...extracted.chips);
			for (const path of attachments.paths) files.add(path);
			return { ...block, text: attachments.body };
		});
		return { chips, files: [...files], blocks };
	})();
	const customLabel =
		message.role === "custom" || message.role === "hookMessage"
			? (message.customType ?? t("chat.extensionMessage"))
			: null;

	const handleCopy = () => {
		const text = content
			.filter((block): block is Extract<MessageContent, { type: "text" }> => block.type === "text")
			.map(block => block.text)
			.join("\n\n");
		void copyText(text).then(ok => {
			if (!ok) return;
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1400);
		});
	};

	const handleBranch = async () => {
		if (branching || switchPending) return;
		setBranching(true);
		try {
			const result = await forkSessionFromMessageInNewTab(message, rpc, tabId);
			if (result === "saved") toast({ variant: "warning", message: t("chat.branchSaved") });
		} catch (cause) {
			toast({ variant: "error", title: t("sessionTree.forkFailed"), message: String(cause) });
		} finally {
			setBranching(false);
		}
	};

	const handleEdit = async () => {
		if (branching || switchPending) return;
		setBranching(true);
		try {
			const result = await editFromMessage(message, rpc, tabId);
			if (result === "cancelled") toast({ variant: "info", message: t("branchPicker.cancelled") });
		} catch (cause) {
			toast({ variant: "error", title: t("branchPicker.failed"), message: String(cause) });
		} finally {
			setBranching(false);
		}
	};

	if (isUser) {
		const userImages = userMentions.blocks.filter((block): block is ImageContent => block.type === "image");
		const userBlocks = approvedPlan
			? []
			: userMentions.blocks.map((block, i) => {
					if (block.type === "text" && isRenderableMessageText(block.text)) {
						return (
							<div key={i} className="text-omp-xl leading-[1.6] text-[var(--omp-text)]">
								<MarkdownRenderer content={block.text} singleDollarTextMath={false} />
							</div>
						);
					}
					return null;
				});
		return (
			<div className="omp-user-turn group flex flex-col items-end px-6 py-2.5">
				{readOnly && (
					<div className="omp-assignment-from mb-1.5 flex min-w-0 max-w-full items-center gap-1 text-omp-xs text-[var(--omp-dim)]">
						<CornerDownRight aria-hidden className="shrink-0" size={12} />
						<span className="truncate">{readOnly.authorLabel}</span>
					</div>
				)}
				<div
					className="omp-transcript-content omp-user-bubble relative rounded-xl border border-[var(--omp-user-msg-border)] bg-[var(--omp-user-msg-bg)] px-3.5 py-3"
					style={{ boxShadow: "var(--omp-shadow-sm)" }}
				>
					{reaction ? (
						<span
							aria-label={reaction}
							className="absolute -top-2 right-3 z-10 flex h-7 min-w-7 items-center justify-center rounded-full border border-[var(--omp-border)] bg-[var(--omp-bg-elevated)] px-1 text-omp-lg shadow-[var(--omp-shadow-sm)]"
							role="img"
						>
							{reaction}
						</span>
					) : null}
					<div className="omp-user-bubble-layout">
						<span className="omp-user-bubble-author">{readOnly ? readOnly.authorLabel : t("live.you")}</span>
						<div className="omp-user-bubble-content">
							{isSteering && (
								<div className="mb-1.5 flex items-center gap-1.5 text-omp-xs font-semibold text-[var(--omp-custom-msg-label)]">
									<span className="h-1 w-1 rounded-full bg-current" />
									{t("chat.steering")}
								</div>
							)}
							{userMentions.chips.length > 0 && (
								<div className="mb-1.5 flex flex-wrap items-center gap-1.5">
									{userMentions.chips.map((chip, chipIndex) => (
										<span
											key={chipIndex}
											title={t("chat.delegatedTo", {
												name: chip.name ?? chip.selector ?? (chip.agent ? `@${chip.agent}` : ""),
											})}
											className="inline-flex items-center gap-1 rounded-full border border-[var(--omp-border-muted)] bg-[var(--omp-selected-bg)] px-2 py-0.5 font-mono text-omp-xxs font-medium text-[var(--omp-accent)]"
										>
											<Bot size={10} />
											{chip.name ?? chip.selector ?? (chip.agent ? `@${chip.agent}` : "")}
										</span>
									))}
								</div>
							)}
							{(userMentions.files.length > 0 || userImages.length > 0) && (
								<div className="mb-1.5 flex flex-wrap items-start gap-2" data-message-attachments>
									{userMentions.files.map(path => (
										<FileAttachmentCard key={path} path={path} />
									))}
									{userImages.map((image, index) => (
										<InlineImage key={index} image={image} />
									))}
								</div>
							)}
							{approvedPlan && (
								<div className="space-y-2 text-omp-sm">
									<div className="flex items-center gap-2 font-semibold">
										<Check aria-hidden className="shrink-0 text-(--omp-success)" size={16} />
										{t("chat.approvedPlan")}
									</div>
									<code className="block wrap-anywhere text-omp-xs text-(--omp-muted)">
										{approvedPlan.path}
									</code>
									{approvedPlan.markdown && (
										<details>
											<summary className="cursor-pointer">{t("chat.approvedPlanDetails")}</summary>
											<MarkdownRenderer content={approvedPlan.markdown} />
										</details>
									)}
								</div>
							)}
							{userBlocks.some(Boolean) && (
								<UserMessageText
									assignment={readOnly !== null}
									expanded={userTextExpanded}
									onExpandedChange={
										rowKey && onUserTextExpandedChange
											? expanded => onUserTextExpandedChange(rowKey, expanded)
											: undefined
									}
								>
									{userBlocks}
								</UserMessageText>
							)}
						</div>
					</div>
				</div>
				<div className="omp-user-bubble-actions flex items-center gap-0.5 text-omp-xs tabular-nums text-[var(--omp-dim)]">
					{timestamp && <span className="me-1 font-mono">{timestamp}</span>}
					<button
						type="button"
						onClick={handleCopy}
						title={t("chat.copyMessage")}
						className="omp-pressable flex h-6 w-6 items-center justify-center rounded-md text-[var(--omp-dim)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)]"
					>
						{copied ? <Check size={13} className="text-[var(--omp-success)]" /> : <Copy size={13} />}
					</button>
					{!isSteering && !readOnly && (
						<button
							type="button"
							onClick={() => void handleEdit()}
							disabled={branching || switchPending || isStreaming}
							aria-label={t("chat.editFromHere")}
							title={t(isStreaming ? "chat.editFromHereBusy" : "chat.editFromHere")}
							className="omp-pressable flex h-6 w-6 items-center justify-center rounded-md text-[var(--omp-dim)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)] disabled:cursor-not-allowed disabled:opacity-50"
						>
							<Pencil size={13} />
						</button>
					)}
					{!readOnly && (
						<button
							type="button"
							onClick={() => void handleBranch()}
							disabled={branching || switchPending}
							aria-label={t("chat.branchFromHere")}
							title={t("chat.branchFromHere")}
							className="omp-pressable flex h-6 w-6 items-center justify-center rounded-md text-[var(--omp-dim)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)] disabled:cursor-wait disabled:opacity-50"
						>
							<GitBranch size={13} />
						</button>
					)}
				</div>
			</div>
		);
	}

	// Assistant / system: render block by block.
	const blocks: ReactNode[] = [];
	let sawNonToolBlock = false;
	// Stays true only while the message's whole visible payload is reasoning:
	// full-density transcripts render such a step as its own row between two
	// step chips, so its chrome tightens to keep the run reading as one stack.
	let thinkingOnly = true;
	let thinking: string[] = [];
	const flushThinking = () => {
		if (thinking.length === 0) return;
		blocks.push(<ThinkingBlock key={blocks.length} text={thinking.join("\n\n")} />);
		thinking = [];
		sawNonToolBlock = true;
	};
	for (const block of content) {
		if (block.type === "thinking") {
			if (isRenderableMessageText(block.thinking)) thinking.push(block.thinking);
			continue;
		}
		if (block.type === "text" && !isRenderableMessageText(block.text)) continue;
		flushThinking();
		switch (block.type) {
			case "text": {
				blocks.push(<MarkdownRenderer key={blocks.length} content={block.text} />);
				sawNonToolBlock = true;
				thinkingOnly = false;
				break;
			}
			case "toolCall": {
				blocks.push(
					<ToolCardWithResult key={toolEntryKey(block)} call={block} runningIndicator={runningIndicator} />,
				);
				thinkingOnly = false;
				break;
			}
			case "image": {
				blocks.push(<InlineImage key={blocks.length} image={block} />);
				sawNonToolBlock = true;
				thinkingOnly = false;
				break;
			}
		}
	}
	flushThinking();

	if (blocks.length === 0 && !message.errorMessage && !customLabel && !isSteering) return null;

	// Tool-only messages and messages nested inside an expanded Process group
	// don't need the 28px hover footer plus py-3 padding. Tool-only copy would
	// be empty; the Process disclosure owns the grouped chrome and branch point.
	const compactChrome = compact || (!sawNonToolBlock && !message.errorMessage && !customLabel && !isSteering);
	const reminders = todoReminders?.flatMap(notice => {
		const reminder = matchTodoReminder(notice);
		return reminder ? [{ key: notice.entryId, reminder }] : [];
	});
	const hasReminders = Boolean(reminders?.length);
	// A lone reasoning disclosure keeps the hover footer (copy / branch still
	// apply to the step) but gets tight, symmetric chrome so the chips above
	// and below sit one line away instead of 20/45px away (see components.css).
	const reasoningOnly =
		!compact &&
		!compactChrome &&
		thinkingOnly &&
		blocks.length > 0 &&
		!hasReminders &&
		!customLabel &&
		!isSteering &&
		!message.errorMessage &&
		message.stopReason !== "aborted";
	const actions = !compactChrome && (
		<div className="omp-message-actions mt-1 flex h-6 items-center gap-1 text-omp-xs tabular-nums text-[var(--omp-dim)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
			{timestamp && <span className="me-1 font-mono">{timestamp}</span>}
			<button
				type="button"
				onClick={handleCopy}
				title={t("chat.copyMessage")}
				className="omp-pressable flex h-6 w-6 items-center justify-center rounded-md text-[var(--omp-dim)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)]"
			>
				{copied ? <Check size={13} className="text-[var(--omp-success)]" /> : <Copy size={13} />}
			</button>
			{isAssistant && !readOnly && (
				<button
					type="button"
					onClick={() => void handleBranch()}
					disabled={branching || switchPending}
					aria-label={t("chat.branchFromHere")}
					title={t("chat.branchFromHere")}
					className="omp-pressable flex h-6 w-6 items-center justify-center rounded-md text-[var(--omp-dim)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)] disabled:cursor-wait disabled:opacity-50"
				>
					<GitBranch size={13} />
				</button>
			)}
		</div>
	);

	return (
		<div
			className={cx(
				"group flex px-6",
				reasoningOnly && "omp-assistant-turn--reasoning",
				!compactChrome && "omp-assistant-turn",
				compactChrome && "omp-assistant-turn--compact",
				compactChrome ? "py-1" : "py-2",
			)}
		>
			<div className="omp-transcript-content min-w-0">
				{customLabel && (
					<div className="mb-2 text-omp-sm font-semibold text-[var(--omp-status-context)]">{customLabel}</div>
				)}
				{isSteering && (
					<div className="mb-2 flex items-center gap-1.5 text-omp-sm font-semibold text-[var(--omp-custom-msg-label)]">
						<span className="h-1.5 w-1.5 rounded-full bg-current" />
						{t("chat.steeringResponse")}
					</div>
				)}
				{blocks}
				{(message.errorMessage || (message.role === "assistant" && message.stopReason === "aborted")) && (
					<MessageError message={message} repeats={repeats} />
				)}
				<UsageRow message={message} />
				{reminders?.map(({ key, reminder }, index) => (
					<TodoReminderCard
						actions={index === reminders.length - 1 ? actions : undefined}
						key={key ?? index}
						reminder={reminder}
					/>
				))}
				{!hasReminders && actions}
			</div>
		</div>
	);
});
