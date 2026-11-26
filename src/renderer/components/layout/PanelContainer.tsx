import {
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
import { describeError } from "../../lib/errors";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { isImeKeyEvent } from "../../lib/ime";
import { usePlanApprovalStore } from "../../stores/plan-approval";
import { useSessionStore } from "../../stores/session";
import { useActiveTabKind, useTabsStore } from "../../stores/tabs";
import { toast } from "../../stores/toast";
import { CHAT_PANEL_TABS, type PanelTab, useUiStore } from "../../stores/ui";
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
	{ id: "btw", labelKey: "panel.tabs.btw", icon: MessageCircleQuestion },
	{ id: "diff", labelKey: "panel.tabs.diff", icon: Diff },
	{ id: "files", labelKey: "panel.tabs.files", icon: FolderTree },
];

interface InspectorTabProps {
	label: string;
	icon: typeof Diff;
	active: boolean;
	onSelect: () => void;
	ready: boolean;
}

function InspectorTab({ label, icon: Icon, active, onSelect, ready }: InspectorTabProps) {
	return (
		<button
			disabled={!ready}
			aria-label={label}
			title={label}
			aria-pressed={active}
			type="button"
			onClick={onSelect}
			className="relative flex h-8 min-w-0 flex-1 items-center justify-center"
		>
			<Icon aria-hidden size={14} />
		</button>
	);
}

const InspectorContent = memo(function InspectorContent({ tab }: { tab: PanelTab }) {
	switch (tab) {
		case "overview":
			return <OverviewPanel />;
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
	const closePanel = useUiStore(s => s.closePanel);
	const activeTabId = useTabsStore(s => s.activeTabId);
	const cwd = useSessionStore(s => s.cwd);
	const routeReady = useActiveTabRouteReady();
	/** Chat tabs expose only Overview, btw and Files. */
	const isChat = useActiveTabKind() === "chat";
	const visibleTabs = isChat ? TABS.filter(tab => CHAT_PANEL_TABS.has(tab.id)) : TABS;
	const visiblePanelTab = isChat && !CHAT_PANEL_TABS.has(panelTab) ? "files" : panelTab;
	const terminalLabel = t("panel.tabs.terminal");
	const openTerminal = async () => {
		if (!activeTabId) return;
		try {
			const result = await window.omp.system.openTerminal(activeTabId);
			if (!result.ok) throw new Error(result.error);
		} catch (error) {
			toast({ variant: "error", message: t("terminal.openFailed", { error: describeError(error) }) });
		}
	};

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
			className="omp-inspector absolute inset-y-0 right-0 z-30 flex max-w-full flex-col border-l border-[var(--omp-border-muted)] shadow-xl"
			style={{ width: paneWidth > 0 ? panelWidth : "100%" }}
			onKeyDown={event => {
				if (
					event.key !== "Escape" ||
					event.defaultPrevented ||
					isImeKeyEvent(event) ||
					!event.currentTarget.contains(event.target as Node) ||
					document.querySelector('[role="dialog"]')
				) {
					return;
				}
				event.preventDefault();
				closePanel();
			}}
		>
			<header className="flex h-12 shrink-0 items-center border-b border-[var(--omp-border-muted)] px-3">
				<h2 className="sr-only">
					{t("panel.title")} - {t("panel.subtitle")}
				</h2>
				<div className="omp-segmented w-full">
					<Glide activeKey={visiblePanelTab} selector='[aria-pressed="true"]' variant="thumb" />
					{visibleTabs.map(({ id, labelKey, icon }) => (
						<InspectorTab
							key={id}
							label={t(labelKey)}
							icon={icon}
							active={visiblePanelTab === id}
							onSelect={() => setPanelTab(id)}
							ready={routeReady}
						/>
					))}
					{!isChat && (
						<button
							aria-label={terminalLabel}
							className="omp-pressable flex h-8 min-w-0 flex-1 items-center justify-center hover:bg-(--omp-selected-bg)"
							disabled={!routeReady || !activeTabId}
							onClick={() => void openTerminal()}
							title={terminalLabel}
							type="button"
						>
							<SquareTerminal aria-hidden size={14} />
						</button>
					)}
					<button
						aria-label={t("common.close")}
						className="omp-pressable flex h-8 min-w-0 flex-1 items-center justify-center hover:bg-(--omp-selected-bg)"
						onClick={closePanel}
						title={t("common.close")}
						type="button"
					>
						<X aria-hidden size={16} />
					</button>
				</div>
			</header>
			<div className="min-h-0 flex-1 overflow-hidden">
				{routeReady && (
					<PanelErrorBoundary key={JSON.stringify([activeTabId, cwd, visiblePanelTab])}>
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
