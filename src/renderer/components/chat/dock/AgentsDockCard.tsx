/** Session-scoped execution roster at the end of the scrollable transcript. */
import { Bot, ChevronRight } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { SubagentSnapshot } from "../../../../shared/rpc-types";
import { cx } from "../../../lib/format";
import { useT } from "../../../lib/i18n";
import { useNowTick } from "../../../lib/now-tick";
import { useMessagesStore } from "../../../stores/messages";
import { useSessionStore } from "../../../stores/session";
import { useRuntimeTabId } from "../../../stores/session-runtime-context";
import { useSettingsStore } from "../../../stores/settings";
import { useSubagentsStore } from "../../../stores/subagents";
import { subagentActivity } from "../../agents/agent-activity";
import { Badge, Modal } from "../../common";
import { SubagentTranscript } from "../../panels/SubagentTranscript";
import {
	buildSubagentList,
	extractTaskToolCallIds,
	formatElapsed,
	isLiveSubagentStatus,
	statusMeta,
	subagentElapsedMs,
	subagentFacts,
	subagentPrimaryLabel,
	useSubagentGraphStore,
} from "../../panels/subagent-graph";
import { buildAgentDockSummary } from "./dock-summary";

const SubagentRow = memo(function SubagentRow({
	agent,
	depth,
	onOpen,
	now,
}: {
	agent: SubagentSnapshot;
	depth: number;
	onOpen: (id: string) => void;
	now: number;
}) {
	const t = useT();
	const looksLive = isLiveSubagentStatus(agent.status);
	const live = agent.live !== false && looksLive;
	const meta = statusMeta(agent.live === false && looksLive ? "stale" : agent.status);
	const elapsed = subagentElapsedMs(agent, now);
	const title = subagentPrimaryLabel(agent);
	const progressLine = live ? agent.progress?.description?.trim() : undefined;
	const description = agent.description?.trim();
	const detail = [progressLine, description].find(line => line && line !== title);
	const facts = subagentFacts(agent, t("sessionInfo.tokens"));

	return (
		<li className="relative" style={{ marginLeft: Math.min(depth, 6) * 14 }}>
			{depth > 0 && (
				<span className="pointer-events-none absolute top-0 -left-2.5 h-5 w-2.5 rounded-bl-md border-b border-l border-(--omp-border-muted)" />
			)}
			<div
				className={cx(
					"relative overflow-hidden rounded-lg border border-(--omp-border-muted) bg-transparent transition-colors duration-150 hover:bg-(--omp-bg-tertiary)",
					agent.status === "cancelled" && "opacity-70",
				)}
			>
				<span
					aria-hidden
					className={cx(
						"absolute inset-y-2 left-0 w-0.5 rounded-full",
						// The rail repeats the pill's color: only an agent that is working is
						// blue; one waiting or paused stays neutral.
						meta.variant === "info"
							? "bg-(--omp-link)"
							: agent.status === "failed"
								? "bg-(--omp-error)"
								: "bg-(--omp-border)",
					)}
				/>
				<button
					aria-haspopup="dialog"
					className="omp-pressable flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--omp-accent)"
					onClick={() => onOpen(agent.id)}
					title={t("agents.dock.toggleTranscript")}
					type="button"
				>
					<ChevronRight aria-hidden="true" className="mt-0.5 shrink-0 text-(--omp-dim)" size={12} />
					<span className="min-w-0 flex-1">
						<span className="flex min-w-0 items-center gap-1.5">
							<span className="min-w-0 flex-1 truncate text-omp-sm font-medium text-(--omp-text)" title={title}>
								{title}
							</span>
							<Badge dot={meta.live} pulse={meta.live} variant={meta.variant}>
								{t(meta.labelKey)}
							</Badge>
						</span>
						<span className="mt-1 flex min-w-0 items-center gap-1 text-omp-xxs text-(--omp-dim)">
							<Bot className="shrink-0 text-(--omp-status-subagents)" size={10} />
							<span className="shrink-0 tabular-nums">{facts.kind}</span>
							{facts.model && <span className="min-w-0 truncate">- {facts.model}</span>}
							{facts.usage && <span className="shrink-0 tabular-nums">- {facts.usage}</span>}
							{elapsed !== null && (
								<span className="ml-auto shrink-0 tabular-nums">{formatElapsed(elapsed)}</span>
							)}
						</span>
						{detail && <span className="mt-1 block truncate text-omp-xs text-(--omp-muted)" title={detail}>{detail}</span>}
					</span>
				</button>
			</div>
		</li>
	);
});

/** `dialogHost` is the positioned chat viewport, outside its scroll container. */
export function SubagentTranscriptBlock({ dialogHost }: { dialogHost: HTMLElement | null }) {
	const mode = useSettingsStore(state => state.pinnedAgents);
	const hasAgents = useSubagentsStore(state => state.subagents.size > 0);
	const tabId = useRuntimeTabId();
	const sessionId = useSessionStore(state => state.sessionId);
	if (!hasAgents || mode === "off") return null;
	return (
		<SessionSubagentBlock
			dialogHost={dialogHost}
			full={mode === "full"}
			key={`${tabId ?? ""}:${sessionId ?? ""}`}
		/>
	);
}

function SessionSubagentBlock({ dialogHost, full }: { dialogHost: HTMLElement | null; full: boolean }) {
	const t = useT();
	const subagents = useSubagentsStore(state => state.subagents);
	const toolCallOwners = useSubagentGraphStore(state => state.toolCallOwners);
	const messages = useMessagesStore(state => state.messages);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [showAll, setShowAll] = useState(false);
	const selected = selectedId ? subagents.get(selectedId) : undefined;

	const rootToolCallIds = useMemo(() => new Set(extractTaskToolCallIds(messages)), [messages]);
	const rows = useMemo(
		() => buildSubagentList([...subagents.values()], rootToolCallIds, toolCallOwners),
		[subagents, rootToolCallIds, toolCallOwners],
	);
	const summary = useMemo(() => (full || showAll ? null : buildAgentDockSummary(rows)), [full, rows, showAll]);
	const working = useMemo(() => {
		let count = 0;
		for (const { agent } of rows) if (subagentActivity(agent) === "working") count++;
		return count;
	}, [rows]);
	const now = useNowTick(working > 0);
	if (rows.length === 0) return null;

	return (
		<section
			aria-label={t("dock.agents")}
			className="my-3 rounded-xl border border-(--omp-border-muted)"
			data-subagent-transcript-block
		>
			<h2 className="flex items-center gap-2 px-3 py-2 text-omp-sm font-medium text-(--omp-text)">
				<Bot aria-hidden="true" className="text-(--omp-status-subagents)" size={14} />
				{t("dock.agents")}
				<span className="ml-auto text-omp-xs tabular-nums text-(--omp-muted)">{working}/{rows.length}</span>
			</h2>
			<ul className="space-y-1.5 px-2 pb-2">
				{(summary?.rows ?? rows).map(({ agent, depth }) => (
					<SubagentRow agent={agent} depth={depth} key={agent.id} now={now} onOpen={setSelectedId} />
				))}
			</ul>
			{summary && summary.hiddenCount > 0 && (
				<button
					className="omp-pressable mx-2 mb-2 block rounded-md px-2 py-1 text-omp-xs font-medium text-(--omp-link) hover:bg-(--omp-bg-tertiary)"
					onClick={() => setShowAll(true)}
					type="button"
				>
					{t("dock.viewAllAgents", { hidden: summary.hiddenCount, total: summary.totalCount })}
				</button>
			)}
			{dialogHost && (
				<Modal
					host={dialogHost}
					onClose={() => setSelectedId(null)}
					open={selected !== undefined}
					size="md"
					title={selected ? subagentPrimaryLabel(selected) : undefined}
				>
					{selected && <SubagentTranscript agent={selected} key={selected.id} />}
				</Modal>
			)}
		</section>
	);
}
