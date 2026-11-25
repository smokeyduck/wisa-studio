/** Composer reasoning control. Only the active model's verified selectors reach the portal menu. */

import { Brain, Check, ChevronDown } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RpcThinkingLevelState, ThinkingLevel } from "../../../shared/rpc-types";
import { refreshModelState } from "../../hooks/session-hydration";
import { useOverlayPresence } from "../../hooks/use-overlay-presence";
import { isDevOverlayEvent } from "../../lib/dev-overlay";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { isImeKeyEvent } from "../../lib/ime";
import { useTabRpc } from "../../lib/tab-rpc";
import { type ModelStore, useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { sessionRuntimeStore, useRuntimeTabId } from "../../stores/session-runtime-context";
import { useTabsStore } from "../../stores/tabs";
import { toast } from "../../stores/toast";

type ThinkingSelector = ThinkingLevel | "auto";

/** Levels that have a themed colour var (`--omp-thinking-*`). */
const THEMED_LEVELS: Record<string, true> = {
	off: true,
	minimal: true,
	low: true,
	medium: true,
	high: true,
	xhigh: true,
};

export function ThinkingControl() {
	const t = useT();
	const rpc = useTabRpc();
	const tabId = useRuntimeTabId();
	const modelStore = sessionRuntimeStore<ModelStore>(tabId, "model");
	const thinkingLevel = useModelStore(s => s.thinkingLevel);
	const configured = useModelStore(s => s.thinkingConfigured);
	const options = useModelStore(s => s.availableThinkingSelectors);
	const modelDefault = useModelStore(s => s.model?.thinking?.defaultLevel);
	const [open, setOpen] = useState(false);
	const { mounted, closing } = useOverlayPresence(open);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

	const supportsThinking = options.length > 0;
	const selected =
		configured === "auto" && options.includes("auto")
			? configured
			: (thinkingLevel ?? (configured === "inherit" ? modelDefault : configured));
	const current = selected && options.includes(selected) ? selected : undefined;
	const label = current ? t(`input.thinking.name.${current}`) : t("input.thinking.label");
	const colorLevel = current && THEMED_LEVELS[current] ? current : "off";

	// Opening the menu re-reads the model state: the ladder belongs to the model,
	// and a stale store (a switch whose event never arrived, a tab hydrated while
	// another model was active) would otherwise offer the previous model's levels
	// — or claim the model does not reason at all. The read is cheap and the
	// store keeps the last good value if it fails.
	useEffect(() => {
		if (!open) return;
		void refreshModelState(tabId ?? undefined);
	}, [open, tabId]);

	// Position the portal menu above the trigger whenever it opens.
	useLayoutEffect(() => {
		if (!open || !triggerRef.current) return;
		const rect = triggerRef.current.getBoundingClientRect();
		setPos({ left: rect.left, bottom: window.innerHeight - rect.top + 6 });
	}, [open]);

	// Close on outside pointer press, and consume Escape: an open dropdown must
	// swallow the key (with focus restored to the trigger) instead of letting
	// the global handler abort a running turn.
	useEffect(() => {
		if (!open) return;
		const onDown = (event: PointerEvent) => {
			if (isDevOverlayEvent(event)) return;
			const target = event.target as Node;
			if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (isImeKeyEvent(event)) return;
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopImmediatePropagation();
			setOpen(false);
			triggerRef.current?.focus();
		};
		document.addEventListener("pointerdown", onDown);
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("pointerdown", onDown);
			document.removeEventListener("keydown", onKey, true);
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		requestAnimationFrame(() => {
			menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
		});
	}, [open]);

	const moveMenuFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
		const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
		if (items.length === 0) return;
		event.preventDefault();
		const current = items.indexOf(document.activeElement as HTMLButtonElement);
		const next =
			event.key === "Home"
				? 0
				: event.key === "End"
					? items.length - 1
					: (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
		items[next]?.focus();
	};

	const select = (level: ThinkingSelector) => {
		const targetStore = modelStore ?? useModelStore;
		const { model, availableThinkingSelectors } = targetStore.getState();
		if (!availableThinkingSelectors.includes(level)) return;
		setOpen(false);
		const fallbackTabId = useTabsStore.getState().activeTabId;
		const fallbackSessionId = useSessionStore.getState().sessionId;
		void rpc
			.setThinkingLevel(level)
			.then(res => {
				if (!res.success) {
					toast({ variant: "error", title: t("input.thinking.failed"), message: res.error });
					return;
				}
				// The receipt is authoritative after model support / session-ceiling
				// clamps. Apply it directly so a missed/batched event cannot leave the
				// selector visually stuck on its previous value.
				const state = res.data as RpcThinkingLevelState | undefined;
				if (!state) return;
				if (
					!modelStore &&
					(useTabsStore.getState().activeTabId !== fallbackTabId ||
						useSessionStore.getState().sessionId !== fallbackSessionId)
				)
					return;
				const currentModel = targetStore.getState().model;
				if (currentModel?.provider !== model?.provider || currentModel?.id !== model?.id) return;
				targetStore.setState({
					thinkingLevel: state.thinkingLevel,
					thinkingConfigured: state.thinkingConfigured,
				});
			})
			.catch(error => {
				toast({ variant: "error", title: t("input.thinking.failed"), message: String(error) });
			});
	};

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				aria-expanded={open}
				aria-haspopup="menu"
				onClick={() => setOpen(value => !value)}
				title={
					current ? t("input.thinking", { level: label }) : supportsThinking ? label : t("input.thinking.unsupported")
				}
				className="omp-pressable flex h-8 items-center gap-1.5 rounded-full px-2.5 text-omp-md font-medium hover:bg-[var(--omp-selected-bg)]"
				style={{ color: `var(--omp-thinking-${colorLevel})` }}
			>
				<Brain size={14} />
				<span className="omp-composer-control-label hidden sm:inline">{label}</span>
				<ChevronDown size={12} className="shrink-0 text-[var(--omp-dim)]" />
			</button>

			{mounted && pos
				? createPortal(
						<div
							ref={menuRef}
							style={{ left: pos.left, bottom: pos.bottom }}
							aria-hidden={closing || undefined}
							role="menu"
							onKeyDown={moveMenuFocus}
							inert={closing}
							className={cx(
								"fixed z-[100] w-64 overflow-hidden rounded-xl border border-[var(--omp-border)] bg-[var(--omp-panel-bg)] p-1 shadow-[var(--omp-shadow-md)]",
								closing ? "omp-scale-out pointer-events-none" : "omp-pop-in",
							)}
						>
							{supportsThinking ? (
								options.map(option => {
									const active = option === current;
									return (
										<button
											key={option}
											type="button"
											role="menuitemradio"
											aria-checked={active}
											onClick={() => select(option)}
											className="omp-pressable flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--omp-selected-bg)]"
										>
											<span className="mt-0.5 w-4 shrink-0 text-[var(--omp-accent)]">
												{active ? <Check size={14} /> : null}
											</span>
											<span className="min-w-0 flex-1">
												<span
													className={cx(
														"block font-mono text-omp-md font-medium",
														!active && "text-[var(--omp-muted)]",
													)}
													style={
														option === "auto" || !THEMED_LEVELS[option]
															? undefined
															: { color: `var(--omp-thinking-${option})` }
													}
												>
													{t(`input.thinking.name.${option}`)}
												</span>
												<span className="block text-omp-sm leading-snug text-[var(--omp-dim)]">
													{t(`input.thinking.level.${option}`)}
												</span>
											</span>
										</button>
									);
								})
							) : (
								<div className="px-2.5 py-2 text-omp-md text-[var(--omp-muted)]">
									{t("input.thinking.unsupported")}
								</div>
							)}
						</div>,
						document.body,
					)
				: null}
		</>
	);
}
