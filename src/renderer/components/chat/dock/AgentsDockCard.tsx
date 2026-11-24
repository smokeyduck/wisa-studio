/** Individual subagent cards in transcript history and their chat-scoped dialog. */
import { Bot, ChevronRight } from "lucide-react";
import { memo } from "react";
import type { AgentMessage } from "../../../../shared/rpc-types";
import { cx } from "../../../lib/format";
import { useT } from "../../../lib/i18n";
import { useNowTick } from "../../../lib/now-tick";
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
import { CustomMessageCard } from "../CustomMessageCard";

export const SubagentHistoryCard = memo(function SubagentHistoryCard({
	agentId,
	full,
	onOpen,
}: {
	agentId: string;
	full: boolean;
	onOpen: (id: string) => void;
}) {
	const agent = useSubagentsStore(state => state.subagents.get(agentId));
	const now = useNowTick(!!agent && agent.live !== false && isLiveSubagentStatus(agent.status));
	const t = useT();
	if (!agent) return null;
	const meta = statusMeta(agent.status);
	const elapsed = subagentElapsedMs(agent, now);
	const title = subagentPrimaryLabel(agent);
	const progressLine = full ? agent.progress?.description?.trim() : undefined;
	const description = agent.description?.trim();
	const detail = progressLine && progressLine !== title ? progressLine : description;
	const facts = subagentFacts(agent, t("sessionInfo.tokens"));

	return (
		<div className="relative my-2 ms-(--omp-editorial-inset) w-fit max-w-[calc(100%-var(--omp-editorial-inset)-var(--omp-editorial-edge))] overflow-hidden rounded-lg border border-(--omp-border-muted) bg-transparent transition-colors duration-150 hover:bg-(--omp-bg-tertiary)">
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

/** Mounted outside the virtual rows so scrolling never owns the dialog's lifetime. */
export function SubagentHistoryDialog({
	agentId,
	dialogHost,
	completions,
	onClose,
}: {
	agentId: string | null;
	dialogHost: HTMLElement;
	completions: readonly AgentMessage[] | undefined;
	onClose: () => void;
}) {
	const agent = useSubagentsStore(state => (agentId ? state.subagents.get(agentId) : undefined));
	return (
		<Modal
			host={dialogHost}
			onClose={onClose}
			open={agent !== undefined}
			size="md"
			title={agent ? subagentPrimaryLabel(agent) : undefined}
		>
			{agent && <SubagentTranscript agent={agent} conversationOnly key={agent.id} />}
			{completions?.map((message, index) => (
				<CustomMessageCard inProcess key={message.entryId ?? index} message={message} />
			))}
		</Modal>
	);
}
