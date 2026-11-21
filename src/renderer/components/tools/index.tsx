import type { ComponentType } from "react";
import { resultText, sanitizeToolText } from "../../lib/format";
import {
	isSoleToolCommand,
	type ToolCommandDispatch,
	toolCommandDispatches,
	toolCommandInnerResult,
	toolCommandLabel,
} from "../../lib/tool-commands";
import { decodeXdevPayload, xdevDispatch, xdevInnerResult, xdevWriteTarget } from "../../lib/xdev";
import { AskRenderer } from "./AskRenderer";
import { AstEditRenderer } from "./AstEditRenderer";
import { AstGrepRenderer } from "./AstGrepRenderer";
import { askFormSummary } from "./ask-form";
import { BashRenderer } from "./BashRenderer";
import { BrowserRenderer } from "./BrowserRenderer";
import { ComputerRenderer } from "./ComputerRenderer";
import { WaitRenderer } from "./CoordinationRenderer";
import { DebugRenderer } from "./DebugRenderer";
import { EditRenderer } from "./EditRenderer";
import { EvalRenderer } from "./EvalRenderer";
import { editArgumentSummary } from "./edit-args";
import { FindRenderer } from "./FindRenderer";
import { GenericRenderer } from "./GenericRenderer";
import { GithubRenderer } from "./GithubRenderer";
import { GlobRenderer } from "./GlobRenderer";
import { GoalRenderer } from "./GoalRenderer";
import { GrepRenderer } from "./GrepRenderer";
import { HubRenderer } from "./HubRenderer";
import { ImageRenderer } from "./ImageRenderer";
import { LspRenderer } from "./LspRenderer";
import { ManageTasksRenderer } from "./ManageTasksRenderer";
import { MemoryRenderer } from "./MemoryRenderer";
import {
	CheckpointRenderer,
	ContextNotesRenderer,
	IdaRenderer,
	LearnRenderer,
	ManageSkillRenderer,
	NewContextRenderer,
	RewindRenderer,
	SecurityScanRenderer,
} from "./OpsRenderers";
import { ReadRenderer } from "./ReadRenderer";
import { ResolveRenderer } from "./ResolveRenderer";
import { ScheduleTaskRenderer } from "./ScheduleTaskRenderer";
import { TaskRenderer } from "./TaskRenderer";
import { TodoRenderer } from "./TodoRenderer";
import type { ToolRendererProps } from "./ToolCard";
import {
	VibeKillRenderer,
	VibeListRenderer,
	VibeSendRenderer,
	VibeSpawnRenderer,
	VibeWaitRenderer,
} from "./VibeRenderer";
import { WebSearchRenderer } from "./WebSearchRenderer";
import { WriteRenderer } from "./WriteRenderer";

export type { ToolRendererProps };

/** Clipped by CSS, but a megabyte of pasted text must not enter the DOM. */
const CARD_TEXT_MAX_CHARS = 160;

function clipCardText(text: string): string {
	return text.length > CARD_TEXT_MAX_CHARS ? `${text.slice(0, CARD_TEXT_MAX_CHARS)}…` : text;
}

/**
 * One dispatched command inside a shell run, rendered by the tool it wrapped.
 * `output` is the call's text only when the command was the whole call, so a
 * command sharing the run with other lines gets its details and no body text.
 */
function ToolCommandView({
	dispatch,
	output,
	isPartial,
}: {
	dispatch: ToolCommandDispatch;
	output: string | undefined;
	isPartial: boolean;
}) {
	// A command that wraps the transport itself would recurse back into this card.
	const Renderer =
		dispatch.mode === "execute" && dispatch.tool !== "bash" ? getToolRenderer(dispatch.tool) : GenericRenderer;
	const inner = toolCommandInnerResult(dispatch, output);
	const summary = dispatch.mode === "help" ? "--help" : getToolSummary(dispatch.tool, dispatch.args ?? {});
	return (
		<div className="flex flex-col gap-1 border-l border-(--omp-border-muted) pl-2">
			<div className="flex items-baseline gap-1.5 font-mono text-omp-sm">
				<span className="font-semibold text-[var(--omp-text)]">
					{sanitizeToolText(toolCommandLabel(dispatch.tool))}
				</span>
				{summary && <span className="min-w-0 truncate text-[var(--omp-muted)]">{summary}</span>}
				{dispatch.exitCode !== 0 && (
					<span className="ml-auto shrink-0 rounded bg-[var(--omp-error)]/15 px-1 py-px text-omp-xxs font-semibold tabular-nums text-[var(--omp-error)]">
						{dispatch.exitCode}
					</span>
				)}
			</div>
			<Renderer
				args={dispatch.args ?? {}}
				isError={dispatch.exitCode !== 0}
				isPartial={isPartial}
				partialResult={inner}
				result={inner}
			/>
		</div>
	);
}

/**
 * `bash` carries two different things: a shell run, and the tool commands the
 * sidecar mounts into it (`<tool> args`, see `lib/tool-commands`). A dispatched
 * command must render as the tool that ran, otherwise a plan resolution, a
 * security scan or an MCP call shows up as a shell run and the outcome
 * disappears. A call that ran exactly one executed command *is* that command, so
 * its card replaces the shell card; anything else keeps the shell card and
 * lists the nested command cards under it.
 */
function BashRendererOrToolCommands(props: ToolRendererProps) {
	const { args, result, isPartial, partialResult } = props;
	const envelope = isPartial ? partialResult : result;
	const dispatches = toolCommandDispatches("bash", envelope);
	if (dispatches.length === 0) return <BashRenderer {...props} />;

	const command = typeof args.command === "string" ? args.command : undefined;
	const only = dispatches.length === 1 ? dispatches[0] : undefined;
	if (only?.mode === "execute" && isSoleToolCommand(command, only.tool)) {
		const inner = toolCommandInnerResult(only, resultText(envelope));
		const Renderer = only.tool === "bash" ? GenericRenderer : getToolRenderer(only.tool);
		return (
			<Renderer
				args={only.args ?? {}}
				isError={props.isError || only.exitCode !== 0}
				isPartial={isPartial}
				partialResult={inner}
				result={inner}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-1.5">
			<BashRenderer {...props} />
			{dispatches.map((dispatch, index) => (
				<ToolCommandView
					// Commands have no id of their own; order is stable within a result.
					key={index}
					dispatch={dispatch}
					isPartial={Boolean(isPartial) && index === dispatches.length - 1}
					output={undefined}
				/>
			))}
		</div>
	);
}

/**
 * `write` carried the other transport: with `tools.xdev` on, an older sidecar
 * sends a discoverable tool as a JSON payload written to `xd://<tool>`, so the
 * transcript holds one `write` call whose result carries the device outcome
 * under `details.xdev` (see `lib/xdev`). Release sidecars are pinned to a
 * monorepo commit, and the GUI must render whatever that binary emits, so both
 * transports stay wired: a device write renders as the tool that ran, and a
 * real file write still renders as one.
 */
function WriteRendererOrDevice(props: ToolRendererProps) {
	const { args, result, isPartial, partialResult, interrupted } = props;
	const device = xdevWriteTarget(args);
	if (!device) return <WriteRenderer {...props} />;

	const envelope = isPartial ? partialResult : result;
	const dispatch = xdevDispatch(envelope);
	// No dispatch metadata: the payload is still streaming, or the write failed
	// before reaching a device. Show the request as key/value rows rather than a
	// file-write card - the wrapped tool has produced no verdict to render.
	if (!dispatch) {
		const raw = typeof args.content === "string" ? args.content : "";
		const decoded = decodeXdevPayload(raw);
		return (
			<GenericRenderer
				args={Object.keys(decoded).length > 0 ? decoded : { content: clipCardText(raw) }}
				isPartial={isPartial}
				result={envelope}
			/>
		);
	}
	if (dispatch.mode === "help") return <GenericRenderer args={{}} result={envelope} />;

	const name = dispatch.tool || device;
	// `xd://write` dispatches the write tool itself; delegating would recurse.
	const Renderer = name === "write" ? GenericRenderer : getToolRenderer(name);
	const inner = xdevInnerResult(envelope, dispatch);
	return (
		<Renderer
			args={dispatch.args ?? decodeXdevPayload(args.content)}
			interrupted={interrupted}
			isError={props.isError}
			isPartial={isPartial}
			partialResult={inner}
			result={inner}
		/>
	);
}

/**
 * Tool name → renderer. Every name the sidecar can emit for a top-level call
 * belongs here or in `GENERIC_TOOL_NAMES` below; a mounted tool command and an
 * `xd://` device write resolve through this table too (see
 * `BashRendererOrToolCommands` and `WriteRendererOrDevice`). Anything unmapped falls
 * back to GenericRenderer, which is a lossy view, not a broken one.
 */
const REGISTRY: Record<string, ComponentType<ToolRendererProps>> = {
	read: ReadRenderer,
	edit: EditRenderer,
	ast_edit: AstEditRenderer,
	apply_patch: EditRenderer,
	goal: GoalRenderer,
	write: WriteRendererOrDevice,
	bash: BashRendererOrToolCommands,
	grep: GrepRenderer,
	find: FindRenderer,
	glob: GlobRenderer,
	task: TaskRenderer,
	todo: TodoRenderer,
	todowrite: TodoRenderer,
	todo_write: TodoRenderer,
	set_todos: TodoRenderer,
	eval: EvalRenderer,
	browser: BrowserRenderer,
	debug: DebugRenderer,
	lsp: LspRenderer,
	github: GithubRenderer,
	gh: GithubRenderer,
	hub: HubRenderer,
	wait: WaitRenderer,
	ask: AskRenderer,
	computer: ComputerRenderer,
	generate_image: ImageRenderer,
	ast_grep: AstGrepRenderer,
	web_search: WebSearchRenderer,
	vibe_spawn: VibeSpawnRenderer,
	vibe_send: VibeSendRenderer,
	vibe_wait: VibeWaitRenderer,
	vibe_kill: VibeKillRenderer,
	vibe_list: VibeListRenderer,
	retain: MemoryRenderer,
	recall: (props: ToolRendererProps) => <MemoryRenderer {...props} operation="recall" />,
	reflect: (props: ToolRendererProps) => <MemoryRenderer {...props} operation="reflect" />,
	memory_edit: MemoryRenderer,
	resolve: ResolveRenderer,
	// A pending reject carries only a reason — the wrapper pins the operation
	// so the card never renders as "Resolving".
	reject: (props: ToolRendererProps) => <ResolveRenderer {...props} operation="reject" />,
	checkpoint: CheckpointRenderer,
	rewind: RewindRenderer,
	context_notes: ContextNotesRenderer,
	new_context: NewContextRenderer,
	learn: LearnRenderer,
	manage_skill: ManageSkillRenderer,
	security_scan: SecurityScanRenderer,
	ida: IdaRenderer,
	schedule_task: ScheduleTaskRenderer,
	manage_scheduled_tasks: ManageTasksRenderer,
};

export function getToolRenderer(name: string): ComponentType<ToolRendererProps> {
	return REGISTRY[name] ?? GenericRenderer;
}

function argLine(args: Record<string, unknown>, keys: readonly string[]): string {
	for (const key of keys) {
		const value = args[key];
		if (typeof value === "string" && value.length > 0) return sanitizeToolText(value.split("\n", 1)[0] ?? "");
	}
	return "";
}

/** Keys tried in order for a device call's header: the verb, then its object. */
const DEVICE_VERB_KEYS = ["action", "op", "command"] as const;
const DEVICE_OBJECT_KEYS = ["query", "symbol", "path", "file", "pattern", "url", "name"] as const;

/**
 * `LSP - references buildTool` instead of `xd://lsp`, so a collapsed device
 * write reads as the tool that ran (parity with the TUI's activity summary).
 */
function xdevSummary(device: string, content: unknown): string {
	const args = decodeXdevPayload(content);
	const detail = [argLine(args, DEVICE_VERB_KEYS), argLine(args, DEVICE_OBJECT_KEYS)].filter(Boolean).join(" ");
	return detail ? `${device} - ${detail}` : device;
}

/** Batch tools name their payload `items`; the first entry is the header. */
function firstItemContent(args: Record<string, unknown>): string {
	if (!Array.isArray(args.items)) return "";
	const first = args.items[0];
	if (first != null && typeof first === "object")
		return argLine(first as Record<string, unknown>, ["content", "text"]);
	return typeof first === "string" ? first : "";
}

/**
 * One-line header for a collapsed card, computed from call arguments only —
 * the result may not exist yet. Lives next to the renderer table because the
 * header and the body describe the same call; a `switch` in the transcript
 * layer is what let `find`, `checkpoint` and every dispatched command show nothing.
 */
const SUMMARIES: Record<string, (args: Record<string, unknown>) => string> = {
	read: args => argLine(args, ["path", "file"]),
	write: args => {
		const device = xdevWriteTarget(args);
		return device ? xdevSummary(device, args.content) : argLine(args, ["path", "file"]);
	},
	edit: editArgumentSummary,
	apply_patch: editArgumentSummary,
	bash: args => argLine(args, ["command", "cmd"]),
	grep: args => argLine(args, ["pattern"]),
	find: args => argLine(args, ["query"]),
	glob: args => argLine(args, ["path", "pattern"]),
	ast_grep: args => argLine(args, ["pat", "pattern", "query"]),
	ast_edit: args => argLine(args, ["pat", "pattern"]),
	lsp: args => [argLine(args, ["action"]), argLine(args, ["symbol", "file", "path"])].filter(Boolean).join(" "),
	task: args => argLine(args, ["i", "name", "description"]),
	todo: args => [argLine(args, ["op"]), argLine(args, ["task", "reason"])].filter(Boolean).join(" "),
	eval: args => argLine(args, ["title", "language"]),
	debug: args => [argLine(args, ["action"]), argLine(args, ["program", "file", "symbol"])].filter(Boolean).join(" "),
	github: args => argLine(args, ["action", "repo", "url"]),
	hub: args => argLine(args, ["op", "agent"]),
	wait: () => "background activity",
	ask: args => argLine(args, ["question", "i"]) || sanitizeToolText(askFormSummary(args.html)),
	goal: args => argLine(args, ["objective", "op"]),
	checkpoint: args => argLine(args, ["goal"]),
	rewind: args => argLine(args, ["report"]),
	security_scan: args => argLine(args, ["action", "target_kind"]),
	context_notes: args => argLine(args, ["text"]),
	learn: args => argLine(args, ["memory"]),
	manage_skill: args => [argLine(args, ["action"]), argLine(args, ["name"])].filter(Boolean).join(" "),
	memory_edit: args => [argLine(args, ["op"]), argLine(args, ["id"])].filter(Boolean).join(" "),
	retain: args => firstItemContent(args) || argLine(args, ["text", "memory"]),
	recall: args => argLine(args, ["query", "text"]),
	reflect: args => argLine(args, ["topic", "query"]),
	web_search: args => argLine(args, ["query", "i"]),
	generate_image: args => argLine(args, ["subject", "prompt"]),
	tts: args => argLine(args, ["text"]),
	resolve: args => argLine(args, ["reason", "label"]),
	reject: args => argLine(args, ["reason"]),
	schedule_task: args => argLine(args, ["title"]),
	manage_scheduled_tasks: args => [argLine(args, ["action"]), argLine(args, ["title"])].filter(Boolean).join(" "),
};

const FALLBACK_ARG_KEYS = ["path", "file", "name", "pattern", "query", "command", "action", "i", "text"] as const;

/** Header text for any tool call; unknown tools fall back to their first scalar argument. */
export function getToolSummary(name: string, args: Record<string, unknown>): string {
	const summary = SUMMARIES[name];
	return clipCardText(summary ? summary(args) : argLine(args, FALLBACK_ARG_KEYS));
}
