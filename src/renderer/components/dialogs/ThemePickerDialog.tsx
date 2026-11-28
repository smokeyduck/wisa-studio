/**
 * Visual gallery of light, dark and custom themes. Cards preview real theme
 * tokens without applying them; choosing one applies and persists it. System
 * mode stays separate, and unavailable custom files retain their notices.
 */

import { AlertTriangle, Check, FolderOpen, Monitor, Palette, Pencil, Search } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { describeError } from "../../lib/errors";
import { cx, shortenPath } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { isImeKeyEvent } from "../../lib/ime";
import {
	applyThemeByName,
	customTheme,
	getPersistedThemeSelection,
	isCustomThemeSelection,
	resolveTokenColor,
	THEMES,
	type ThemeDefinition,
	type ThemeName,
	type ThemeSelection,
} from "../../lib/themes";
import { useCustomThemesStore } from "../../stores/custom-themes";
import { toast } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";
import { Button, Modal, Tabs } from "../common";

const SWATCH_KEYS = ["--omp-accent", "--omp-syntax-string", "--omp-syntax-function", "--omp-syntax-number"] as const;

interface ThemeEntry {
	selection: ThemeSelection;
	label: string;
	description: string;
	/** null for "system", which has no fixed palette. */
	theme: ThemeDefinition | null;
	custom?: boolean;
	/** A custom theme's token entries that were left out. */
	skipped?: string[];
}

/** A miniature workspace, isolated from the active application's palette. */
function ThemePreview({ theme }: { theme: ThemeDefinition }) {
	const color = (key: Parameters<typeof resolveTokenColor>[1]) => resolveTokenColor(theme, key);
	return (
		<span
			aria-hidden="true"
			className="flex h-28 w-full flex-col overflow-hidden rounded-xl border"
			style={{ background: color("--omp-bg-primary"), borderColor: color("--omp-border") }}
		>
			<span
				className="flex h-5 shrink-0 items-center gap-1 border-b px-2"
				style={{ background: color("--omp-bg-secondary"), borderColor: color("--omp-border-muted") }}
			>
				{SWATCH_KEYS.slice(0, 3).map(key => (
					<span key={key} className="size-1 rounded-full" style={{ background: color(key) }} />
				))}
			</span>
			<span className="flex min-h-0 flex-1">
				<span
					className="flex w-1/4 flex-col gap-2 border-r p-2"
					style={{ background: color("--omp-sidebar-bg"), borderColor: color("--omp-border-muted") }}
				>
					<span className="h-2 rounded" style={{ background: color("--omp-accent-dim") }} />
					<span className="h-1 w-4/5 rounded" style={{ background: color("--omp-muted") }} />
					<span className="h-1 w-3/5 rounded" style={{ background: color("--omp-dim") }} />
				</span>
				<span className="flex flex-1 flex-col justify-between gap-2 p-2.5">
					<span className="flex flex-col gap-1.5">
						<span className="h-1.5 w-3/5 rounded" style={{ background: color("--omp-text") }} />
						<span className="h-1 w-4/5 rounded" style={{ background: color("--omp-muted") }} />
						<span className="h-1 w-1/2 rounded" style={{ background: color("--omp-accent") }} />
					</span>
					<span
						className="flex h-6 items-center justify-between rounded-lg border px-1.5"
						style={{ background: color("--omp-input-bg"), borderColor: color("--omp-input-border") }}
					>
						<span className="flex gap-1">
							{SWATCH_KEYS.map(key => (
								<span key={key} className="size-1.5 rounded-full" style={{ background: color(key) }} />
							))}
						</span>
						<span className="size-3 rounded-full" style={{ background: color("--omp-accent") }} />
					</span>
				</span>
			</span>
		</span>
	);
}

/**
 * Where the list opens when the chosen theme has no row (its file is broken
 * or gone): on its notice, until a key moves the cursor or a search starts.
 */
type NoticeLanding = "none" | "pending" | "landed";

/** Scrolls the chosen theme's notice into view once it is pending and rendered. */
function landOnNotice(landing: RefObject<NoticeLanding>, list: HTMLElement | null): void {
	if (landing.current !== "pending") return;
	const notice = list?.querySelector("[data-chosen-theme]");
	if (!notice) return;
	landing.current = "landed";
	notice.scrollIntoView({ block: "nearest" });
}

export function ThemePickerDialog() {
	const t = useT();
	const open = useUiStore(s => s.themePickerOpen);
	const close = useUiStore(s => s.closeThemePicker);
	const setTheme = useUiStore(s => s.setTheme);
	const openThemeEditor = useUiStore(s => s.openThemeEditor);

	const customDir = useCustomThemesStore(s => s.dir);
	const customEntries = useCustomThemesStore(s => s.entries);

	const [query, setQuery] = useState("");
	const [current, setCurrent] = useState<ThemeSelection>("system");
	const [active, setActive] = useState(0);
	const [scheme, setScheme] = useState<"dark" | "light">("dark");
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const landingRef = useRef<NoticeLanding>("none");

	const entries = useMemo<ThemeEntry[]>(
		() => [
			{ selection: "system", label: t("themePicker.system"), description: t("themePicker.systemDesc"), theme: null },
			// Locale keys mirror each stable built-in theme id.
			...(Object.keys(THEMES) as ThemeName[]).map(name => ({
				selection: name,
				label: t(`themePicker.theme.${name}.label`),
				description: t(`themePicker.theme.${name}.description`),
				theme: THEMES[name],
			})),
			...customEntries.flatMap(entry =>
				entry.theme
					? [
							{
								selection: entry.selection,
								label: entry.theme.label,
								description: entry.theme.description || t("themePicker.custom.from", { file: entry.fileName }),
								theme: entry.theme,
								custom: true,
								skipped: entry.skipped,
							},
						]
					: [],
			),
		],
		[t, customEntries],
	);
	const entriesRef = useRef(entries);
	entriesRef.current = entries;
	const broken = customEntries.filter(entry => !entry.theme);
	// The chosen custom theme's file is gone or broken: say what is on screen instead.
	const chosenId = isCustomThemeSelection(current) && customDir !== null ? current.slice("custom:".length) : null;
	const chosenFile = chosenId === null || /\.json$/i.test(chosenId) ? chosenId : `${chosenId}.json`;
	const chosenMissing = chosenFile !== null && !customEntries.some(entry => entry.selection === current);
	const chosenNote = isCustomThemeSelection(current)
		? t(customTheme(current) ? "themePicker.custom.keptLastGood" : "themePicker.custom.fallback")
		: "";

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return entries.filter(entry => {
			if (!entry.theme) return false;
			if (!q) return entry.theme.scheme === scheme;
			return entry.label.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
		});
	}, [entries, query, scheme]);
	const firstCustom = filtered.findIndex(entry => entry.custom);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setQuery("");
		setActive(0);
		landingRef.current = "none";
		void getPersistedThemeSelection().then(sel => {
			if (cancelled) return;
			setCurrent(sel);
			// Reopen on the chosen palette; search remains global across both tabs.
			const chosen = entriesRef.current.find(entry => entry.selection === sel);
			const nextScheme =
				chosen?.theme?.scheme ?? (document.documentElement.dataset.theme === "light" ? "light" : "dark");
			setScheme(nextScheme);
			const index = entriesRef.current
				.filter(entry => entry.theme?.scheme === nextScheme)
				.findIndex(entry => entry.selection === sel);
			if (!chosen && isCustomThemeSelection(sel)) landingRef.current = "pending";
			setActive(Math.max(0, index));
			// Reopened on the same theme, nothing re-renders, so the effect below would not run.
			requestAnimationFrame(() => landOnNotice(landingRef, listRef.current));
		});
		requestAnimationFrame(() => inputRef.current?.focus());
		return () => {
			cancelled = true;
		};
	}, [open]);

	const select = (entry: ThemeEntry) => {
		const sel = entry.selection;
		applyThemeByName(sel);
		setTheme(entry.theme ? entry.theme.scheme : "system");
		setCurrent(sel);
		toast({ variant: "success", message: t("themePicker.applied", { name: entry.label }) });
		close();
	};

	const onKey = (e: React.KeyboardEvent) => {
		if (isImeKeyEvent(e)) return;
		const fromSearch = e.target === inputRef.current;
		const fromCard = e.target instanceof HTMLElement && e.target.matches("[data-theme-choice]");
		if (!fromSearch && !fromCard) return;
		if (e.key === "Enter" && fromSearch) {
			e.preventDefault();
			const entry = filtered[active];
			if (entry) select(entry);
			return;
		}
		if (filtered.length === 0) return;
		const vertical = e.key === "ArrowDown" || e.key === "ArrowUp";
		const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
		if (!vertical && !(horizontal && fromCard)) return;
		e.preventDefault();
		landingRef.current = "none";
		const grid = listRef.current?.querySelector("[data-theme-grid]");
		const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 1;
		const step = vertical ? columns : 1;
		const direction = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1;
		const next = Math.max(0, Math.min(filtered.length - 1, fromSearch ? active : active + direction * step));
		setActive(next);
		listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
	};

	useEffect(() => {
		if (landingRef.current !== "none") return;
		listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	// The notice renders once the theme files are in, so this checks after every render until it lands.
	useEffect(() => landOnNotice(landingRef, listRef.current));

	return (
		<Modal open={open} onClose={close} title={t("themePicker.aria")} size="lg" bodyClassName="flex flex-col p-0">
			<div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKey}>
				<div className="shrink-0 px-4 pt-3">
					<p className="mb-3 text-omp-md text-(--omp-muted)">{t("themePicker.galleryHint")}</p>
					<button
						type="button"
						aria-label={entries[0].label}
						aria-pressed={current === "system"}
						onClick={() => select(entries[0])}
						className={cx(
							"omp-pressable flex w-full items-center gap-3 rounded-xl border p-3 text-left",
							current === "system"
								? "border-(--omp-accent) bg-(--omp-selected-bg)"
								: "border-(--omp-border-muted)",
						)}
					>
						<span
							aria-hidden="true"
							className="relative flex h-10 w-14 shrink-0 overflow-hidden rounded-lg border border-(--omp-border)"
						>
							<span
								className="w-1/2"
								style={{ background: resolveTokenColor(THEMES.dark, "--omp-bg-primary") }}
							/>
							<span
								className="w-1/2"
								style={{ background: resolveTokenColor(THEMES.light, "--omp-bg-primary") }}
							/>
							<Monitor size={18} className="absolute top-3 left-[19px] text-(--omp-accent)" />
						</span>
						<span className="min-w-0 flex-1">
							<span className="block text-omp-lg font-medium">{entries[0].label}</span>
							<span className="block text-omp-md text-(--omp-muted)">{entries[0].description}</span>
						</span>
						{current === "system" && <Check size={18} className="shrink-0 text-(--omp-accent)" />}
					</button>
				</div>
				<div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pt-3 pb-2">
					<Tabs
						ariaLabel={t("themePicker.aria")}
						tabs={(["dark", "light"] as const).map(id => ({
							id,
							label: t(`themePicker.${id}`),
							badge: entries.filter(entry => entry.theme?.scheme === id).length,
						}))}
						activeId={scheme}
						onChange={id => {
							landingRef.current = "none";
							setScheme(id === "light" ? "light" : "dark");
							setQuery("");
							setActive(0);
							if (listRef.current) listRef.current.scrollTop = 0;
						}}
					/>
					<div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-(--omp-border-muted) px-3 py-2 sm:max-w-72">
						<Search size={15} className="shrink-0 text-[var(--omp-dim)]" />
						<input
							ref={inputRef}
							value={query}
							onChange={e => {
								landingRef.current = "none";
								setQuery(e.target.value);
								setActive(0);
							}}
							placeholder={t("themePicker.search")}
							aria-label={t("themePicker.search")}
							className="w-full bg-transparent text-omp-lg text-[var(--omp-text)] outline-none placeholder:text-[var(--omp-dim)]"
						/>
					</div>
				</div>
				<div ref={listRef} className="min-h-0 max-h-[52dvh] flex-1 overflow-y-auto px-4 pt-2 pb-4">
					{filtered.length === 0 && (
						<div className="px-3 py-8 text-center text-omp-lg text-[var(--omp-dim)]">
							{t("themePicker.empty")}
						</div>
					)}
					<div data-theme-grid className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 min-[900px]:grid-cols-3">
						{filtered.map((entry, i) => {
							const theme = entry.theme;
							if (!theme) return null;
							const isCurrent = entry.selection === current;
							const row = (
								<button
									key={entry.selection}
									type="button"
									data-index={i}
									data-theme-choice={entry.selection}
									aria-label={entry.label}
									aria-pressed={isCurrent}
									onClick={() => select(entry)}
									onMouseEnter={() => setActive(i)}
									onFocus={() => setActive(i)}
									className={cx(
										"omp-pressable flex h-full w-full flex-col gap-2 rounded-2xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--omp-accent)",
										isCurrent
											? "border-(--omp-accent) bg-(--omp-selected-bg)"
											: "border-(--omp-border-muted)",
										i === active && !isCurrent && "border-(--omp-border-strong)",
									)}
								>
									<ThemePreview theme={theme} />
									<span className="w-full min-w-0 px-1 pb-1">
										<span className="flex items-center gap-2 text-omp-lg font-medium text-(--omp-text)">
											<span className="min-w-0 flex-1 truncate">{entry.label}</span>
											{isCurrent && <Check size={14} className="shrink-0 text-(--omp-accent)" />}
										</span>
										{isCurrent && (
											<span className="block text-omp-xs text-(--omp-accent)">
												{t("themePicker.current")}
											</span>
										)}
										<span className="mt-1 block text-omp-sm leading-relaxed text-[var(--omp-muted)]">
											{entry.description}
										</span>
										{entry.skipped && entry.skipped.length > 0 && (
											<span className="block truncate text-omp-sm text-[var(--omp-warning)]">
												{t("themePicker.custom.skipped", {
													count: entry.skipped.length,
													plural: entry.skipped.length === 1 ? "y" : "ies",
													names: entry.skipped.join(", "),
												})}
											</span>
										)}
									</span>
								</button>
							);
							const selection = entry.selection;
							const item =
								entry.custom && isCustomThemeSelection(selection) ? (
									<div key={selection} className="group relative">
										{row}
										<button
											type="button"
											data-edit-theme={selection}
											onClick={() => openThemeEditor(selection)}
											aria-label={t("themePicker.custom.edit", { name: entry.label })}
											title={t("themePicker.custom.edit", { name: entry.label })}
											className="omp-pressable absolute top-3 right-3 rounded-lg border border-(--omp-border-muted) bg-(--omp-bg-elevated) p-1.5 text-(--omp-muted) hover:text-(--omp-text)"
										>
											<Pencil size={13} />
										</button>
									</div>
								) : (
									row
								);
							if (i !== firstCustom) return item;
							return [
								<div
									key="custom-heading"
									className="col-span-full px-1 pt-2 text-omp-xs font-medium tracking-wide text-(--omp-dim) uppercase"
								>
									{t("themePicker.custom.heading")}
								</div>,
								item,
							];
						})}
					</div>
					{!query.trim() &&
						broken.map(entry => (
							<div
								key={entry.selection}
								data-custom-theme-problem={entry.problem}
								data-chosen-theme={entry.selection === current || undefined}
								className="flex items-start gap-3 px-3 py-2 text-omp-md text-[var(--omp-muted)]"
							>
								<AlertTriangle size={14} className="mt-0.5 shrink-0 text-[var(--omp-warning)]" />
								<span className="min-w-0 break-words">
									{t(`themePicker.custom.problem.${entry.problem}`, {
										file: entry.fileName,
										detail: entry.detail ?? "",
									})}
									{entry.selection === current && (
										<span className="block text-[var(--omp-text-secondary)]">{chosenNote}</span>
									)}
								</span>
							</div>
						))}
					{!query.trim() && chosenMissing && (
						<div
							data-custom-theme-problem="missing"
							data-chosen-theme
							className="flex items-start gap-3 px-3 py-2 text-omp-md text-[var(--omp-muted)]"
						>
							<AlertTriangle size={14} className="mt-0.5 shrink-0 text-[var(--omp-warning)]" />
							<span className="min-w-0 break-words">
								{t("themePicker.custom.missing", { file: chosenFile ?? "" })}
							</span>
						</div>
					)}
				</div>
				<div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-(--omp-border-muted) px-4 py-3">
					<span className="min-w-0 basis-full break-words text-omp-sm text-(--omp-dim) sm:basis-auto sm:flex-1">
						{t("themePicker.custom.hint", {
							dir: customDir
								? shortenPath(customDir)
								: import.meta.env.DEV
									? "~/.wisa-studio-dev/gui/themes"
									: "~/.wisa-studio/gui/themes",
						})}
					</span>
					<Button size="sm" variant="secondary" onClick={() => openThemeEditor()}>
						<Palette size={13} />
						{t("themePicker.custom.create")}
					</Button>
					<Button
						size="sm"
						variant="secondary"
						onClick={() => {
							void window.omp.themes
								.openFolder()
								.then(result => {
									if (!result.ok)
										toast({
											variant: "error",
											message: t("themePicker.custom.openFailed", { error: describeError(result.error) }),
										});
								})
								.catch(cause =>
									toast({
										variant: "error",
										message: t("themePicker.custom.openFailed", { error: describeError(cause) }),
									}),
								);
						}}
					>
						<FolderOpen size={13} />
						{t("themePicker.custom.openFolder")}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
