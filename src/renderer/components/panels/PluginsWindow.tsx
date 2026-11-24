/**
 * Plugins page, opened from the sidebar: browse every configured catalog as
 * cards with a logo and description, install with one click, and open a plugin
 * to see what it adds. Catalog management itself stays in Settings.
 *
 * Plugins can run code, so the first install from each catalog asks once. The
 * rest of the install path is the same marketplace_action the Settings list uses.
 */

import { observeElementRect, useVirtualizer } from "@tanstack/react-virtual";
import { Puzzle, RefreshCw, Search, Settings2, ShieldAlert, X } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import {
	capturePluginActivationOrigin,
	isPluginActivationOriginActive,
	type PluginActivationOrigin,
} from "../../lib/plugin-activation";
import { useSessionStore } from "../../stores/session";
import { useUiStore } from "../../stores/ui";
import { Button, ConfirmDialog, Modal, Spinner, Tabs } from "../common";
import { CopyableError } from "./inventory/ErrorNote";
import {
	type CatalogFilter,
	type CatalogPlugin,
	catalogCategories,
	dedupeCatalog,
	filterCatalog,
	OPENAI_MARKETPLACE,
	type PluginAction,
} from "./plugins/catalog-model";
import { PluginCard } from "./plugins/PluginCard";
import { usePluginCategoryLabel } from "./plugins/PluginCategoryLabel";
import { PluginDetail } from "./plugins/PluginDetail";
import { PluginErrorNote } from "./plugins/PluginErrorNote";
import { usePluginCatalog } from "./plugins/use-plugin-catalog";
import { PanelEmpty } from "./workspace-ui";

/** Catalogs bring dozens of categories, most with a plugin or two; the rest sit behind "More". */
const TOP_CATEGORIES = 12;
const CARD_MIN_WIDTH = 280;
const CARD_GAP = 12;
const ESTIMATED_ROW_HEIGHT = 140;
const UNMEASURED_CARDS = 40;

type PluginCatalogSurfaceProps =
	| { query: string; onOpenSection: (tab: "marketplaces" | "plugins") => void }
	| { open: boolean; onClose: () => void };

export function PluginCatalogSurface(props: PluginCatalogSurfaceProps) {
	const t = useT();
	const embedded = "query" in props;
	const open = embedded || props.open;
	const catalog = usePluginCatalog(open);
	const categoryLabel = usePluginCategoryLabel();

	const [localQuery, setQuery] = useState("");
	const query = embedded ? props.query : localQuery;
	const [view, setView] = useState<CatalogFilter["view"]>("all");
	const [category, setCategory] = useState<string | null>(null);
	const [catalogFilter, setCatalogFilter] = useState<string | null>(null);
	const [allCategories, setAllCategories] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [pendingInstall, setPendingInstall] = useState<{
		plugin: CatalogPlugin;
		origin: PluginActivationOrigin;
		cwd: string;
	} | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const warningsRef = useRef<HTMLDivElement>(null);
	const gridRef = useRef<HTMLDivElement>(null);
	const [{ columns, scrollMargin }, setGridLayout] = useState({ columns: 1, scrollMargin: 0 });

	// Opening the page starts at the list. Search and filters stay, as they're easy to clear and slow to redo.
	useLayoutEffect(() => {
		if (open) setSelectedId(null);
		setPendingInstall(null);
	}, [open]);

	const { plugins, marketplaces, busy, canAct, actionErrors, runAction, isCatalogTrusted, trustCatalog } = catalog;
	// A catalog removed in Settings while it was selected falls back to all of them.
	const activeCatalog = marketplaces.some(entry => entry.name === catalogFilter) ? catalogFilter : null;
	const inCatalog = useMemo(
		() =>
			activeCatalog === null
				? dedupeCatalog(plugins)
				: plugins.filter(plugin => plugin.marketplace === activeCatalog),
		[activeCatalog, plugins],
	);
	const categories = useMemo(() => catalogCategories(inCatalog), [inCatalog]);
	const shownCategories = allCategories ? categories : categories.slice(0, TOP_CATEGORIES);
	const visible = useMemo(() => {
		const trimmedQuery = query.trim();
		if (!trimmedQuery && view === "all" && category === null) {
			return inCatalog.toSorted((a, b) => a.title.localeCompare(b.title));
		}
		// Under All Catalogs, match before deduplicating: search can match a
		// catalog name or metadata that's present only on a non-preferred copy.
		return filterCatalog(activeCatalog === null ? plugins : inCatalog, {
			query: trimmedQuery,
			view,
			category,
			catalog: activeCatalog,
		});
	}, [activeCatalog, inCatalog, plugins, query, view, category]);
	const installedCount = useMemo(() => inCatalog.filter(plugin => plugin.info.installed).length, [inCatalog]);
	const catalogCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const { marketplace } of plugins) counts.set(marketplace, (counts.get(marketplace) ?? 0) + 1);
		return counts;
	}, [plugins]);
	const selected = selectedId ? plugins.find(plugin => plugin.id === selectedId) : undefined;

	// Virtualize rows rather than cards so an install error can enlarge its whole row.
	const rowKey = useCallback(
		(index: number) => `${columns}:${visible[index * columns]?.id ?? index}`,
		[columns, visible],
	);
	const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
		count: Math.ceil(visible.length / columns),
		getScrollElement: () => scrollRef.current,
		getItemKey: rowKey,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		gap: CARD_GAP,
		overscan: 4,
		scrollMargin,
		useFlushSync: false,
		observeElementRect: (instance, onRect) => {
			const updateLayout = () => {
				const grid = gridRef.current;
				const width = grid?.clientWidth;
				if (!grid || !width) return;
				const nextColumns = Math.max(1, Math.floor((width + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP)));
				const nextMargin = grid.offsetTop;
				setGridLayout(current =>
					current.columns === nextColumns && current.scrollMargin === nextMargin
						? current
						: { columns: nextColumns, scrollMargin: nextMargin },
				);
			};
			const stop = observeElementRect(instance, rect => {
				if (!(rect.width > 0 && rect.height > 0)) return;
				updateLayout();
				onRect(rect);
			});
			// Errors are above the grid and scroll with it; wrapping or dismissing
			// one changes the origin without necessarily resizing the viewport.
			const warnings = warningsRef.current;
			const observer = warnings && typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateLayout) : null;
			if (warnings) observer?.observe(warnings);
			return () => {
				stop?.();
				observer?.disconnect();
			};
		},
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the view's filter controls change.
	useLayoutEffect(() => {
		if (scrollRef.current) scrollRef.current.scrollTop = 0;
	}, [activeCatalog, category, query, view]);

	const requestAction = useCallback(
		(plugin: CatalogPlugin, action: PluginAction): void => {
			if (action === "install" && !isCatalogTrusted(plugin.marketplaceSource)) {
				const origin = capturePluginActivationOrigin();
				if (origin) setPendingInstall({ plugin, origin, cwd: useSessionStore.getState().cwd });
				return;
			}
			void runAction(plugin, action);
		},
		[isCatalogTrusted, runAction],
	);

	const confirmInstall = (): void => {
		const pending = pendingInstall;
		if (!pending) return;
		setPendingInstall(null);
		const { plugin, origin, cwd } = pending;
		if (
			actionDisabled ||
			!isPluginActivationOriginActive(origin) ||
			cwd !== useSessionStore.getState().cwd ||
			!marketplaces.some(entry => entry.name === plugin.marketplace && entry.source === plugin.marketplaceSource)
		) {
			return;
		}
		void trustCatalog(plugin.marketplaceSource);
		void runAction(plugin, "install");
	};

	const openSection = (tab: "marketplaces" | "plugins"): void => {
		if (embedded) props.onOpenSection(tab);
		else {
			props.onClose();
			useUiStore.getState().openSettings(`resources:${tab}`);
		}
	};
	const clearFilters = (): void => {
		setQuery("");
		setCategory(null);
		setCatalogFilter(null);
		setView("all");
	};

	const seeding = catalog.seeding;
	const seedingLabel = seeding ? t("plugins.seeding", { done: seeding.done, total: seeding.total }) : "";
	// Installing can restart the agent, which would interrupt the catalog being added.
	const actionDisabled = busy !== null || !canAct || seeding !== null;
	const disabledReason = !canAct
		? t("invPanel.notConnected")
		: busy
			? t("plugins.oneAtATime")
			: seeding
				? t("plugins.seedingWait")
				: undefined;

	const renderCard = (plugin: CatalogPlugin) => (
		<PluginCard
			disabled={actionDisabled}
			disabledReason={disabledReason}
			error={actionErrors[plugin.id]}
			installing={busy?.id === plugin.id}
			key={plugin.id}
			onInstall={() => requestAction(plugin, "install")}
			onOpen={() => setSelectedId(plugin.id)}
			plugin={plugin}
			showCatalog={marketplaces.length > 1}
		/>
	);

	const body = (() => {
		if (catalog.status === "connecting") {
			return (
				<div className="flex flex-1 items-center justify-center">
					<Spinner label={t("plugins.connecting")} />
				</div>
			);
		}
		if (seeding && marketplaces.length === 0) {
			return (
				<div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
					<Spinner label={seedingLabel} />
					<p className="max-w-md text-omp-sm text-(--omp-dim)">{t("plugins.seedingHint")}</p>
				</div>
			);
		}
		if (catalog.status === "loading" && plugins.length === 0) {
			return (
				<div className="flex flex-1 items-center justify-center">
					<Spinner label={t("common.loading")} />
				</div>
			);
		}
		if (catalog.status === "error") {
			return (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
					<div className="w-full max-w-lg">{catalog.error && <PluginErrorNote error={catalog.error} />}</div>
					<Button icon={<RefreshCw size={12} />} onClick={() => void catalog.reload()} size="sm" variant="ghost">
						{t("invPanel.retry")}
					</Button>
				</div>
			);
		}
		if (marketplaces.length === 0) {
			return (
				<div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
					<PanelEmpty
						action={
							<div className="flex flex-wrap justify-center gap-2">
								<Button onClick={() => void catalog.addDefaultCatalogs()} size="sm">
									{t("plugins.addDefaults")}
								</Button>
								<Button onClick={() => openSection("marketplaces")} size="sm" variant="ghost">
									{t("plugins.manageCatalogs")}
								</Button>
							</div>
						}
						hint={t("plugins.noCatalogsHint")}
						icon={Puzzle}
						title={t("plugins.noCatalogs")}
					/>
				</div>
			);
		}
		const virtualRows = virtualizer.getVirtualItems();
		// Settings normally sizes its pages to their content. Bound its inner
		// scroller so that the estimated full catalog does not become the viewport.
		return (
			<div
				className={cx(
					"relative min-h-0 overflow-y-auto px-4 py-3 [overflow-anchor:none] [scrollbar-gutter:stable]",
					embedded ? "max-h-[65dvh]" : "flex-1",
				)}
				ref={scrollRef}
			>
				<div className="flow-root" ref={warningsRef}>
					{catalog.seedError && (
						<div className="mb-2">
							<CopyableError
								copyLabel={t("marketplace.copyError")}
								message={t("plugins.seedFailed", { message: catalog.seedError.message })}
							/>
						</div>
					)}
					{catalog.listFailures.map(failure => (
						<div className="mb-2" key={failure.marketplace}>
							<CopyableError
								copyLabel={t("marketplace.copyError")}
								message={t("plugins.catalogFailed", { catalog: failure.marketplace, message: failure.error })}
							/>
						</div>
					))}
				</div>
				{visible.length === 0 ? (
					inCatalog.length > 0 && view === "installed" && !query && category === null ? (
						<PanelEmpty hint={t("plugins.noneInstalledHint")} icon={Puzzle} title={t("plugins.noneInstalled")} />
					) : (
						<PanelEmpty
							action={
								(!embedded || category !== null || activeCatalog !== null || view !== "all") && (
									<Button onClick={clearFilters} size="sm" variant="ghost">
										{t("plugins.clearFilters")}
									</Button>
								)
							}
							icon={Search}
							title={t("plugins.noMatches")}
						/>
					)
				) : null}
				<div ref={gridRef}>
					{visible.length > 0 &&
						(virtualRows.length > 0 ? (
							<div className="relative" style={{ height: virtualizer.getTotalSize() }}>
								{virtualRows.map(row => (
									<div
										className="absolute inset-x-0 top-0 grid"
										data-index={row.index}
										key={row.key}
										ref={virtualizer.measureElement}
										style={{
											columnGap: CARD_GAP,
											gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
											transform: `translateY(${row.start - scrollMargin}px)`,
										}}
									>
										{visible.slice(row.index * columns, (row.index + 1) * columns).map(renderCard)}
									</div>
								))}
							</div>
						) : (
							// Before layout (or in a DOM without measurements), show a bounded first batch.
							<div className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-3">
								{visible.slice(0, UNMEASURED_CARDS).map(renderCard)}
							</div>
						))}
				</div>
			</div>
		);
	})();

	const showFilters = plugins.length > 0;

	const contents = (
		<>
			<div className={cx("grid min-h-0", !embedded && "h-full grid-rows-[minmax(0,1fr)]")}>
				{/* Keep the list's layout and measurements behind detail so Back preserves scroll. */}
				<div
					className={cx("col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col", selected && "invisible")}
					inert={selected !== undefined}
				>
					<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--omp-border-muted) px-4 py-2.5">
						{!embedded && (
							<div className="relative min-w-[12rem] flex-1">
								<Search
									className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-(--omp-dim)"
									size={13}
								/>
								<input
									aria-label={t("plugins.search")}
									className="w-full rounded-md border border-(--omp-input-border) bg-(--omp-input-bg) py-1.5 pr-7 pl-8 text-omp-sm text-(--omp-text) placeholder:text-(--omp-dim) focus:border-(--omp-input-focus-border) focus:outline-none"
									onChange={event => setQuery(event.target.value)}
									placeholder={t("plugins.search")}
									spellCheck={false}
									type="text"
									value={query}
								/>
								{query && (
									<button
										aria-label={t("plugins.clearSearch")}
										className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-(--omp-dim) hover:text-(--omp-text)"
										onClick={() => setQuery("")}
										type="button"
									>
										<X size={12} />
									</button>
								)}
							</div>
						)}
						{marketplaces.length > 0 && (
							<select
								aria-label={t("plugins.catalogFilter")}
								className="max-w-[16rem] truncate rounded-md border border-(--omp-input-border) bg-(--omp-input-bg) px-2 py-1.5 text-omp-sm text-(--omp-text) focus:border-(--omp-input-focus-border) focus:outline-none"
								onChange={event => {
									setCatalogFilter(event.target.value || null);
									setCategory(null);
								}}
								value={activeCatalog ?? ""}
							>
								<option value="">{t("plugins.catalogFilter.all")}</option>
								{marketplaces.map(entry => (
									<option key={entry.name} value={entry.name}>
										{entry.name === OPENAI_MARKETPLACE ? t("plugins.openAiMarketplace") : entry.name} (
										{catalogCounts.get(entry.name) ?? 0})
									</option>
								))}
							</select>
						)}
						{!embedded && (
							<Tabs
								activeId={view}
								ariaLabel={t("plugins.title")}
								compact
								onChange={id => setView(id as CatalogFilter["view"])}
								tabs={[
									{ id: "all", label: t("plugins.view.all"), badge: inCatalog.length },
									{ id: "installed", label: t("plugins.view.installed"), badge: installedCount },
								]}
							/>
						)}
						<Button
							icon={<Settings2 size={12} />}
							onClick={() => openSection("marketplaces")}
							size="sm"
							variant="ghost"
						>
							{t("plugins.manageCatalogs")}
						</Button>
						<Button
							aria-label={t("plugins.refresh")}
							disabled={
								!canAct || catalog.refreshing || busy !== null || seeding !== null || marketplaces.length === 0
							}
							onClick={() => void catalog.refresh()}
							size="sm"
							title={t("plugins.refresh")}
							variant="ghost"
						>
							<RefreshCw className={catalog.refreshing ? "animate-spin" : undefined} size={12} />
						</Button>
					</div>
					{showFilters && categories.length > 1 && (
						<div className="flex shrink-0 flex-wrap gap-1 border-b border-(--omp-border-muted) px-4 py-2">
							{[{ id: null, count: inCatalog.length }, ...shownCategories].map(entry => (
								<button
									aria-pressed={category === entry.id}
									className={cx(
										"omp-pressable rounded-full px-2.5 py-0.5 text-omp-xs transition-colors",
										category === entry.id
											? "bg-(--omp-selected-bg) text-(--omp-text)"
											: "text-(--omp-muted) hover:bg-(--omp-selected-bg)",
									)}
									key={entry.id ?? "all"}
									onClick={() => setCategory(entry.id)}
									type="button"
								>
									{entry.id === null ? t("plugins.category.all") : categoryLabel(entry.id)}
									<span className="ml-1 tabular-nums text-(--omp-dim)">{entry.count}</span>
								</button>
							))}
							{categories.length > TOP_CATEGORIES && (
								<button
									aria-expanded={allCategories}
									className="omp-pressable rounded-full px-2.5 py-0.5 text-omp-xs text-(--omp-dim) transition-colors hover:bg-(--omp-selected-bg) hover:text-(--omp-text)"
									onClick={() => setAllCategories(value => !value)}
									type="button"
								>
									{allCategories
										? t("plugins.categories.fewer")
										: t("plugins.categories.more", { count: categories.length - TOP_CATEGORIES })}
								</button>
							)}
						</div>
					)}
					{seeding && marketplaces.length > 0 && (
						<div className="shrink-0 border-b border-(--omp-border-muted) px-4 py-1.5 text-omp-xs text-(--omp-muted)">
							<Spinner label={seedingLabel} size="sm" />
						</div>
					)}
					{catalog.refreshError && (
						<div className="shrink-0 px-4 pt-2">
							<CopyableError copyLabel={t("marketplace.copyError")} message={catalog.refreshError} />
						</div>
					)}
					{body}
					<div className="flex shrink-0 items-center gap-1.5 border-t border-(--omp-border-muted) px-4 py-1.5 text-omp-xs text-(--omp-dim)">
						<ShieldAlert className="shrink-0" size={12} />
						<span>{t("plugins.trustNote")}</span>
					</div>
				</div>
				{selected && (
					<div className="col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col">
						<PluginDetail
							busyAction={busy?.id === selected.id ? busy.action : null}
							disabled={actionDisabled}
							disabledReason={disabledReason}
							error={actionErrors[selected.id]}
							key={selected.id}
							onAction={action => requestAction(selected, action)}
							onBack={() => setSelectedId(null)}
							onOpenSettings={() => openSection("plugins")}
							plugin={selected}
						/>
					</div>
				)}
			</div>
			<ConfirmDialog
				busy={actionDisabled}
				confirmLabel={t("plugins.trust.confirm")}
				message={t("plugins.trust.message", { catalog: pendingInstall?.plugin.marketplace ?? "" })}
				onCancel={() => setPendingInstall(null)}
				onConfirm={confirmInstall}
				open={pendingInstall !== null}
				title={t("plugins.trust.title", { name: pendingInstall?.plugin.title ?? "" })}
				warning={t("plugins.trust.warning")}
			/>
		</>
	);
	if (embedded) return contents;
	return (
		<Modal dockable bodyClassName="p-0" onClose={props.onClose} open={open} size="full" title={t("plugins.title")}>
			{contents}
		</Modal>
	);
}

export function PluginsWindow() {
	const open = useUiStore(s => s.pluginsOpen);
	const close = useUiStore(s => s.closePlugins);
	return <PluginCatalogSurface onClose={close} open={open} />;
}
