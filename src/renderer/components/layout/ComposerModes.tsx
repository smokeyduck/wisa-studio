import { ClipboardList, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type { RpcResponse, RpcSessionState } from "../../../shared/rpc-types";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { useTabRpc } from "../../lib/tab-rpc";
import { type SessionStore, useSessionStore } from "../../stores/session";
import { sessionRuntimeStore, useRuntimeTabId } from "../../stores/session-runtime-context";
import { type SettingsStore, useSettingsStore } from "../../stores/settings";
import { toast } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";

const triggerClass = (active: boolean) =>
	cx(
		"omp-pressable flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-omp-md font-medium",
		active
			? "border-[var(--omp-border-accent)] bg-[var(--omp-accent-dim)] text-[var(--omp-accent)]"
			: "border-transparent text-[var(--omp-muted)] hover:bg-[var(--omp-selected-bg)]",
	);

/** Mutations stay attached to the originating session, even after a tab switch. */
function useModeUpdate() {
	const t = useT();
	const rpc = useTabRpc();
	const tabId = useRuntimeTabId();
	const [pending, setPending] = useState(false);
	const update = async (action: () => Promise<RpcResponse>, mode: "settings" | "plan" | "prewalk" = "settings") => {
		if (pending) return;
		const session = sessionRuntimeStore<SessionStore>(tabId, "session") ?? useSessionStore;
		const settings = sessionRuntimeStore<SettingsStore>(tabId, "settings") ?? useSettingsStore;
		const originSession = session.getState().sessionId;
		setPending(true);
		try {
			const response = await action();
			if (!response.success) throw new Error(response.error);
			const data = response.data as { enabled?: boolean } | undefined;
			if (mode !== "settings" && typeof data?.enabled === "boolean") {
				if (session.getState().sessionId === originSession) {
					if (mode === "plan") session.setState({ planModeEnabled: data.enabled });
					else session.setState({ prewalkArmed: data.enabled });
				}
				return;
			}
			const current = await rpc.getState();
			if (!current.success) throw new Error(current.error);
			if (session.getState().sessionId !== originSession) return;
			const state = current.data as RpcSessionState;
			settings.getState().setFromState(state);
			session.setState({ planModeEnabled: state.planModeEnabled });
		} catch (cause) {
			toast({ variant: "error", title: t("modesPanel.actionFailed"), message: String(cause) });
		} finally {
			setPending(false);
		}
	};
	return { rpc, pending, update };
}

/** Active Plan can be disabled immediately; other session controls live in the sidebar. */
export function ComposerModes() {
	const t = useT();
	const { rpc, pending, update } = useModeUpdate();
	const plan = useSessionStore(state => state.planModeEnabled);
	const goal = useSessionStore(state => state.goalState?.status === "active" || !!state.goal);
	const loop = useSessionStore(state => state.loopMode?.enabled === true);
	const team = useSessionStore(state => state.vibeModeEnabled);
	const open = useUiStore(state => state.modesOpen);
	const openModes = useUiStore(state => state.openModes);
	const closeModes = useUiStore(state => state.closeModes);
	const active = [
		goal ? t("modesPanel.tabs.goal") : null,
		loop ? t("modesPanel.tabs.loop") : null,
		team ? t("modesPanel.tabs.vibe") : null,
	].filter((label): label is string => label !== null);
	const title = active.length ? t("input.modes.activeTitle", { modes: active.join(" - ") }) : t("modesPanel.title");
	return (
		<div className="flex items-center gap-2">
			{plan && (
				<button
					type="button"
					aria-pressed={plan}
					aria-label={t("input.plan.title")}
					title={t("input.plan.title")}
					disabled={pending}
					className={triggerClass(plan)}
					onClick={() => void update(() => rpc.setPlanMode(false), "plan")}
				>
					<ClipboardList aria-hidden size={14} />
					<span className="omp-composer-control-label">{t("input.plan.label")}</span>
				</button>
			)}
			<button
				type="button"
				data-session-controls-trigger
				aria-expanded={open}
				aria-label={title}
				title={title}
				className={triggerClass(open || active.length > 0)}
				onClick={() => (open ? closeModes() : openModes())}
			>
				<SlidersHorizontal aria-hidden size={14} />
				<span className="omp-composer-control-label">{t("input.modes.label")}</span>
				{active.length > 0 && (
					<span className="rounded-full bg-(--omp-btn-primary-bg) px-1.5 text-omp-xs leading-4 text-(--omp-btn-primary-text) tabular-nums">
						{active.length}
					</span>
				)}
			</button>
		</div>
	);
}

/** Plan and lower-frequency controls remain available inside the session sidebar. */
export function SessionModeOptions() {
	const t = useT();
	const { rpc, pending, update } = useModeUpdate();
	const plan = useSessionStore(state => state.planModeEnabled);
	const prewalk = useSessionStore(state => state.prewalkArmed);
	const autoCompaction = useSettingsStore(state => state.autoCompaction);
	const autoRetry = useSettingsStore(state => state.autoRetry);
	const steering = useSettingsStore(state => state.steeringMode);
	const interrupt = useSettingsStore(state => state.interruptMode);
	const openModelRoles = useUiStore(state => state.openModelRoles);
	return (
		<div className="shrink-0 border-t border-(--omp-border-muted) p-3">
			<details className="mt-2">
				<summary className="cursor-pointer text-omp-sm font-medium text-(--omp-muted)">
					{t("input.more.label")}
				</summary>
				<div className="mt-2" aria-busy={pending} inert={pending}>
					<MoreRow
						label={t("input.plan.label")}
						checked={plan}
						onToggle={() => void update(() => rpc.setPlanMode(!plan), "plan")}
					/>
					<MoreRow
						label={t("input.more.autoCompact")}
						checked={autoCompaction}
						onToggle={() => void update(() => rpc.setAutoCompaction(!autoCompaction))}
					/>
					<MoreRow
						label={t("input.more.autoRetry")}
						checked={autoRetry}
						onToggle={() => void update(() => rpc.setAutoRetry(!autoRetry))}
					/>
					<MoreRow
						label={t("cmd.prewalk")}
						checked={prewalk}
						onToggle={() => void update(() => rpc.setPrewalk(!prewalk), "prewalk")}
					/>
					<MoreRow
						label={t("input.more.steeringAll")}
						checked={steering === "all"}
						onToggle={() => void update(() => rpc.setSteeringMode(steering === "all" ? "one-at-a-time" : "all"))}
					/>
					<MoreRow
						label={t("input.more.interruptImmediate")}
						checked={interrupt === "immediate"}
						onToggle={() =>
							void update(() => rpc.setInterruptMode(interrupt === "immediate" ? "wait" : "immediate"))
						}
					/>
					<button
						type="button"
						className="omp-pressable mt-2 w-full rounded-md px-2.5 py-2 text-left text-omp-sm text-(--omp-text) hover:bg-(--omp-selected-bg)"
						onClick={openModelRoles}
					>
						{t("input.roles.label")}
					</button>
				</div>
			</details>
		</div>
	);
}

function MoreRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
	return (
		<button
			type="button"
			onClick={onToggle}
			role="switch"
			aria-checked={checked}
			className="omp-pressable flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-omp-md font-medium text-[var(--omp-muted)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)]"
		>
			<span className="min-w-0 break-words">{label}</span>
			<span
				className={cx(
					"relative h-4 w-7 shrink-0 rounded-full transition-colors",
					checked ? "bg-[var(--omp-switch-on)]" : "bg-[var(--omp-switch-off)]",
				)}
			>
				<span
					className={cx(
						"absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left]",
						checked ? "left-3.5" : "left-0.5",
					)}
				/>
			</span>
		</button>
	);
}
