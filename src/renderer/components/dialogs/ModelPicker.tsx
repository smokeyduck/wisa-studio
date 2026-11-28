import { useTabRpc } from "../../lib/tab-rpc";
/**
 * Model picker: manufacturer sections with search and provider/auth metadata.
 * Selection retains the original provider and model id.
 */

import { Check, ChevronRight, Plus, Search, TriangleAlert } from "lucide-react";
import {
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useEffectEvent,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import type { LoginProvider, ModelInfo } from "../../../shared/rpc-types";
import { applyModelInfo, hydrateSession } from "../../hooks/use-rpc-events";
import { isDevOverlayEvent } from "../../lib/dev-overlay";
import { describeProviderError } from "../../lib/errors";
import { cx, formatTokens } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { isImeKeyEvent } from "../../lib/ime";
import { modelLabel } from "../../lib/model-label";
import { manufacturerLabel } from "../../lib/model-manufacturer";
import { rememberModelPick } from "../../lib/model-preference";
import { manufacturerIcon, providerLabel } from "../../lib/provider-brand";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { useRuntimeTabId } from "../../stores/session-runtime-context";
import { toast } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";
import { Badge, Spinner } from "../common";

/**
 * Panel geometry. The picker is one column of two-line rows, 368px wide (half
 * the earlier 736px card). It stops short of the window edges and of the space
 * left above or below the composer. The `w-[min(23rem,…)]` and
 * `max-h-[min(70vh,44rem)]` classes declare the same intent for CSS-only
 * readers; the inline style below wins for placement.
 */
const PANEL_MAX_WIDTH_PX = 23 * 16;
const PANEL_MAX_HEIGHT_PX = 44 * 16;
/** Share of the viewport height the list may claim before it scrolls. */
const PANEL_VIEWPORT_HEIGHT = 0.7;

// Editorial popularity order, not live usage/market-share data. Unlisted makers
// and connection-only groups follow alphabetically; routing ids stay untouched.
const MANUFACTURER_PRIORITY = new Map(
	[
		"openai",
		"anthropic",
		"google",
		"deepseek",
		"qwen",
		"xai",
		"meta",
		"mistral",
		"moonshot",
		"zai",
		"minimax",
		"nvidia",
		"stepfun",
		"capcut",
	].map((name, index) => [name, index]),
);

function modelTrigger(tabId: string | null | undefined): HTMLButtonElement | undefined {
	return Array.from(document.querySelectorAll<HTMLButtonElement>("[data-model-picker-trigger]")).find(
		button => button.dataset.modelPickerTrigger === (tabId ?? "") && button.getClientRects().length > 0,
	);
}

function modelKey(provider: string, id: string): string {
	return JSON.stringify([provider, id]);
}

export function ModelPicker() {
	const tabRpc = useTabRpc();
	const tabId = useRuntimeTabId();
	const t = useT();
	const open = useUiStore(state => state.modelPickerOpen);
	const close = useUiStore(state => state.closeModelPicker);
	const catalog = useModelStore(state => state.availableModels);
	const refreshPending = useModelStore(state => state.catalogRefreshPending);
	const current = useModelStore(state => state.model);
	const refreshAvailableModels = useModelStore(state => state.refreshAvailableModels);
	const openProviders = useUiStore(state => state.openProviders);
	// Live session usage: models whose window is smaller render with an
	// over-context warning and compact-first on pick (TUI markOverContext parity).
	const contextUsage = useSessionStore(state => state.contextUsage);
	const sidecarReady = useSessionStore(state => state.status) === "ready";
	// A cold tab already knows its live model. Keep it usable while the first
	// catalog read is in flight or the sidecar has only a partial catalog.
	const availableModels = useMemo(() => {
		if (
			current &&
			(catalog.length === 0 ||
				(refreshPending && !catalog.some(model => model.provider === current.provider && model.id === current.id)))
		) {
			return [current, ...catalog];
		}
		return catalog;
	}, [catalog, current, refreshPending]);

	const [query, setQuery] = useState("");
	const [login, setLogin] = useState<{ rpc: typeof tabRpc; providers: LoginProvider[] }>();
	const [switching, setSwitching] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const restoreFocus = useRef<HTMLElement | null>(null);
	const [position, setPosition] = useState<CSSProperties>();
	const listboxId = useId();
	/** Every manufacturer is visible initially; only explicit user collapses persist. */
	const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
	const [searchCollapsed, setSearchCollapsed] = useState<ReadonlySet<string>>(() => new Set());

	const requestVersion = useRef(0);

	const dismiss = useCallback(() => {
		if (!useUiStore.getState().modelPickerOpen) return;
		close();
		restoreFocus.current?.focus({ preventScroll: true });
	}, [close]);

	useLayoutEffect(() => {
		if (!open) return;
		const anchor = modelTrigger(tabId);
		const fallback = document.querySelector<HTMLElement>(".omp-workspace-main");
		const composer = anchor?.closest(".omp-composer-box");
		restoreFocus.current = anchor ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
		const place = () => {
			const rect = anchor?.getBoundingClientRect();
			const workspace = fallback?.getBoundingClientRect();
			const width = Math.min(PANEL_MAX_WIDTH_PX, Math.max(0, window.innerWidth - 32));
			const left = Math.max(12, Math.min(rect?.left ?? (workspace?.left ?? 0) + 16, window.innerWidth - width - 12));
			const above = (composer?.getBoundingClientRect().top ?? rect?.top ?? window.innerHeight - 60) - 8;
			const below = (rect?.bottom ?? 0) + 8;
			const spaceAbove = above - 12;
			const spaceBelow = window.innerHeight - below - 12;
			// Tall enough to show several groups, but never taller than the room
			// on the side it opens toward.
			const cap = Math.min(PANEL_MAX_HEIGHT_PX, window.innerHeight * PANEL_VIEWPORT_HEIGHT);
			setPosition(
				spaceAbove >= 200 || spaceAbove >= spaceBelow
					? { left, width, bottom: window.innerHeight - above, maxHeight: Math.min(cap, spaceAbove) }
					: { left, width, top: below, maxHeight: Math.min(cap, spaceBelow) },
			);
		};
		const closeOutside = (event: PointerEvent | FocusEvent) => {
			// Activating the dev feedback overlay moves focus into its shadow root;
			// without this the picker shut the moment Ctrl+Shift+F was pressed, and
			// the menu the user wanted to annotate vanished.
			if (isDevOverlayEvent(event)) return;
			const target = event.target;
			if (target instanceof Node && (panelRef.current?.contains(target) || anchor?.contains(target))) return;
			close();
		};
		const onEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented || isImeKeyEvent(event)) return;
			event.preventDefault();
			dismiss();
		};
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
		if (fallback) observer?.observe(fallback);
		if (composer) observer?.observe(composer);
		place();
		window.addEventListener("resize", place);
		document.addEventListener("pointerdown", closeOutside);
		document.addEventListener("focusin", closeOutside);
		document.addEventListener("keydown", onEscape);
		return () => {
			observer?.disconnect();
			window.removeEventListener("resize", place);
			document.removeEventListener("pointerdown", closeOutside);
			document.removeEventListener("focusin", closeOutside);
			document.removeEventListener("keydown", onEscape);
		};
	}, [close, dismiss, open, tabId]);

	// Keep showing the scoped catalog while discovery revalidates it. Reads and
	// model_catalog_update pushes share the store's generation guard.
	const load = useCallback(
		async (forceRefresh = false, failedCopy?: string): Promise<void> => {
			const version = ++requestVersion.current;
			setLoading(true);
			setError(null);
			if (!sidecarReady) {
				setError(t("modelPicker.notConnected"));
				setLoading(false);
				return;
			}
			try {
				await refreshAvailableModels(forceRefresh);
			} catch (cause) {
				if (version === requestVersion.current) setError(failedCopy ?? describeProviderError(cause));
			} finally {
				if (version === requestVersion.current) setLoading(false);
			}
		},
		[refreshAvailableModels, sidecarReady, t],
	);
	const loadOnOpen = useEffectEvent(() => {
		if (sidecarReady && refreshPending) {
			// The in-progress discovery will push its completed snapshot. Another
			// read would only queue behind that discovery and delay model switches.
			setLoading(false);
			setError(null);
			return;
		}
		void load();
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset search and focus when the open picker changes tab.
	useEffect(() => {
		if (!open) return undefined;
		setQuery("");
		setSearchCollapsed(new Set());
		setActiveIndex(0);
		const frame = requestAnimationFrame(() => inputRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, [open, tabId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reload when the tab or its connection changes; not on catalog pushes.
	useEffect(() => {
		if (!open) return;
		loadOnOpen();
		return () => {
			requestVersion.current++;
		};
	}, [open, sidecarReady, tabId]);

	useEffect(() => {
		if (!open || !sidecarReady) return;
		let cancelled = false;
		void tabRpc
			.getLoginProviders()
			.then(response => {
				if (cancelled || !response.success) return;
				const data = response.data as { providers?: LoginProvider[] } | undefined;
				setLogin({ rpc: tabRpc, providers: data?.providers ?? [] });
			})
			.catch(() => {
				// Auth badges are auxiliary; a failed auth read does not block the catalog.
			});
		return () => {
			cancelled = true;
		};
	}, [open, sidecarReady, tabRpc]);

	const authByProvider = useMemo(() => {
		const map = new Map<string, LoginProvider>();
		if (login?.rpc === tabRpc) for (const provider of login.providers) map.set(provider.id, provider);
		return map;
	}, [login, tabRpc]);

	/** Manufacturer-first index; unknown routes stay under their connection label. */
	const groups = useMemo(() => {
		const q = query.trim().toLowerCase();
		const map = new Map<string, { manufacturer: string; models: ModelInfo[] }>();
		for (const model of availableModels) {
			const manufacturer = manufacturerLabel(model);
			const connection = providerLabel(model.provider);
			if (
				q &&
				!model.id.toLowerCase().includes(q) &&
				!model.provider.toLowerCase().includes(q) &&
				!model.name?.toLowerCase().includes(q) &&
				!model.description?.toLowerCase().includes(q) &&
				!connection.toLowerCase().includes(q) &&
				!manufacturer.toLowerCase().includes(q)
			) {
				continue;
			}
			const label = manufacturer || connection;
			const group = map.get(label);
			if (group) {
				group.models.push(model);
				if (manufacturer) group.manufacturer = manufacturer;
			} else {
				map.set(label, { manufacturer, models: [model] });
			}
		}
		for (const { models } of map.values()) {
			models.sort((a, b) => {
				const aInt = a.int != null && Number.isFinite(a.int) ? a.int : -Infinity;
				const bInt = b.int != null && Number.isFinite(b.int) ? b.int : -Infinity;
				if (aInt !== bInt) return aInt > bInt ? -1 : 1;
				return (
					(modelLabel(a) ?? a.id).localeCompare(modelLabel(b) ?? b.id) ||
					a.id.localeCompare(b.id) ||
					a.provider.localeCompare(b.provider)
				);
			});
		}
		return [...map.entries()].sort(([a, aGroup], [b, bGroup]) => {
			const aRank =
				MANUFACTURER_PRIORITY.get(aGroup.manufacturer.toLowerCase().replace(/[^a-z0-9]+/g, "")) ??
				MANUFACTURER_PRIORITY.size;
			const bRank =
				MANUFACTURER_PRIORITY.get(bGroup.manufacturer.toLowerCase().replace(/[^a-z0-9]+/g, "")) ??
				MANUFACTURER_PRIORITY.size;
			return aRank - bRank || a.localeCompare(b);
		});
	}, [availableModels, query]);

	const searching = query.trim().length > 0;
	const openGroupSet = useMemo(
		() =>
			new Set(
				groups.map(([label]) => label).filter(label => !(searching ? searchCollapsed : collapsedGroups).has(label)),
			),
		[collapsedGroups, groups, searchCollapsed, searching],
	);

	const toggleGroup = (label: string) => {
		const toggle = (prev: ReadonlySet<string>): ReadonlySet<string> => {
			const next = new Set(prev);
			if (!next.delete(label)) next.add(label);
			return next;
		};
		if (searching) setSearchCollapsed(toggle);
		else setCollapsedGroups(toggle);
	};

	// Flat row order over open groups (group order → in-group order) for keyboard navigation.
	const flatOptions = useMemo(
		() =>
			groups
				.filter(([label]) => openGroupSet.has(label))
				.flatMap(([, { models }]) =>
					models.map(model => ({
						provider: model.provider,
						modelId: model.id,
						key: modelKey(model.provider, model.id),
					})),
				),
		[groups, openGroupSet],
	);
	const indexByKey = useMemo(() => new Map(flatOptions.map((option, index) => [option.key, index])), [flatOptions]);

	// Clamp the highlight when the visible list shrinks (search, reload).
	useEffect(() => {
		setActiveIndex(index => Math.min(index, Math.max(0, flatOptions.length - 1)));
	}, [flatOptions.length]);

	useEffect(() => {
		listRef.current?.querySelector(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);

	const isOverContext = (model: ModelInfo): boolean => {
		const tokens = contextUsage?.tokens ?? 0;
		const contextWindow = model.contextWindow ?? 0;
		return tokens > 0 && contextWindow > 0 && tokens > contextWindow;
	};

	const select = async (provider: string, modelId: string) => {
		if (!sidecarReady || switching !== null) return;
		const key = modelKey(provider, modelId);
		setSwitching(key);
		try {
			// TUI parity: picking a model whose context window is smaller than the
			// live session usage compacts with the CURRENT model first, then
			// switches. The row carries the over-context warning before the pick.
			const target = availableModels.find(m => m.provider === provider && m.id === modelId);
			const overContext = target !== undefined && isOverContext(target);
			if (overContext) {
				const compactRes = await tabRpc.compact();
				if (!compactRes.success) {
					toast({ variant: "error", title: t("modelPicker.compactFailed"), message: compactRes.error });
					return;
				}
				toast({ variant: "info", message: t("modelPicker.compactedSwitching") });
			}
			const response = await tabRpc.setModel(provider, modelId);
			if (!response.success) {
				toast({ variant: "error", title: t("modelPicker.failed"), message: response.error });
				return;
			}
			// The response carries the sidecar's live model. Applying it here covers
			// the switch that emits no model_changed at all — re-picking the current
			// model is a server-side no-op, so the event channel can never heal a
			// stale label.
			if (tabId) applyModelInfo(response.data, tabId);
			// A deliberate pick is the only signal of taste this app gets, so a
			// fresh session can later open on what the user actually reaches for.
			rememberModelPick(provider, modelId);
			// Compaction rewrote the transcript — rehydrate so the chat and the
			// context bar reflect the compacted session, not just the new model.
			if (overContext) await hydrateSession();
			dismiss();
		} catch (cause) {
			toast({ variant: "error", title: t("modelPicker.failed"), message: String(cause) });
		} finally {
			setSwitching(null);
		}
	};

	const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (isImeKeyEvent(event)) return;
		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();
				setActiveIndex(index => Math.min(index + 1, Math.max(0, flatOptions.length - 1)));
				break;
			case "ArrowUp":
				event.preventDefault();
				setActiveIndex(index => Math.max(index - 1, 0));
				break;
			case "Home":
				event.preventDefault();
				setActiveIndex(0);
				break;
			case "End":
				event.preventDefault();
				setActiveIndex(Math.max(0, flatOptions.length - 1));
				break;
			case "Enter": {
				event.preventDefault();
				const option = flatOptions[activeIndex];
				if (option) void select(option.provider, option.modelId);
				break;
			}
		}
	};

	const showOptions = groups.length > 0;
	const refreshing = !error && (loading || (sidecarReady && refreshPending));

	if (!open) return null;
	return createPortal(
		<div
			data-tour="model"
			aria-label={t("modelPicker.searchLabel")}
			className="omp-pop-in fixed z-[100] flex max-h-[min(70vh,44rem)] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-(--omp-border) bg-(--omp-bg-elevated) shadow-(--omp-shadow-md)"
			id="omp-model-picker"
			ref={panelRef}
			role="region"
			style={position ?? { visibility: "hidden" }}
		>
			<div className="flex min-h-0 flex-col">
				<div className="flex items-center gap-2.5 border-b border-(--omp-border-muted) px-3.5 py-2.5">
					<Search className="shrink-0 text-(--omp-dim)" size={14} />
					<input
						aria-activedescendant={flatOptions.length > 0 ? `${listboxId}-option-${activeIndex}` : undefined}
						aria-controls={listboxId}
						aria-label={t("modelPicker.searchLabel")}
						className="min-w-0 flex-1 bg-transparent text-omp-md text-(--omp-text) placeholder:text-(--omp-dim) focus:outline-none"
						onChange={event => {
							setQuery(event.target.value);
							setSearchCollapsed(new Set());
						}}
						onKeyDown={onKeyDown}
						placeholder={t("modelPicker.placeholder")}
						ref={inputRef}
						value={query}
					/>
					{refreshing && showOptions && (
						<span title={t("modelPicker.loading")} role="status" aria-label={t("modelPicker.loading")}>
							<Spinner size="sm" />
						</span>
					)}
				</div>
				{error && (
					<div
						className={cx(
							"flex flex-col items-center gap-2 px-3 text-center",
							availableModels.length > 0 ? "border-b border-(--omp-border-muted) py-2" : "py-10",
						)}
					>
						<span className="text-omp-xs text-(--omp-error)" role="status">
							{error}
						</span>
						{availableModels.length === 0 && (
							<span className="text-omp-xs text-(--omp-dim)">{t("modelPicker.notRespondingHint")}</span>
						)}
						<button
							type="button"
							className="rounded-md border border-(--omp-border-muted) px-3 py-1 text-omp-sm font-medium text-(--omp-text) hover:bg-(--omp-selected-bg)"
							onClick={() => void load(true, t("modelPicker.stillNotResponding"))}
							disabled={!sidecarReady}
						>
							{t("modelPicker.retry")}
						</button>
					</div>
				)}
				<div
					aria-busy={refreshing}
					className="min-h-0 flex-1 overflow-y-auto p-1.5"
					id={listboxId}
					ref={listRef}
					role={showOptions ? "listbox" : undefined}
				>
					{!showOptions && refreshing ? (
						<div className="flex items-center justify-center gap-2 py-10">
							<Spinner size="sm" />
							<span className="text-omp-xs text-(--omp-dim)">{t("modelPicker.loading")}</span>
						</div>
					) : availableModels.length === 0 ? (
						error ? null : (
							<div className="py-10 text-center text-omp-xs text-(--omp-dim)">{t("modelPicker.empty")}</div>
						)
					) : !showOptions ? (
						<div className="py-10 text-center text-omp-xs text-(--omp-dim)">
							{t("modelPicker.noMatch", { query })}
						</div>
					) : (
						groups.map(([label, { manufacturer, models }], groupIndex) => {
							const expanded = openGroupSet.has(label);
							const groupId = `${listboxId}-group-${groupIndex}`;
							const BrandIcon = manufacturerIcon(manufacturer);
							return (
								<section aria-label={label} className="mb-1" key={label} role="group">
									<h3 className="flex items-center gap-2 px-1 pt-2">
										<button
											aria-controls={expanded ? groupId : undefined}
											aria-expanded={expanded}
											className="omp-pressable flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-(--omp-bg-tertiary)"
											onClick={() => toggleGroup(label)}
											type="button"
										>
											<ChevronRight
												aria-hidden="true"
												className={cx(
													"omp-disclosure-chevron shrink-0 text-(--omp-dim)",
													expanded && "rotate-90",
												)}
												size={14}
											/>
											<BrandIcon className="shrink-0 text-(--omp-text)" size={16} />
											<span className="truncate text-omp-md font-bold text-(--omp-text)">
												{label}
											</span>
											{!expanded &&
												models.some(
													model => current?.provider === model.provider && current.id === model.id,
												) && (
													<Check aria-hidden="true" className="shrink-0 text-(--omp-accent)" size={12} />
												)}
											<span className="text-omp-xxs font-normal tabular-nums text-(--omp-dim)">
												{models.length}
											</span>
										</button>
										<span aria-hidden="true" className="h-px min-w-2 flex-1 bg-(--omp-border-muted)" />
									</h3>
									{expanded && (
										<div className="mt-0.5" id={groupId}>
											{models.map(model => {
												const provider = model.provider;
												const auth = authByProvider.get(provider);
												const connection = providerLabel(provider);
												const isCurrent = current?.provider === provider && current.id === model.id;
												const key = modelKey(provider, model.id);
												const optionIndex = indexByKey.get(key) ?? 0;
												const isActive = optionIndex === activeIndex;
												const over = !isCurrent && isOverContext(model);
												// Same rule as the composer trigger: a catalog name wins,
												// otherwise the id is prettified for display only.
												const label = modelLabel(model) ?? model.id;
												return (
													<div key={key}>
														<button
															aria-selected={isCurrent}
															className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors ${
																isActive ? "bg-(--omp-selected-bg)" : "hover:bg-(--omp-bg-tertiary)"
															}`}
															data-option-index={optionIndex}
															disabled={switching !== null || !sidecarReady}
															title={!sidecarReady ? t("modelPicker.notConnected") : undefined}
															id={`${listboxId}-option-${optionIndex}`}
															onClick={() => void select(provider, model.id)}
															onMouseEnter={() => setActiveIndex(optionIndex)}
															role="option"
															type="button"
														>
															<div className="flex min-w-0 flex-1 flex-col gap-0.5">
																<div className="flex min-w-0 items-center gap-1.5">
																	<span
																		className={`truncate text-omp-xs ${isCurrent ? "font-semibold text-(--omp-accent)" : over ? "text-(--omp-dim)" : "text-(--omp-text)"}`}
																		title={label === model.id ? undefined : model.id}
																	>
																		{label}
																	</span>
																	{model.isRecommended && (
																		<Badge
																			className="px-1.5 text-omp-xxs leading-3"
																			variant="success"
																		>
																			{t("modelPicker.badge.recommended")}
																		</Badge>
																	)}
																	{model.isNew && (
																		<Badge className="px-1.5 text-omp-xxs leading-3" variant="info">
																			{t("modelPicker.badge.new")}
																		</Badge>
																	)}
																	{model.isBeta && (
																		<Badge
																			className="px-1.5 text-omp-xxs leading-3"
																			variant="warning"
																		>
																			{t("modelPicker.badge.beta")}
																		</Badge>
																	)}
																</div>
																{(label !== model.id || model.description) && (
																	<span
																		className="truncate text-omp-xxs text-(--omp-dim)"
																		title={model.description}
																	>
																		{/* Only the id is code; the description is prose and stays
																	    in the interface face, which carries CJK text. */}
																		{label !== model.id && (
																			<span className="font-mono">{model.id}</span>
																		)}
																		{label !== model.id && model.description && " - "}
																		{model.description}
																	</span>
																)}
																<span
																	className="truncate text-omp-xs font-bold text-(--omp-text)"
																	data-model-provider={provider}
																	title={provider}
																>
																	{provider}
																</span>
															</div>
															{model.int != null && Number.isFinite(model.int) && (
																// INT is a catalog score, not a promise: the tooltip is the
																// only place it is explained, and the badge stays a badge.
																<span
																	className="shrink-0 cursor-help text-omp-xxs tabular-nums text-(--omp-dim)"
																	title={t("modelPicker.intelligenceHint")}
																	aria-label={`${t("modelPicker.intelligence", { value: Math.round(model.int) })} - ${t("modelPicker.intelligenceHint")}`}
																>
																	{t("modelPicker.intelligence", { value: Math.round(model.int) })}
																</span>
															)}
															{model.tps != null && Number.isFinite(model.tps) && model.tps > 0 && (
																<span className="shrink-0 text-omp-xxs tabular-nums text-(--omp-dim)">
																	{t("modelPicker.speed", {
																		value:
																			model.tps >= 10 ? Math.round(model.tps) : model.tps.toFixed(1),
																	})}
																</span>
															)}
															{over && (
																<span
																	className="flex shrink-0 items-center gap-1 text-(--omp-warning)"
																	title={t("modelPicker.overContextHint", {
																		current: formatTokens(contextUsage?.tokens),
																		limit: formatTokens(model.contextWindow),
																	})}
																>
																	<TriangleAlert size={12} />
																	<span className="text-omp-xxs font-medium">
																		{t("modelPicker.overContext")}
																	</span>
																</span>
															)}
															{switching === key && <Spinner size="sm" />}
															{isCurrent && <Check className="shrink-0 text-(--omp-accent)" size={13} />}
														</button>
														{auth && (
															<div className="flex items-center gap-2 px-2.5 pb-1">
																<Badge
																	variant={
																		auth.authenticated
																			? "success"
																			: auth.available
																				? "warning"
																				: "muted"
																	}
																>
																	{auth.authenticated
																		? t("modelPicker.auth.authenticated")
																		: auth.available
																			? t("modelPicker.auth.notSignedIn")
																			: t("modelPicker.auth.unavailable")}
																</Badge>
																{auth.available && !auth.authenticated && (
																	<button
																		type="button"
																		aria-label={`${t("providers.login")} · ${connection}`}
																		className="rounded px-1.5 py-0.5 text-omp-xxs font-medium text-(--omp-accent) hover:bg-(--omp-selected-bg)"
																		onClick={() => {
																			close();
																			openProviders();
																		}}
																	>
																		{t("providers.login")}
																	</button>
																)}
															</div>
														)}
													</div>
												);
											})}
										</div>
									)}
								</section>
							);
						})
					)}
				</div>
				{/* Adding a model means adding (or signing in to) its provider. */}
				<div className="flex shrink-0 items-center border-t border-(--omp-border-muted) px-3 py-2">
					<button
						type="button"
						className="omp-pressable flex items-center gap-1.5 rounded-md px-1.5 py-1 text-omp-sm text-(--omp-muted) hover:bg-(--omp-selected-bg) hover:text-(--omp-text)"
						onClick={() => {
							close();
							openProviders();
						}}
					>
						<Plus aria-hidden size={13} />
						{t("modelPicker.addModels")}
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}
