import "@xterm/xterm/css/xterm.css";
import { Bot, Plus, SquareTerminal, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RpcTerminalInfo } from "../../../shared/rpc-types";
import { describeError } from "../../lib/errors";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { scrollStripOnWheel, useActiveChipInView } from "../../lib/strip-scroll";
import { useRuntimeTabId } from "../../stores/session-runtime-context";
import { useTabsStore } from "../../stores/tabs";
import {
	closeTerminal,
	setActiveTerminal,
	syncTerminals,
	terminalView,
	useTabTerminals,
	useTerminalsStore,
} from "../../stores/terminals";
import { toast } from "../../stores/toast";
import { PanelEmpty } from "./workspace-ui";

function TerminalChip({
	terminal,
	active,
	onSelect,
	onClose,
}: {
	terminal: RpcTerminalInfo;
	active: boolean;
	onSelect: () => void;
	onClose: () => void;
}) {
	const t = useT();
	const agent = terminal.kind !== "shell";
	const Icon = agent ? Bot : SquareTerminal;
	const ref = useActiveChipInView<HTMLDivElement>(active);
	const where = [terminal.title, terminal.host && `ssh ${terminal.host}`, terminal.cwd].filter(Boolean).join(" - ");
	// A session shows what it is doing: running the agent's command, or waiting for the user.
	const busy = terminal.running && (terminal.state === "busy" || terminal.state === "starting");
	const asking = terminal.running && terminal.state === "input";
	return (
		<div
			ref={ref}
			className={cx(
				"group flex h-7 max-w-44 shrink-0 items-center gap-1 rounded-md pr-0.5 pl-2 text-omp-sm",
				active ? "bg-(--omp-selected-bg) text-(--omp-text)" : "text-(--omp-muted) hover:text-(--omp-text)",
			)}
		>
			<button
				type="button"
				aria-pressed={active}
				onClick={onSelect}
				title={terminal.kind === "command" ? terminal.title : where}
				className="flex min-w-0 items-center gap-1.5"
			>
				<Icon aria-hidden="true" size={13} className={cx("shrink-0", agent && "text-(--omp-accent)")} />
				<span className={cx("truncate", !terminal.running && "text-(--omp-dim) line-through")}>
					{terminal.title}
				</span>
				{terminal.root && terminal.running && (
					<span className="shrink-0 rounded px-1 text-omp-xxs font-medium text-(--omp-error) ring-1 ring-(--omp-error)/40">
						root
					</span>
				)}
				{(busy || asking) && (
					<span
						data-session-state={terminal.state}
						role="img"
						aria-label={t(asking ? "terminal.state.input" : "terminal.state.busy")}
						title={t(asking ? "terminal.state.input" : "terminal.state.busy")}
						className={cx(
							"shrink-0",
							asking
								? "size-1.5 rounded-full bg-(--omp-warning)"
								: "omp-signal-light omp-signal-light--active text-(--omp-accent)",
						)}
					/>
				)}
			</button>
			<button
				type="button"
				aria-label={t("terminal.close")}
				title={t("terminal.close")}
				onClick={onClose}
				className="flex size-5 shrink-0 items-center justify-center rounded text-(--omp-dim) opacity-0 hover:bg-(--omp-selected-bg) hover:text-(--omp-text) group-hover:opacity-100 focus-visible:opacity-100"
			>
				<X size={12} />
			</button>
		</div>
	);
}

/** What an agent session is: the agent's shell, a question waiting on the user, a root shell. */
function SessionNotice({ terminal }: { terminal: RpcTerminalInfo }) {
	const t = useT();
	if (terminal.state === "input") {
		return (
			<p
				data-session-notice="input"
				className="shrink-0 border-b border-(--omp-border-muted) bg-(--omp-warning-dim) px-3 py-1.5 text-omp-xs text-(--omp-text)"
			>
				{t("terminal.sessionInput")}
			</p>
		);
	}
	return (
		<p className="shrink-0 border-b border-(--omp-border-muted) bg-(--omp-accent-dim) px-3 py-1.5 text-omp-xs text-(--omp-text)">
			{terminal.host ? t("terminal.sessionRemote", { host: terminal.host }) : t("terminal.session")}
			{terminal.root && <span className="text-(--omp-error)"> {t("terminal.sessionRoot")}</span>}
		</p>
	);
}

/** Embedded Core terminals and user-initiated workspace shells. */
export function TerminalPanel() {
	const t = useT();
	const activeTabId = useTabsStore(state => state.activeTabId);
	const tabId = useRuntimeTabId() ?? activeTabId;
	const sidecarUp = useTabsStore(state => {
		const status = state.tabs.find(tab => tab.id === tabId)?.status;
		return status === "ready" || status === "running";
	});
	const { terminals, activeId } = useTabTerminals(tabId);
	const active = terminals.find(terminal => terminal.terminalId === activeId) ?? null;
	const containerRef = useRef<HTMLDivElement>(null);
	const [opening, setOpening] = useState(false);
	const openShell = async () => {
		if (!tabId || !sidecarUp || opening) return;
		const previous = useTerminalsStore.getState().byTab[tabId]?.terminals ?? [];
		setOpening(true);
		try {
			const response = await window.omp.rpc.commandForTab(tabId, { type: "terminal_open" });
			if (!response.success) throw new Error(response.error);
			await syncTerminals(tabId);
			const shell = useTerminalsStore
				.getState()
				.byTab[tabId]?.terminals.find(
					terminal =>
						terminal.kind === "shell" && !previous.some(existing => existing.terminalId === terminal.terminalId),
				);
			if (shell) setActiveTerminal(tabId, shell.terminalId);
		} catch (error) {
			toast({ variant: "error", message: t("terminal.openFailed", { error: describeError(error) }) });
		} finally {
			setOpening(false);
		}
	};

	// Adopt Core terminals that started before the panel was shown.
	useEffect(() => {
		if (tabId && sidecarUp) void syncTerminals(tabId);
	}, [tabId, sidecarUp]);

	// Show the active terminal's xterm and keep it sized to the drawer.
	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!tabId || !activeId || !container) return;
		const view = terminalView(tabId, activeId);
		if (!view) return;
		container.appendChild(view.host);
		if (!view.opened) {
			view.term.open(view.host);
			view.opened = true;
		}
		const fitToContainer = (): void => {
			if (container.clientWidth === 0 || container.clientHeight === 0) return;
			try {
				view.fit.fit();
			} catch {
				// xterm measures fonts on first paint; the next resize fits it.
			}
		};
		fitToContainer();
		view.term.focus();
		const observer = new ResizeObserver(fitToContainer);
		observer.observe(container);
		return () => {
			observer.disconnect();
			view.host.remove();
		};
	}, [tabId, activeId]);

	return (
		<div className="flex h-full flex-col">
			<span className="sr-only">{t("panel.tabs.terminal")}</span>
			<div
				onWheel={scrollStripOnWheel}
				className="omp-tab-scroller flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-(--omp-border-muted) px-2"
			>
				{tabId &&
					terminals.map(terminal => (
						<TerminalChip
							key={terminal.terminalId}
							terminal={terminal}
							active={terminal.terminalId === activeId}
							onSelect={() => setActiveTerminal(tabId, terminal.terminalId)}
							onClose={() => void closeTerminal(tabId, terminal.terminalId)}
						/>
					))}
				<button
					type="button"
					aria-label={t("terminal.newShell")}
					title={t("terminal.newShell")}
					disabled={!tabId || !sidecarUp || opening}
					onClick={() => void openShell()}
					className="omp-pressable flex size-7 shrink-0 items-center justify-center rounded-md text-(--omp-muted) hover:bg-(--omp-selected-bg) hover:text-(--omp-text) disabled:opacity-40"
				>
					<Plus aria-hidden size={14} />
				</button>
			</div>
			{active?.kind === "session" && active.running ? (
				<SessionNotice terminal={active} />
			) : (
				active?.kind !== "shell" &&
				active?.running && (
					<p className="shrink-0 border-b border-(--omp-border-muted) bg-(--omp-accent-dim) px-3 py-1.5 text-omp-xs text-(--omp-text)">
						{t(active.kind === "command" ? "terminal.agentWaiting" : "terminal.agentBackground")}
					</p>
				)
			)}
			{active ? (
				<div className="omp-terminal-viewport min-h-0 flex-1 bg-(--omp-code-bg) py-1.5 pl-2" ref={containerRef} />
			) : (
				<div className="min-h-0 flex-1 overflow-auto">
					<PanelEmpty
						icon={SquareTerminal}
						title={sidecarUp ? t("terminal.emptyTitle") : t("terminal.unavailableTitle")}
						hint={sidecarUp ? undefined : t("terminal.unavailableHint")}
					/>
				</div>
			)}
		</div>
	);
}
