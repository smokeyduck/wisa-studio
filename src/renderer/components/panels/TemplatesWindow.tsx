/**
 * Templates page: the web-template catalog as a browsable gallery, with one
 * action that matters — install a template and open it as a session.
 *
 * The catalog is maintained outside this repo and served by a worker; main
 * fetches it, caches it, and falls back to the bundled snapshot, so the page
 * says which of the three it is showing rather than pretending a stale list is
 * current. Installing downloads the template's pinned tarball into the Work
 * workspace and opens that folder as a session — the agent takes it from there
 * (install dependencies, run the dev server, wire in Agentation). The page
 * deliberately runs nothing itself.
 */

import { FolderOpen, Globe, RefreshCw, Search, Store, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TemplateEntry } from "../../../shared/templates";
import { TEMPLATE_CATEGORIES, templateSearchText } from "../../../shared/templates";
import { showBrowserWindow } from "../../lib/browser-window";
import { cx } from "../../lib/format";
import { useLang, useT } from "../../lib/i18n";
import { templateThumbnailSrc } from "../../lib/template-thumbnail";
import { useTabsStore } from "../../stores/tabs";
import { toast } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";
import { Button, Modal, Spinner } from "../common";
import { PanelEmpty } from "./workspace-ui";

/** Category label from its slug, with a Vietnamese name where the slug has one. */
function categoryLabel(category: string, t: (key: string) => string): string {
	return t(`templates.category.${category}`);
}

/** A card's accent, used when a catalog entry has no screenshot we can show. */
function stackAccent(stack: string): string {
	switch (stack) {
		case "astro":
			return "hsl(276 60% 52%)";
		case "nextjs":
			return "hsl(210 10% 30%)";
		case "vite-react":
			return "hsl(193 90% 45%)";
		case "html-tailwind":
			return "hsl(199 89% 48%)";
		default:
			return "hsl(220 10% 45%)";
	}
}

function TemplateCard({
	entry,
	installing,
	installed,
	disabled,
	onInstall,
	onDemo,
	onOpenFolder,
}: {
	entry: TemplateEntry;
	installing: boolean;
	installed: string | null;
	disabled: boolean;
	onInstall: () => void;
	onDemo: () => void;
	onOpenFolder: () => void;
}) {
	const t = useT();
	const { lang } = useLang();
	const name = lang === "vi" && entry.nameVi ? entry.nameVi : entry.name;
	const description = lang === "vi" ? (entry.description.vi ?? entry.description.en) : entry.description.en;
	const src = templateThumbnailSrc(entry.thumbnail);
	/** A thumbnail the bundle does not carry falls back to the stack's colour. */
	const [broken, setBroken] = useState(false);
	const showImage = src !== null && !broken;
	return (
		<article className="omp-card group flex min-h-0 flex-col overflow-hidden transition-colors hover:border-(--omp-border) hover:bg-(--omp-selected-bg)">
			{/* The screenshot is the card: it is what the reader is choosing
			    between, and it opens the live demo — the whole surface is the
			    preview affordance, so there is no separate icon button for it. */}
			<button
				aria-label={t("templates.preview")}
				className="relative block aspect-[16/10] w-full shrink-0 cursor-pointer overflow-hidden border-b border-(--omp-border-muted)"
				disabled={!entry.demoUrl}
				onClick={onDemo}
				title={entry.demoUrl ? t("templates.preview") : undefined}
				type="button"
			>
				{showImage ? (
					<img
						alt=""
						className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
						draggable={false}
						loading="lazy"
						onError={() => setBroken(true)}
						src={src}
					/>
				) : (
					<div
						className="flex size-full items-end px-3 pb-2"
						style={{
							background: `linear-gradient(135deg, ${stackAccent(entry.stack)} 0%, color-mix(in srgb, ${stackAccent(entry.stack)} 55%, black) 100%)`,
						}}
					>
						<span className="text-omp-xs font-medium tracking-wide text-white/85 uppercase">{entry.stack}</span>
					</div>
				)}
				{entry.demoUrl && (
					<span className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-omp-xxs font-medium text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
						<Globe size={10} />
						{t("templates.preview")}
					</span>
				)}
			</button>
			<div className="flex min-h-0 flex-1 flex-col gap-1 px-3 py-2.5">
				{/* The text is part of the same target: reading the name and
				    description is how you decide, so it opens the demo too. */}
				<button
					className="block w-full cursor-pointer text-left"
					disabled={!entry.demoUrl}
					onClick={onDemo}
					type="button"
				>
					<span className="flex items-baseline gap-2">
						<span className="truncate text-omp-md font-semibold text-(--omp-text)">{name}</span>
						<span className="ml-auto shrink-0 text-omp-xxs tracking-wide text-(--omp-dim) uppercase">
							{entry.stack}
						</span>
					</span>
					<span className="mt-0.5 line-clamp-2 block text-omp-sm leading-snug text-(--omp-muted)">
						{description}
					</span>
				</button>
				<div className="mt-auto flex items-center gap-1.5 pt-1.5">
					<span className="truncate rounded-full bg-(--omp-selected-bg) px-1.5 py-0.5 text-omp-xxs text-(--omp-muted)">
						{categoryLabel(entry.category, t)}
					</span>
					<div className="ml-auto shrink-0">
						{installed ? (
							<Button icon={<FolderOpen size={12} />} onClick={onOpenFolder} size="sm" variant="primary">
								{t("templates.open")}
							</Button>
						) : (
							<Button disabled={disabled || installing} onClick={onInstall} size="sm" variant="primary">
								{installing ? t("templates.installing") : t("templates.install")}
							</Button>
						)}
					</div>
				</div>
			</div>
		</article>
	);
}

export function TemplatesWindow() {
	const t = useT();
	const open = useUiStore(state => state.templatesOpen);
	const close = useUiStore(state => state.closeTemplates);
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<string | null>(null);
	const [state, setState] = useState<
		| { status: "loading" }
		| { status: "error"; error: string }
		| {
				status: "ok";
				templates: TemplateEntry[];
				origin: "remote" | "cache" | "bundled";
				fetchedAt?: string;
		  }
	>({ status: "loading" });
	const [installing, setInstalling] = useState<string | null>(null);
	/** Installed folder per template id: seeded by the catalog read, updated on install. */
	const [installed, setInstalled] = useState<Record<string, string>>({});

	const load = useMemo(
		() => async () => {
			setState({ status: "loading" });
			try {
				const result = await window.omp.templates.catalog();
				if (result.status !== "ok") {
					setState({ status: "error", error: result.error });
					return;
				}
				setState({
					status: "ok",
					templates: result.catalog.templates,
					origin: result.origin,
					...(result.fetchedAt ? { fetchedAt: result.fetchedAt } : {}),
				});
				// Templates already on disk keep their "Open" button across a
				// reopen of the page: main reports the folders it found.
				setInstalled(result.installed ?? {});
			} catch (error) {
				setState({ status: "error", error: String(error) });
			}
		},
		[],
	);

	useEffect(() => {
		if (open) void load();
	}, [open, load]);

	const templates = state.status === "ok" ? state.templates : [];
	const counts = useMemo(() => {
		const byCategory = new Map<string, number>();
		for (const entry of templates) byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + 1);
		return byCategory;
	}, [templates]);
	// Known categories first, in the catalog's own order; anything new follows
	// alphabetically so a catalog addition still shows up without a rebuild.
	const categories = useMemo(() => {
		const known = TEMPLATE_CATEGORIES.filter(id => counts.has(id));
		const extra = [...counts.keys()].filter(id => !known.includes(id)).sort();
		return [...known, ...extra];
	}, [counts]);
	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return templates.filter(entry => {
			if (category && entry.category !== category) return false;
			if (!needle) return true;
			return templateSearchText(entry).includes(needle);
		});
	}, [templates, category, query]);

	/** Open a folder as a session: the agent works there, nothing is run here. */
	const openFolderSession = (dir: string) => {
		close();
		useUiStore.getState().returnToConversation();
		void useTabsStore.getState().openTab({ cwd: dir });
	};

	const openDemo = (entry: TemplateEntry) => {
		const url = entry.demoUrl;
		if (!url) return;
		const tabId = useTabsStore.getState().activeTabId;
		const tab = useTabsStore.getState().tabs.find(candidate => candidate.id === tabId);
		if (!tab || tab.kind === "chat") {
			void window.omp.system.openExternal(url);
			return;
		}
		// The app's own browser window, beside the work — a template preview is
		// exactly what it is for. A window that cannot show one falls back.
		showBrowserWindow(tab.id);
		window.omp.browser.open(tab.id, url).then(
			state => {
				if (!state) void window.omp.system.openExternal(url);
			},
			() => void window.omp.system.openExternal(url),
		);
	};

	const install = async (entry: TemplateEntry) => {
		setInstalling(entry.id);
		try {
			const result = await window.omp.templates.install({ id: entry.id });
			if (result.status !== "ok") {
				toast({ variant: "error", title: t("templates.installFailed"), message: result.error });
				return;
			}
			setInstalled(current => ({ ...current, [entry.id]: result.dir }));
			toast({ variant: "success", title: t("templates.installed"), message: result.dir });
			openFolderSession(result.dir);
		} catch (error) {
			toast({ variant: "error", title: t("templates.installFailed"), message: String(error) });
		} finally {
			setInstalling(null);
		}
	};

	const body = (() => {
		if (state.status === "loading") {
			return (
				<div className="flex flex-1 items-center justify-center">
					<Spinner label={t("templates.loading")} />
				</div>
			);
		}
		if (state.status === "error") {
			return (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
					<PanelEmpty
						action={
							<Button icon={<RefreshCw size={12} />} onClick={() => void load()} size="sm" variant="ghost">
								{t("invPanel.retry")}
							</Button>
						}
						hint={state.error}
						icon={Store}
						tone="error"
						title={t("templates.unavailable")}
					/>
				</div>
			);
		}
		if (visible.length === 0) {
			return (
				<div className="flex flex-1 items-center justify-center">
					<PanelEmpty
						action={
							<Button
								onClick={() => {
									setQuery("");
									setCategory(null);
								}}
								size="sm"
								variant="ghost"
							>
								{t("templates.clearFilters")}
							</Button>
						}
						icon={Search}
						title={t("templates.noMatches")}
					/>
				</div>
			);
		}
		return (
			<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">
				<div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
					{visible.map(entry => (
						<TemplateCard
							disabled={false}
							entry={entry}
							installed={installed[entry.id] ?? null}
							installing={installing === entry.id}
							key={entry.id}
							onDemo={() => openDemo(entry)}
							onInstall={() => void install(entry)}
							onOpenFolder={() => {
								const dir = installed[entry.id];
								if (dir) openFolderSession(dir);
							}}
						/>
					))}
				</div>
			</div>
		);
	})();

	return (
		<Modal bodyClassName="p-0" dockable onClose={close} open={open} size="full" title={t("templates.title")}>
			<div className="flex h-full min-h-0 flex-col">
				<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--omp-border-muted) px-4 py-2.5">
					<div className="relative min-w-[12rem] flex-1">
						<Search
							className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-(--omp-dim)"
							size={13}
						/>
						<input
							aria-label={t("templates.search")}
							className="w-full rounded-md border border-(--omp-input-border) bg-(--omp-input-bg) py-1.5 pr-7 pl-8 text-omp-sm text-(--omp-text) placeholder:text-(--omp-dim) focus:border-(--omp-input-focus-border) focus:outline-none"
							onChange={event => setQuery(event.target.value)}
							placeholder={t("templates.search")}
							spellCheck={false}
							type="text"
							value={query}
						/>
						{query && (
							<button
								aria-label={t("templates.clearSearch")}
								className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-(--omp-dim) hover:text-(--omp-text)"
								onClick={() => setQuery("")}
								type="button"
							>
								<X size={12} />
							</button>
						)}
					</div>
					<span className="shrink-0 text-omp-xs text-(--omp-dim)">
						{t("templates.count", { count: visible.length })}
					</span>
					<Button
						aria-label={t("templates.refresh")}
						icon={<RefreshCw size={12} />}
						onClick={() => void load()}
						size="sm"
						title={t("templates.refresh")}
						variant="ghost"
					/>
				</div>
				{categories.length > 1 && (
					<div className="flex shrink-0 flex-wrap gap-1 border-b border-(--omp-border-muted) px-4 py-2">
						{[null, ...categories].map(id => (
							<button
								aria-pressed={category === id}
								className={cx(
									"omp-pressable rounded-full px-2.5 py-0.5 text-omp-xs transition-colors",
									category === id
										? "bg-(--omp-selected-bg) text-(--omp-text)"
										: "text-(--omp-muted) hover:bg-(--omp-selected-bg)",
								)}
								key={id ?? "all"}
								onClick={() => setCategory(id)}
								type="button"
							>
								{id === null ? t("templates.category.all") : categoryLabel(id, t)}
								<span className="ml-1 tabular-nums text-(--omp-dim)">
									{id === null ? templates.length : (counts.get(id) ?? 0)}
								</span>
							</button>
						))}
					</div>
				)}
				{/* A stale list is still a list, but the reader deserves to know. */}
				{state.status === "ok" && state.origin !== "remote" && (
					<div className="shrink-0 border-b border-(--omp-border-muted) px-4 py-1.5 text-omp-xs text-(--omp-muted)">
						{t(state.origin === "cache" ? "templates.origin.cache" : "templates.origin.bundled")}
					</div>
				)}
				{body}
				{/* Attribution, not a badge: the templates are third-party work and
				    the reader should know who to credit, in the quietest voice the
				    page has. */}
				<div className="shrink-0 space-y-0.5 border-t border-(--omp-border-muted) px-4 py-2 text-omp-xxs text-(--omp-dim)">
					<p>{t("templates.licenseNote")}</p>
					<p>{t("templates.agentationNote")}</p>
				</div>
			</div>
		</Modal>
	);
}
