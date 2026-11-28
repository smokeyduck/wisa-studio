import { ClipboardList, Diff, FolderTree, LayoutDashboard, MessageCircleQuestion, SquareTerminal } from "lucide-react";
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
import { useOverlayPresence } from "../../hooks/use-overlay-presence";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { isImeKeyEvent } from "../../lib/ime";
import { usePlanApprovalStore } from "../../stores/plan-approval";
import { useSessionStore } from "../../stores/session";
import { useActiveTabKind, useTabsStore } from "../../stores/tabs";
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
/** Keep the conversation readable when the inspector shares its row. */
const MIN_CONVERSATION_WIDTH = 560;
const PANEL_WIDTH_PREF = "gui.panelWidth";

const TABS: { id: PanelTab; labelKey: string; icon: typeof Diff }[] = [
	{ id: "overview", labelKey: "panel.tabs.overview", icon: LayoutDashboard },
	{ id: "plan", labelKey: "dock.plan", icon: ClipboardList },
	{ id: "btw", labelKey: "panel.tabs.btw", icon: MessageCircleQuestion },
	{ id: "diff", labelKey: "panel.tabs.diff", icon: Diff },
	{ id: "files", labelKey: "panel.tabs.files", icon: FolderTree },
	{ id: "terminal", labelKey: "panel.tabs.terminal", icon: SquareTerminal },
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
			className={cx(
				"relative flex h-8 min-w-0 items-center justify-center gap-1.5 px-2",
				active ? "flex-[2]" : "flex-1",
			)}
		>
			<Icon aria-hidden size={14} className="shrink-0" />
			{active && <span className="truncate text-omp-xs">{label}</span>}
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
export function PanelContainer({ open, split = false }: { open: boolean; split?: boolean }) {
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

	const panelRef = useRef<HTMLElement>(null);
	const { mounted, closing } = useOverlayPresence(open, panelRef, "drawer");
	const [paneWidth, setPaneWidth] = useState(0);
	const [width, setWidth] = useState<number | "full" | null>(null);
	const dragging = useRef(false);
	const minWidth = Math.min(MIN_WIDTH, paneWidth);
	const defaultWidth = Math.min(520, Math.max(380, paneWidth * 0.42));
	const requestedWidth = width === "full" ? paneWidth : (width ?? Math.max(MIN_WIDTH, Math.round(defaultWidth)));
	const docked = !split && width !== "full" && paneWidth >= MIN_WIDTH + MIN_CONVERSATION_WIDTH;
	const maxWidth = docked ? paneWidth - MIN_CONVERSATION_WIDTH : paneWidth;
	const panelWidth = Math.min(requestedWidth, maxWidth);
	const atLeftEdge = panelWidth === paneWidth;

	useLayoutEffect(() => {
		if (!mounted) return;
		const pane = panelRef.current?.parentElement;
		if (!pane) return;
		const measure = () => setPaneWidth(pane.clientWidth);
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(pane);
		return () => observer.disconnect();
	}, [mounted]);

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
			if (!open || !dragging.current || !bounds) return;
			setWidth(e.clientX <= bounds.left ? "full" : Math.max(minWidth, Math.round(bounds.right - e.clientX)));
		},
		[minWidth, open],
	);

	const endDrag = useCallback(() => {
		dragging.current = false;
	}, []);

	if (!mounted) return null;

	return (
		<aside
			data-tour="inspector"
			data-layout={docked ? "docked" : "overlay"}
			aria-busy={!routeReady}
			aria-hidden={closing || undefined}
			inert={closing}
			ref={panelRef}
			className={cx(
				"omp-inspector z-30 flex max-w-full shrink-0 flex-col border-l border-[var(--omp-border-muted)]",
				docked ? "relative" : "absolute inset-y-0 right-0 shadow-xl",
				closing && "pointer-events-none",
			)}
			style={{ width: paneWidth > 0 ? panelWidth : "100%" }}
			onKeyDown={event => {
				if (
					!open ||
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
				aria-valuemax={maxWidth}
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
								: Math.min(maxWidth, Math.max(minWidth, panelWidth + (event.key === "ArrowLeft" ? 24 : -24))),
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
