import {
	Bot,
	ClipboardList,
	Diff,
	FolderTree,
	LayoutDashboard,
	MessageCircleQuestion,
	SquareTerminal,
	X,
} from "lucide-react";
import {
	memo,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useActiveTabRouteReady } from "../../hooks/use-active-tab-route";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { usePlanApprovalStore } from "../../stores/plan-approval";
import { useSessionStore } from "../../stores/session";
import { useActiveTabKind, useTabsStore } from "../../stores/tabs";
import { CHAT_PANEL_TABS, type PanelTab, useUiStore } from "../../stores/ui";
import { AgentRoster, useAgentsTabSignal } from "../agents/AgentRoster";
import { PanelErrorBoundary } from "../common";
import { Glide } from "../common/Glide";
import { PlanApprovalPanel } from "../dialogs/PlanApprovalPanel";
import { BtwPanel } from "../panels/BtwPanel";
import { DiffPanel } from "../panels/DiffPanel";
import { FilesPanel } from "../panels/FilesPanel";
import { OverviewPanel } from "../panels/OverviewPanel";
import { PlanPanel } from "../panels/PlanPanel";
import { TerminalPanel } from "../panels/TerminalPanel";

const MIN_WIDTH = 360;
const PANEL_WIDTH_PREF = "gui.panelWidth";

const TABS: { id: PanelTab; labelKey: string; icon: typeof Diff }[] = [
	{ id: "overview", labelKey: "panel.tabs.overview", icon: LayoutDashboard },
	{ id: "plan", labelKey: "dock.plan", icon: ClipboardList },
	{ id: "agents", labelKey: "panel.tabs.agents", icon: Bot },
	{ id: "btw", labelKey: "panel.tabs.btw", icon: MessageCircleQuestion },
	{ id: "diff", labelKey: "panel.tabs.diff", icon: Diff },
	{ id: "files", labelKey: "panel.tabs.files", icon: FolderTree },
	{ id: "terminal", labelKey: "panel.tabs.terminal", icon: SquareTerminal },
];

interface InspectorTabProps {
	label: string;
	/** What a screen reader announces: the label, plus any news the tab carries. */
	description: string;
	icon: typeof Diff;
	active: boolean;
	signal: "error" | "working" | null;
	onSelect: () => void;
	ready: boolean;
}

function InspectorTab({ label, description, icon: Icon, active, signal, onSelect, ready }: InspectorTabProps) {
	return (
		<button
			disabled={!ready}
			aria-label={description}
			title={label}
			aria-pressed={active}
			type="button"
			onClick={onSelect}
			className="relative flex h-8 min-w-0 flex-1 items-center justify-center"
		>
			<Icon aria-hidden size={14} />
			{signal && (
				<span
					aria-hidden
					className={cx(
						"absolute top-1 right-1 h-1.5 w-1.5 rounded-full",
						signal === "error" ? "bg-[var(--omp-error)]" : "bg-[var(--omp-accent)]",
					)}
				/>
			)}
		</button>
	);
}

const InspectorContent = memo(function InspectorContent({ tab }: { tab: PanelTab }) {
	switch (tab) {
		case "overview":
			return <OverviewPanel />;
		case "agents":
			return <AgentRoster />;
		case "btw":
			return <BtwPanel />;
		case "diff":
			return <DiffPanel />;
		case "files":
			return <FilesPanel />;
		case "terminal":
			return <TerminalPanel />;
		case "plan":
			return <InspectorPlan />;
	}
});

function InspectorPlan() {
	const sessionKey = useSessionStore(state => `${state.cwd}:${state.sessionId ?? state.sessionFile ?? "new"}`);
	const proposal = usePlanApprovalStore(state => state.pending);
	return (
		<div key={sessionKey} className="h-full">
			{proposal ? <PlanApprovalPanel /> : <PlanPanel />}
		</div>
	);
}

/** Session inspector: plans and approvals live here; execution cards stay in the transcript. */
export function PanelContainer() {
	const t = useT();
	const panelTab = useUiStore(s => s.panelTab);
	const setPanelTab = useUiStore(s => s.setPanelTab);
	const togglePanel = useUiStore(s => s.togglePanel);
	const activeTabId = useTabsStore(s => s.activeTabId);
	const routeReady = useActiveTabRouteReady();
	/** Chat tabs expose only Overview, btw and Files — diffs, shells and agent browsing need tools. */
	const isChat = useActiveTabKind() === "chat";
	const visibleTabs = isChat ? TABS.filter(tab => CHAT_PANEL_TABS.has(tab.id)) : TABS;
	const visiblePanelTab = isChat && !CHAT_PANEL_TABS.has(panelTab) ? "files" : panelTab;
	const agentsSignal = useAgentsTabSignal();

	const panelRef = useRef<HTMLElement>(null);
	const [paneWidth, setPaneWidth] = useState(0);
	const [width, setWidth] = useState<number | "full" | null>(null);
	const dragging = useRef(false);
	const minWidth = Math.min(MIN_WIDTH, paneWidth);
	const defaultWidth = Math.min(520, Math.max(380, paneWidth * 0.42));
	const requestedWidth = width === "full" ? paneWidth : (width ?? Math.max(MIN_WIDTH, Math.round(defaultWidth)));
	const panelWidth = Math.min(requestedWidth, paneWidth);
	const atLeftEdge = panelWidth === paneWidth;

	useLayoutEffect(() => {
		const pane = panelRef.current?.parentElement;
		if (!pane) return;
		const measure = () => setPaneWidth(pane.clientWidth);
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(pane);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		let cancelled = false;
		const prefs = window.omp?.prefs;
		if (typeof prefs?.get !== "function") return;
		void prefs
			.get(PANEL_WIDTH_PREF)
			.then(value => {
				if (cancelled) return;
				if (value === "full") setWidth(current => current ?? "full");
				else if (typeof value === "number" && Number.isFinite(value)) {
					setWidth(current => current ?? Math.max(MIN_WIDTH, Math.round(value)));
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (width === null || typeof window.omp?.prefs?.set !== "function") return;
		const timer = window.setTimeout(() => {
			void window.omp.prefs.set(PANEL_WIDTH_PREF, width).catch(() => {});
		}, 150);
		return () => window.clearTimeout(timer);
	}, [width]);

	const startDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
		dragging.current = true;
		e.currentTarget.setPointerCapture(e.pointerId);
	}, []);

	const onDrag = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			const bounds = panelRef.current?.parentElement?.getBoundingClientRect();
			if (!dragging.current || !bounds) return;
			setWidth(e.clientX <= bounds.left ? "full" : Math.max(minWidth, Math.round(bounds.right - e.clientX)));
		},
		[minWidth],
	);

	const endDrag = useCallback(() => {
		dragging.current = false;
	}, []);

	return (
		<aside
			aria-busy={!routeReady}
			ref={panelRef}
			className="omp-inspector relative z-30 flex max-w-full shrink-0 flex-col border-l border-[var(--omp-border-muted)]"
			style={{ width: paneWidth > 0 ? panelWidth : "100%" }}
		>
			<header className="flex h-12 shrink-0 items-center border-b border-[var(--omp-border-muted)] px-3">
				<h2 className="sr-only">
					{t("panel.title")} - {t("panel.subtitle")}
				</h2>
				<div className="omp-segmented w-full">
					<Glide activeKey={visiblePanelTab} selector='[aria-pressed="true"]' variant="thumb" />
					{visibleTabs.map(({ id, labelKey, icon }) => {
						const active = visiblePanelTab === id;
						return (
							<InspectorTab
								key={id}
								label={t(labelKey)}
								description={
									id === "agents" && agentsSignal.tone
										? t("agents.tab.label", {
												label: t(labelKey),
												state:
													agentsSignal.tone === "error"
														? t("agents.sidebar.moreFailed", { count: agentsSignal.failed })
														: t("agents.sidebar.moreWorking", { count: agentsSignal.working }),
											})
										: t(labelKey)
								}
								icon={icon}
								active={active}
								signal={id === "agents" && !active ? agentsSignal.tone : null}
								onSelect={() => setPanelTab(id)}
								ready={routeReady}
							/>
						);
					})}
					<button
						aria-label={t("common.close")}
						className="omp-pressable flex h-8 min-w-0 flex-1 items-center justify-center hover:bg-(--omp-selected-bg)"
						onClick={togglePanel}
						title={t("common.close")}
						type="button"
					>
						<X aria-hidden size={16} />
					</button>
				</div>
			</header>
			<div className="min-h-0 flex-1 overflow-hidden">
				{routeReady && (
					<PanelErrorBoundary key={`${activeTabId ?? "no-tab"}:${visiblePanelTab}`}>
						<InspectorContent tab={visiblePanelTab} />
					</PanelErrorBoundary>
				)}
			</div>
			<div
				role="separator"
				aria-label={t("panel.resize")}
				aria-orientation="vertical"
				aria-valuemin={minWidth}
				aria-valuemax={paneWidth}
				aria-valuenow={Math.round(panelWidth)}
				tabIndex={0}
				onPointerDown={startDrag}
				onPointerMove={onDrag}
				onPointerUp={endDrag}
				onLostPointerCapture={endDrag}
				onKeyDown={event => {
					if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
					event.preventDefault();
					setWidth(
						event.key === "Home"
							? minWidth
							: event.key === "End"
								? "full"
								: Math.min(paneWidth, Math.max(minWidth, panelWidth + (event.key === "ArrowLeft" ? 24 : -24))),
					);
				}}
				className={cx(
					"no-drag absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize touch-none transition-colors hover:bg-(--omp-accent)/40 focus-visible:bg-(--omp-accent)/40 active:bg-(--omp-accent)",
					!atLeftEdge && "-translate-x-1/2",
				)}
			/>
		</aside>
	);
}
