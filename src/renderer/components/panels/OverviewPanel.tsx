/**
 * Overview drawer tab: what is true of this session right now, one card per
 * question — how full the context is, where the agent works, what is running,
 * and which MCP servers it can reach. Each card links to the
 * full view instead of repeating its controls. Chat tabs have no tools, so they
 * show only Context, Workspace and Running.
 */
import { Activity, FolderGit2, Gauge, type LucideIcon, Puzzle, Server } from "lucide-react";
import type { ReactNode } from "react";
import { getBtwLatestTurn } from "../../../shared/rpc-types";
import { useAutoCompactAt } from "../../hooks/use-compaction-config";
import { useContextReport } from "../../hooks/use-context-report";
import { useGitStatus } from "../../hooks/use-git-status";
import { useMcpServers } from "../../hooks/use-mcp-servers";
import { contextSegments, contextUsageView, formatContextUsage } from "../../lib/context-usage";
import { describeError } from "../../lib/errors";
import { shortenPath } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { useBtwStore } from "../../stores/btw";
import { mcpServerState } from "../../stores/mcp";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { useSubagentsStore } from "../../stores/subagents";
import { useActiveTabKind } from "../../stores/tabs";
import { useTodoStore } from "../../stores/todo";
import { useUiStore } from "../../stores/ui";
import { subagentActivity } from "../agents/agent-activity";
import { Badge, Button, Spinner } from "../common";
import { ContextBreakdown } from "../layout/ContextBreakdown";
import { inSpawnOrder } from "./subagent-graph";

/** Running rows per kind (subagents, side questions) before the rest fold into a count. */
const RUNNING_PREVIEW = 3;

function plural(count: number): string {
	return count === 1 ? "" : "s";
}

function Card({
	icon: Icon,
	title,
	action,
	children,
}: {
	icon: LucideIcon;
	title: string;
	action?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<section
			aria-label={title}
			className="omp-overview-card rounded-xl border border-(--omp-border-muted) bg-(--omp-bg-elevated)"
		>
			<header className="omp-overview-card-header flex items-center gap-2">
				<Icon aria-hidden className="shrink-0 text-(--omp-dim)" size={14} />
				<h3 className="min-w-0 flex-1 truncate text-omp-sm font-medium text-(--omp-muted)">{title}</h3>
				{action}
			</header>
			{children && <div className="omp-overview-card-body">{children}</div>}
		</section>
	);
}

function CardLink({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<Button className="-me-1.5" onClick={onClick} size="sm" variant="ghost">
			{label}
		</Button>
	);
}

function Muted({ children }: { children: ReactNode }) {
	return <p className="text-omp-md text-(--omp-dim)">{children}</p>;
}

function Row({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
	return (
		<div className="omp-overview-row flex items-baseline gap-3 text-omp-md">
			<span className="omp-overview-row-label shrink-0 text-(--omp-dim)">{label}</span>
			<span className="omp-overview-row-value min-w-0 flex-1 truncate text-(--omp-text)" title={title}>
				{value}
			</span>
		</div>
	);
}

function ContextCard() {
	const t = useT();
	const openContextReport = useUiStore(state => state.openContextReport);
	const { contextUsage, breakdown, loading, error, retry } = useContextReport(true);
	const view = contextUsageView(contextUsage, breakdown);
	const autoCompactAt = useAutoCompactAt(view.contextWindow);
	const segments = breakdown ? contextSegments(breakdown, view, autoCompactAt) : [];

	return (
		<Card
			action={<CardLink label={t("overview.context.details")} onClick={openContextReport} />}
			icon={Gauge}
			title={t("overview.context.title")}
		>
			{contextUsage ? (
				<>
					<div className="omp-overview-context-reading flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-omp-md">
						<span className="text-(--omp-text)">
							{view.capacityKnown
								? t("overview.context.used", { percent: Math.round(view.percent) })
								: t("contextUsage.windowUnknown")}
						</span>
						<span className="shrink-0 font-mono tabular-nums text-(--omp-dim)">{formatContextUsage(view)}</span>
					</div>
					<ContextBreakdown
						approximate
						className="omp-overview-context-breakdown"
						segments={segments}
						view={view}
					/>
					{loading && segments.length === 0 ? (
						<div className="mt-2 flex items-center gap-2 text-omp-md text-(--omp-dim)">
							<Spinner size="sm" /> {t("contextUsage.loading")}
						</div>
					) : error && segments.length === 0 ? (
						<div className="mt-2 flex items-center gap-2">
							<span className="min-w-0 flex-1 text-omp-md text-(--omp-dim)">
								{t("contextUsage.unavailable")}
							</span>
							<Button onClick={retry} size="sm" variant="secondary">
								{t("common.retry")}
							</Button>
						</div>
					) : null}
				</>
			) : (
				<Muted>{t("overview.context.none")}</Muted>
			)}
		</Card>
	);
}

/** Tool-free chat tabs do not request Git status. */
function BranchRow() {
	const t = useT();
	const { status } = useGitStatus();
	const branch = !status
		? "-"
		: !status.isRepo
			? t("overview.workspace.noRepo")
			: (status.branch ?? t("overview.workspace.detached"));
	return <Row label={t("overview.workspace.branch")} value={branch} />;
}

function WorkspaceCard({ withGit }: { withGit: boolean }) {
	const t = useT();
	const cwd = useSessionStore(state => state.cwd);
	const model = useModelStore(state => state.model);

	return (
		<Card icon={FolderGit2} title={t("overview.workspace.title")}>
			<div className="omp-overview-list">
				<Row label={t("overview.workspace.folder")} title={cwd || undefined} value={cwd ? shortenPath(cwd) : "-"} />
				{withGit && <BranchRow />}
				<Row
					label={t("overview.workspace.model")}
					value={model ? (model.name ?? model.id) : t("overview.workspace.noModel")}
				/>
			</div>
		</Card>
	);
}

function RunningCard() {
	const t = useT();
	const setPanelTab = useUiStore(state => state.setPanelTab);
	const isStreaming = useSessionStore(state => state.isStreaming);
	const isCompacting = useSessionStore(state => state.isCompacting);
	const subagents = useSubagentsStore(state => state.subagents);
	const btwRecords = useBtwStore(state => state.records);
	const phases = useTodoStore(state => state.phases);

	const liveAgents = inSpawnOrder(subagents.values()).filter(agent => subagentActivity(agent) === "working");
	const sideQuestions = btwRecords.filter(record => getBtwLatestTurn(record).status === "running");
	const tasks = phases.flatMap(phase => phase.tasks);
	const doneTasks = tasks.filter(task => task.status === "completed").length;
	const currentTask = tasks.find(task => task.status === "in_progress");
	const idle =
		!isStreaming && !isCompacting && liveAgents.length === 0 && sideQuestions.length === 0 && tasks.length === 0;

	return (
		<Card icon={Activity} title={t("overview.running.title")}>
			{idle ? (
				<Muted>{t("overview.running.none")}</Muted>
			) : (
				<ul className="omp-overview-list text-omp-md">
					{(isStreaming || isCompacting) && (
						<li className="flex items-center gap-2 text-(--omp-text)">
							<Spinner size="sm" />
							{isCompacting ? t("overview.running.compacting") : t("overview.running.agent")}
						</li>
					)}
					{liveAgents.length > 0 && (
						<li>
							<p className="truncate text-(--omp-text)">
								{t("overview.running.subagents", {
									count: liveAgents.length,
									plural: plural(liveAgents.length),
								})}
							</p>
							<ul className="mt-1 space-y-0.5 ps-3">
								{liveAgents.slice(0, RUNNING_PREVIEW).map(agent => (
									<li className="truncate text-omp-sm text-(--omp-dim)" key={agent.id}>
										<span className="text-(--omp-muted)">{agent.agent}</span>
										{agent.description ? ` - ${agent.description}` : null}
									</li>
								))}
								{liveAgents.length > RUNNING_PREVIEW && (
									<li className="text-omp-sm text-(--omp-dim)">
										{t("overview.more", { count: liveAgents.length - RUNNING_PREVIEW })}
									</li>
								)}
							</ul>
						</li>
					)}
					{sideQuestions.slice(0, RUNNING_PREVIEW).map(record => (
						<li key={record.id}>
							<button
								className="w-full truncate text-start text-(--omp-text) hover:text-(--omp-link)"
								onClick={() => {
									useBtwStore.getState().select(record.id);
									setPanelTab("btw");
								}}
								type="button"
							>
								{t("overview.running.sideQuestion", { question: getBtwLatestTurn(record).question })}
							</button>
						</li>
					))}
					{tasks.length > 0 && (
						<li>
							<div className="text-(--omp-text)">
								{t("overview.running.todos", { done: doneTasks, total: tasks.length })}
							</div>
							{currentTask && (
								<div className="mt-0.5 truncate ps-3 text-omp-sm text-(--omp-dim)">{currentTask.content}</div>
							)}
						</li>
					)}
				</ul>
			)}
		</Card>
	);
}

function PluginsCard() {
	const t = useT();
	const openSettings = useUiStore(state => state.openSettings);
	return (
		<Card
			action={<CardLink label={t("overview.plugins.manage")} onClick={() => openSettings("resources:catalog")} />}
			icon={Puzzle}
			title={t("invPanel.tabs.plugins")}
		/>
	);
}

function ServersCard() {
	const t = useT();
	const { data: servers, error, loading, refresh } = useMcpServers();

	const openSettings = useUiStore(state => state.openSettings);

	return (
		<Card
			action={<CardLink label={t("overview.servers.manage")} onClick={() => openSettings("mcp")} />}
			icon={Server}
			title={t("overview.servers.title")}
		>
			{error ? (
				<div className="flex items-center gap-2">
					<span className="min-w-0 flex-1 text-omp-md text-(--omp-dim)" title={error}>
						{t("overview.servers.failed")}
					</span>
					<Button onClick={() => void refresh()} size="sm" variant="secondary">
						{t("common.retry")}
					</Button>
				</div>
			) : loading || !servers ? (
				<div className="flex items-center gap-2 text-omp-md text-(--omp-dim)">
					<Spinner size="sm" /> {t("common.loading")}
				</div>
			) : servers.length === 0 ? (
				<Muted>{t("overview.servers.none")}</Muted>
			) : (
				<ul className="omp-overview-list">
					{servers.map(server => {
						const state = mcpServerState(server);
						return (
							<li
								className="flex items-center gap-2 text-omp-md"
								key={server.name}
								title={state.key === "error" && server.lastError ? describeError(server.lastError) : undefined}
							>
								<span className="min-w-0 flex-1 truncate text-(--omp-text)">{server.name}</span>
								{server.status === "connected" && server.enabled && (
									<span className="shrink-0 text-omp-sm tabular-nums text-(--omp-dim)">
										{t("overview.servers.tools", {
											count: server.toolCount,
											plural: plural(server.toolCount),
										})}
									</span>
								)}
								<Badge dot pulse={state.pulse} variant={state.variant}>
									{t(`overview.servers.status.${state.key}`)}
								</Badge>
							</li>
						);
					})}
				</ul>
			)}
		</Card>
	);
}

export function OverviewPanel() {
	const isChat = useActiveTabKind() === "chat";
	return (
		<div className="omp-overview-panel">
			<div className="omp-overview-scroll">
				<div className="omp-overview-grid">
					<ContextCard />
					<WorkspaceCard withGit={!isChat} />
					<RunningCard />
					{!isChat && <PluginsCard />}
					{!isChat && <ServersCard />}
				</div>
			</div>
		</div>
	);
}
