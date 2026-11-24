/** Individual cards for active subagents at the end of the transcript. */
import { Bot, ChevronRight } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { SubagentSnapshot } from "../../../../shared/rpc-types";
import { cx } from "../../../lib/format";
import { useT } from "../../../lib/i18n";
import { useNowTick } from "../../../lib/now-tick";
import { useSessionStore } from "../../../stores/session";
import { useRuntimeTabId } from "../../../stores/session-runtime-context";
import { useSettingsStore } from "../../../stores/settings";
import { useSubagentsStore } from "../../../stores/subagents";
import { Badge, Modal } from "../../common";
import { SubagentTranscript } from "../../panels/SubagentTranscript";
import {
	formatElapsed,
	isLiveSubagentStatus,
	statusMeta,
	subagentElapsedMs,
	subagentFacts,
	subagentPrimaryLabel,
} from "../../panels/subagent-graph";

const SubagentRow = memo(function SubagentRow({
	agent,
	full,
	onOpen,
	now,
}: {
	agent: SubagentSnapshot;
	full: boolean;
	onOpen: (id: string) => void;
	now: number;
}) {
	const t = useT();
	const meta = statusMeta(agent.status);
	const elapsed = subagentElapsedMs(agent, now);
	const title = subagentPrimaryLabel(agent);
	const progressLine = full ? agent.progress?.description?.trim() : undefined;
	const description = agent.description?.trim();
	const detail = progressLine && progressLine !== title ? progressLine : description;
	const facts = subagentFacts(agent, t("sessionInfo.tokens"));

	return (
		<div className="relative my-2 ms-(--omp-editorial-inset) me-(--omp-editorial-edge) overflow-hidden rounded-lg border border-(--omp-border-muted) bg-transparent transition-colors duration-150 hover:bg-(--omp-bg-tertiary)">
			<span
				aria-hidden
				className={cx(
					"absolute inset-y-2 left-0 w-0.5 rounded-full",
					meta.variant === "info" ? "bg-(--omp-link)" : "bg-(--omp-border)",
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
						{elapsed !== null && <span className="ml-auto shrink-0 tabular-nums">{formatElapsed(elapsed)}</span>}
					</span>
					{detail && detail !== title && (
						<span className="mt-1 block truncate text-omp-xs text-(--omp-muted)" title={detail}>
							{detail}
						</span>
					)}
				</span>
			</button>
		</div>
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
		<SessionSubagentBlock dialogHost={dialogHost} full={mode === "full"} key={`${tabId ?? ""}:${sessionId ?? ""}`} />
	);
}

function SessionSubagentBlock({ dialogHost, full }: { dialogHost: HTMLElement | null; full: boolean }) {
	const subagents = useSubagentsStore(state => state.subagents);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = selectedId ? subagents.get(selectedId) : undefined;

	const active = useMemo(() => {
		const agents: SubagentSnapshot[] = [];
		for (const agent of subagents.values()) {
			if (agent.live !== false && isLiveSubagentStatus(agent.status)) agents.push(agent);
		}
		return agents;
	}, [subagents]);
	const now = useNowTick(active.length > 0);
	if (active.length === 0 && !selected) return null;

	return (
		<>
			{active.map(agent => (
				<SubagentRow agent={agent} full={full} key={agent.id} now={now} onOpen={setSelectedId} />
			))}
			{dialogHost && (
				<Modal
					host={dialogHost}
					onClose={() => setSelectedId(null)}
					open={selected !== undefined}
					size="md"
					title={selected ? subagentPrimaryLabel(selected) : undefined}
				>
					{selected && <SubagentTranscript agent={selected} conversationOnly key={selected.id} />}
				</Modal>
			)}
		</>
	);
}
