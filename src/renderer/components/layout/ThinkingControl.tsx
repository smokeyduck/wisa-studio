/** Composer reasoning slider. Only the active model's verified selectors are offered. */

import { Brain, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const { mounted, closing } = useOverlayPresence(open, menuRef, "popover");
	const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
	const rangeRef = useRef<HTMLInputElement>(null);
	const titleId = useId();
	const descriptionId = useId();
	const [draft, setDraft] = useState<ThinkingSelector>();
	const draftRef = useRef<ThinkingSelector | undefined>(undefined);
	const gestureRef = useRef<string | undefined>(undefined);
	const [pending, setPending] = useState(false);
	const pendingRef = useRef(false);

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

	// Keep the glass panel within the viewport, including during resize/scroll.
	useLayoutEffect(() => {
		if (!open) return;
		const position = () => {
			const rect = triggerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const width = Math.min(320, window.innerWidth - 24);
			setPos({
				left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
				bottom: Math.max(12, Math.min(window.innerHeight - rect.top + 8, window.innerHeight - 220)),
			});
		};
		position();
		window.addEventListener("resize", position);
		window.addEventListener("scroll", position, true);
		return () => {
			window.removeEventListener("resize", position);
			window.removeEventListener("scroll", position, true);
		};
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
			draftRef.current = undefined;
			gestureRef.current = undefined;
			setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (isImeKeyEvent(event)) return;
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopImmediatePropagation();
			draftRef.current = undefined;
			gestureRef.current = undefined;
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
		if (!open || pending) return;
		const frame = requestAnimationFrame(() => {
			(rangeRef.current && !rangeRef.current.disabled ? rangeRef.current : menuRef.current)?.focus();
		});
		return () => cancelAnimationFrame(frame);
	}, [open, pending]);

	const interactionContext = () => {
		const state = (modelStore ?? useModelStore).getState();
		return JSON.stringify([
			tabId ?? useTabsStore.getState().activeTabId,
			useSessionStore.getState().sessionId,
			state.model?.provider,
			state.model?.id,
			state.availableThinkingSelectors,
		]);
	};
	const beginGesture = () => {
		gestureRef.current ??= interactionContext();
	};
	const preview = draft && options.includes(draft) ? draft : (current ?? options[0]);
	const previewIndex = preview ? options.indexOf(preview) : 0;
	const commit = () => {
		const level = draftRef.current;
		const context = gestureRef.current;
		draftRef.current = undefined;
		gestureRef.current = undefined;
		if (context !== interactionContext()) {
			setDraft(undefined);
			return;
		}
		if (level && level !== current) select(level);
	};

	const select = (level: ThinkingSelector) => {
		const targetStore = modelStore ?? useModelStore;
		const { model, availableThinkingSelectors } = targetStore.getState();
		if (pendingRef.current || !availableThinkingSelectors.includes(level)) return;
		pendingRef.current = true;
		setPending(true);
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
			})
			.finally(() => {
				pendingRef.current = false;
				setPending(false);
				setDraft(undefined);
			});
	};

	return (
		<>
			<button
				data-tour="thinking"
				ref={triggerRef}
				type="button"
				aria-expanded={open}
				aria-haspopup="dialog"
				onClick={() => {
					setDraft(undefined);
					draftRef.current = undefined;
					gestureRef.current = undefined;
					setOpen(value => !value);
				}}
				title={
					current
						? t("input.thinking", { level: label })
						: supportsThinking
							? label
							: t("input.thinking.unsupported")
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
							style={{
								left: pos.left,
								bottom: pos.bottom,
								width: "min(320px, calc(100vw - 24px))",
								maxHeight: "calc(100vh - 24px)",
							}}
							aria-hidden={closing || undefined}
							role="dialog"
							aria-labelledby={titleId}
							tabIndex={-1}
							onBlur={event => {
								if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
									commit();
									setOpen(false);
								}
							}}
							inert={closing}
							className={cx(
								"omp-thinking-slider-panel fixed z-[100] overflow-auto rounded-2xl border border-[var(--omp-border)] bg-[var(--omp-panel-bg)] p-4 shadow-[var(--omp-shadow-md)] outline-none",
								closing && "pointer-events-none",
							)}
						>
							<div
								id={titleId}
								className="mb-3 flex items-center gap-2 text-omp-sm font-medium text-[var(--omp-muted)]"
							>
								<Brain size={14} />
								{t("input.thinking.label")}
							</div>
							{preview ? (
								<>
									<div className="flex items-baseline justify-between gap-3">
										<span
											className="font-mono text-lg font-semibold"
											style={{
												color: THEMED_LEVELS[preview]
													? `var(--omp-thinking-${preview})`
													: "var(--omp-accent)",
											}}
										>
											{t(`input.thinking.name.${preview}`)}
										</span>
										<span aria-hidden="true" className="font-mono text-omp-xs text-[var(--omp-dim)]">
											{previewIndex + 1} / {options.length}
										</span>
									</div>
									<p
										id={descriptionId}
										className="mt-1 min-h-10 text-omp-sm leading-snug text-[var(--omp-muted)]"
									>
										{t(`input.thinking.level.${preview}`)}
									</p>
									<input
										ref={rangeRef}
										type="range"
										min={0}
										max={Math.max(0, options.length - 1)}
										step={1}
										value={previewIndex}
										disabled={pending || options.length === 1}
										aria-label={t("input.thinking.label")}
										aria-valuetext={t(`input.thinking.name.${preview}`)}
										aria-describedby={descriptionId}
										className="omp-thinking-range my-3 block h-6 w-full cursor-pointer accent-[var(--omp-accent)] disabled:cursor-default disabled:opacity-50"
										onPointerDown={event => {
											beginGesture();
											event.currentTarget.setPointerCapture(event.pointerId);
										}}
										onInput={event => {
											beginGesture();
											const level = options[Number(event.currentTarget.value)];
											draftRef.current = level;
											setDraft(level);
										}}
										onPointerUp={commit}
										onPointerCancel={() => {
											draftRef.current = undefined;
											gestureRef.current = undefined;
											setDraft(undefined);
										}}
										onKeyDown={event => {
											if (isImeKeyEvent(event)) return;
											if (
												[
													"ArrowLeft",
													"ArrowRight",
													"ArrowUp",
													"ArrowDown",
													"Home",
													"End",
													"PageUp",
													"PageDown",
												].includes(event.key)
											)
												beginGesture();
											if (event.key === "Enter") {
												event.preventDefault();
												commit();
											}
										}}
										onKeyUp={event => {
											if (isImeKeyEvent(event)) return;
											if (
												[
													"ArrowLeft",
													"ArrowRight",
													"ArrowUp",
													"ArrowDown",
													"Home",
													"End",
													"PageUp",
													"PageDown",
												].includes(event.key)
											)
												commit();
										}}
									/>
									<div
										aria-hidden="true"
										className="flex justify-between gap-2 text-omp-xs text-[var(--omp-dim)]"
									>
										<span>{t(`input.thinking.name.${options[0]}`)}</span>
										{options.length > 1 && (
											<span className="text-right">
												{t(`input.thinking.name.${options[options.length - 1]}`)}
											</span>
										)}
									</div>
								</>
							) : (
								<p className="text-omp-md text-[var(--omp-muted)]">{t("input.thinking.unsupported")}</p>
							)}
						</div>,
						document.body,
					)
				: null}
		</>
	);
}
