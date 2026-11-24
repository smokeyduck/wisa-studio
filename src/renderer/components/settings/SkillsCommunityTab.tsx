/**
 * Community tab: the whole skills.sh catalogue, browsable offline.
 *
 * The renderer never talks to the network here - main fetches the index (see
 * `src/main/skills-community.ts`), caches it, and pages the rest of every board
 * in behind the first screenful, pushing each board as it grows. The tab shows
 * what is loaded and how much of the index that is, because a catalogue that
 * fills in over a few minutes should say so rather than look complete.
 *
 * The installer only writes files: it runs no npm/pip/node and executes none of
 * the scripts a skill ships. The tab says that next to the install target,
 * because "one click install from the internet" is exactly the place a user
 * deserves to know where the bytes land and what did not happen to them.
 */

import { observeElementRect, useVirtualizer } from "@tanstack/react-virtual";
import { BookOpen, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	COMMUNITY_BOARDS,
	type CommunityBoard,
	type CommunitySkill,
	communitySkillSlug,
	type IpcSkillsCommunityCatalogResult,
	type IpcSkillsCommunityPreviewResult,
} from "../../../shared/skills-community";
import { shortenPath } from "../../lib/format";
import { getFormattingLocale, useT } from "../../lib/i18n";
import { MarkdownRenderer } from "../../lib/markdown";
import { toast } from "../../stores/toast";
import { Button, Input, Modal, Spinner, Tabs } from "../common";
import { CatalogCard } from "../common/CatalogCard";

/** Rank shown as a "Top" chip: the index's first ten rows on every board. */
const TOP_RANK = 10;
const CARD_MIN_WIDTH = 280;
const CARD_GAP = 12;
const CARD_INSET = CARD_GAP / 2;
const ESTIMATED_ROW_HEIGHT = 140;
/** Limit the initial render when there is no measurable viewport yet. */
const UNMEASURED_CARDS = 40;

type CatalogState =
	| { status: "loading" }
	| { status: "error"; error: string }
	| { status: "ok"; catalog: Extract<IpcSkillsCommunityCatalogResult, { status: "ok" }> };

type PreviewState =
	| { status: "loading" }
	| { status: "ok"; preview: Extract<IpcSkillsCommunityPreviewResult, { status: "ok" }> }
	| { status: "error"; error: string };

/** Install counts are the index's only quality signal, so they are always shown. */
function installsLabel(t: (key: string, params?: Record<string, string | number>) => string, installs: number): string {
	return t("skills.community.installs", { count: installs.toLocaleString(getFormattingLocale()) });
}

export function SkillsCommunityTab({ onInstalled }: { onInstalled?: () => void }) {
	const t = useT();
	const [board, setBoard] = useState<CommunityBoard>("all-time");
	const [query, setQuery] = useState("");
	const [state, setState] = useState<CatalogState>({ status: "loading" });
	const [installed, setInstalled] = useState<Record<string, string>>({});
	const [installing, setInstalling] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [preview, setPreview] = useState<{ skill: CommunitySkill; state: PreviewState } | null>(null);
	const [columns, setColumns] = useState(1);
	const scrollRef = useRef<HTMLDivElement>(null);
	const bridge = typeof window === "undefined" ? undefined : window.omp?.skillsCommunity;

	// One read on mount; the background pager then pushes each board as it grows.
	useEffect(() => {
		if (!bridge) {
			setState({ status: "error", error: t("skills.community.unavailable") });
			return;
		}
		let live = true;
		const apply = (answer: IpcSkillsCommunityCatalogResult) => {
			if (!live) return;
			if (answer.status !== "ok") {
				setState({ status: "error", error: answer.error });
				return;
			}
			setInstalled(current => ({ ...answer.installed, ...current }));
			setState({ status: "ok", catalog: answer });
		};
		bridge.catalog().then(apply, cause => {
			if (live) setState({ status: "error", error: String(cause) });
		});
		const unsubscribe = bridge.onCatalogUpdate(update => {
			if (!live) return;
			setState(current =>
				current.status === "ok"
					? {
							...current,
							catalog: {
								...current.catalog,
								boards: { ...current.catalog.boards, [update.board]: update.state },
							},
						}
					: current,
			);
		});
		return () => {
			live = false;
			unsubscribe();
		};
	}, [bridge, t]);

	const catalog = state.status === "ok" ? state.catalog : null;
	const current = catalog?.boards[board] ?? { skills: [], total: 0, complete: false };
	// The disk inventory and installs from this session share the same folder slug.
	const isInstalled = (skill: CommunitySkill) => {
		const slug = communitySkillSlug(skill.id) ?? skill.skillId;
		return Boolean(installed[slug] ?? catalog?.installed[slug]);
	};
	const previewInstalled = preview !== null && isInstalled(preview.skill);

	// The catalogue is local, so filtering is a substring test over what is
	// loaded - no request, no debounce, and it narrows as more rows arrive.
	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return current.skills;
		return current.skills.filter(skill => skill.id.toLowerCase().includes(needle));
	}, [current.skills, query]);

	// Rank is the board's own position, so filtering never renumbers a row: a
	// skill filtered to the top of the list keeps the rank it has on skills.sh.
	const ranks = useMemo(() => new Map(current.skills.map((skill, index) => [skill.id, index + 1])), [current.skills]);

	// Virtualize whole grid rows so every card in a row aligns, even when one
	// locale or text size makes its metadata wrap.
	const rowCount = Math.ceil(matches.length / columns);
	const rowKey = useCallback((index: number) => matches[index * columns]?.id ?? index, [matches, columns]);
	const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
		count: rowCount,
		getScrollElement: () => scrollRef.current,
		getItemKey: rowKey,
		observeElementRect: (instance, onRect) =>
			observeElementRect(instance, rect => {
				setColumns(Math.max(1, Math.floor((rect.width || 0) / (CARD_MIN_WIDTH + CARD_GAP))));
				onRect(rect);
			}),
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		gap: CARD_GAP,
		paddingStart: CARD_INSET,
		paddingEnd: CARD_INSET,
		overscan: 4,
		useFlushSync: false,
	});

	// Switching board or filter changes what row N is, so the list starts over.
	// linkedom has no scrollTo; the guard keeps the list working without it.
	const resetScroll = () => scrollRef.current?.scrollTo?.({ top: 0 });

	const refresh = async () => {
		if (!bridge || refreshing) return;
		setRefreshing(true);
		try {
			const answer = await bridge.refresh();
			if (answer.status === "ok") {
				setInstalled(currentInstalled => ({ ...answer.installed, ...currentInstalled }));
				setState({ status: "ok", catalog: answer });
			} else {
				toast({ variant: "error", message: answer.error });
			}
		} catch (cause) {
			toast({ variant: "error", message: String(cause) });
		} finally {
			setRefreshing(false);
		}
	};

	const openPreview = (skill: CommunitySkill) => {
		if (!bridge) return;
		setPreview({ skill, state: { status: "loading" } });
		bridge.preview({ id: skill.id }).then(
			answer => {
				setPreview(currentPreview =>
					currentPreview?.skill.id === skill.id
						? {
								skill,
								state:
									answer.status === "ok"
										? { status: "ok", preview: answer }
										: { status: "error", error: answer.error },
							}
						: currentPreview,
				);
			},
			cause => {
				setPreview(currentPreview =>
					currentPreview?.skill.id === skill.id
						? { skill, state: { status: "error", error: String(cause) } }
						: currentPreview,
				);
			},
		);
	};

	const install = async (skill: CommunitySkill) => {
		if (!bridge || installing || isInstalled(skill)) return;
		setInstalling(skill.id);
		try {
			const result = await bridge.install({ id: skill.id });
			if (result.status !== "ok") {
				// "already installed" is not a failure the user caused: the folder is
				// there, so the row switches to its installed state either way.
				if (result.error === "already installed") {
					const slug = communitySkillSlug(skill.id) ?? skill.skillId;
					setInstalled(currentInstalled => ({ ...currentInstalled, [slug]: result.error }));
				}
				toast({ variant: "error", message: result.error });
				return;
			}
			const slug = communitySkillSlug(skill.id) ?? skill.skillId;
			setInstalled(currentInstalled => ({ ...currentInstalled, [slug]: result.dir }));
			toast({ variant: "success", title: t("skills.community.installSuccess"), message: result.dir });
			onInstalled?.();
		} catch (cause) {
			toast({ variant: "error", message: String(cause) });
		} finally {
			setInstalling(null);
		}
	};

	const body = (() => {
		if (state.status === "error") {
			return (
				<div className="flex flex-col items-center justify-center gap-3 px-5 py-12 text-center">
					<p className="rounded-lg border border-[color-mix(in_srgb,var(--omp-error)_35%,transparent)] bg-transparent px-3 py-2 text-omp-sm text-(--omp-error)">
						{state.error}
					</p>
				</div>
			);
		}
		if (state.status === "loading") {
			return (
				<div className="flex items-center justify-center py-12">
					<Spinner label={t("skills.community.loading")} size="sm" />
				</div>
			);
		}
		if (matches.length === 0) {
			return (
				<div className="flex items-center justify-center px-5 py-12 text-center text-omp-sm text-(--omp-dim)">
					{query.trim() ? t("skills.community.empty") : t("skills.community.loading")}
				</div>
			);
		}
		// Before layout there is no viewport range, so render a bounded first batch.
		const placed = virtualizer.getVirtualItems();
		const visible = placed.length
			? placed
			: Array.from({ length: Math.min(Math.ceil(UNMEASURED_CARDS / columns), rowCount) }, (_, index) => ({
					index,
					key: rowKey(index),
					start: CARD_INSET + index * (ESTIMATED_ROW_HEIGHT + CARD_GAP),
				}));
		return (
			<div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
				{visible.map(row => (
					<div
						className="absolute top-0 grid"
						data-index={row.index}
						key={row.key}
						ref={placed.length ? virtualizer.measureElement : undefined}
						style={{
							columnGap: CARD_GAP,
							gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
							insetInline: CARD_INSET,
							transform: `translateY(${row.start}px)`,
						}}
					>
						{matches.slice(row.index * columns, (row.index + 1) * columns).map((skill, index) => {
							const busy = installing === skill.id;
							const rank = ranks.get(skill.id) ?? row.index * columns + index + 1;
							const previewLabel = t("skills.community.preview");
							return (
								<CatalogCard
									byline={skill.source}
									description={
										<span title={t("skills.community.installsHint")}>{installsLabel(t, skill.installs)}</span>
									}
									install={
										isInstalled(skill)
											? { installed: true, label: t("skills.community.installed") }
											: {
													installed: false,
													label: t(busy ? "skills.community.installing" : "skills.community.install"),
													disabled: installing !== null,
													loading: busy,
													onClick: () => void install(skill),
												}
									}
									key={skill.id}
									logo={
										<span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-(--omp-accent-soft) text-(--omp-accent)">
											<BookOpen aria-hidden="true" size={18} />
										</span>
									}
									metadata={
										<>
											<div className="flex min-w-0 flex-wrap items-center gap-1.5">
												<span className="font-mono tabular-nums" title={t("skills.community.rankHint")}>
													#{rank}
												</span>
												{rank <= TOP_RANK && (
													<span
														className="rounded-md bg-(--omp-accent-soft) px-1.5 py-0.5 text-omp-xxs font-medium text-(--omp-accent)"
														title={t("skills.community.topHint")}
													>
														{t("skills.community.top")}
													</span>
												)}
												{skill.official && (
													<span className="rounded-md border border-(--omp-border-muted) px-1.5 py-0.5 text-omp-xxs text-(--omp-muted)">
														{t("skills.community.official")}
													</span>
												)}
											</div>
											<span aria-hidden="true" className="ml-auto shrink-0 text-(--omp-accent)">
												{previewLabel}
											</span>
										</>
									}
									onOpen={() => openPreview(skill)}
									openLabel={`${previewLabel}: ${skill.name}`}
									title={skill.name}
								/>
							);
						})}
					</div>
				))}
			</div>
		);
	})();

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<Tabs
				activeId={board}
				ariaLabel={t("skills.community.boards")}
				onChange={id => {
					resetScroll();
					setBoard(id as CommunityBoard);
				}}
				tabs={COMMUNITY_BOARDS.map(id => ({ id, label: t(`skills.community.board.${id}`) }))}
			/>

			<div className="flex flex-wrap items-center gap-2">
				<Input
					aria-label={t("skills.community.filter")}
					className="max-w-md"
					compact
					onChange={event => {
						resetScroll();
						setQuery(event.target.value);
					}}
					placeholder={t("skills.community.filterPlaceholder")}
					spellCheck={false}
					value={query}
				/>
				<span className="text-omp-xxs text-(--omp-dim) tabular-nums">
					{query.trim()
						? t("skills.community.filtered", {
								shown: matches.length.toLocaleString(getFormattingLocale()),
								total: current.total.toLocaleString(getFormattingLocale()),
							})
						: t("skills.community.count", {
								shown: current.skills.length.toLocaleString(getFormattingLocale()),
								total: current.total.toLocaleString(getFormattingLocale()),
							})}
				</span>
				{!current.complete && current.skills.length > 0 && (
					<span className="text-omp-xxs text-(--omp-dim)">{t("skills.community.partial")}</span>
				)}
				<Button
					className="ml-auto"
					disabled={refreshing}
					loading={refreshing}
					onClick={() => void refresh()}
					size="sm"
					variant="ghost"
				>
					<RefreshCw size={12} />
					{refreshing ? t("skills.community.refreshing") : t("skills.community.refresh")}
				</Button>
			</div>

			<div
				className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-(--omp-border-muted) [scrollbar-gutter:stable]"
				ref={scrollRef}
			>
				{body}
			</div>

			{/* Where the files go, and what the installer did not do with them. */}
			<div className="flex flex-col gap-1.5 rounded-lg border border-(--omp-border-muted) px-3 py-2.5">
				{catalog && (
					<p className="flex flex-wrap items-center gap-1.5 text-omp-xxs text-(--omp-dim)">
						<span>{t("skills.community.target")}</span>
						<span className="truncate font-mono text-(--omp-muted)" title={catalog.root}>
							{shortenPath(catalog.root)}
						</span>
					</p>
				)}
				<p className="flex items-start gap-1.5 text-omp-xxs leading-relaxed text-(--omp-dim)">
					<ShieldCheck className="mt-px shrink-0 text-(--omp-success)" size={12} />
					<span>{t("skills.community.safetyNote")}</span>
				</p>
			</div>

			<Modal
				bodyClassName="flex min-h-0 flex-col gap-3 px-5 py-4"
				onClose={() => setPreview(null)}
				open={preview !== null}
				size="md"
				title={preview ? preview.skill.name : ""}
			>
				{preview && (
					<>
						<div className="flex flex-wrap items-center gap-2 text-omp-xs text-(--omp-dim)">
							<span className="font-mono">{preview.skill.id}</span>
							<span className="rounded-md border border-(--omp-border-muted) px-1.5 py-0.5 text-omp-xxs tabular-nums">
								{installsLabel(t, preview.skill.installs)}
							</span>
							{preview.state.status === "ok" && (
								<span className="text-omp-xxs">
									{t("skills.community.previewFiles", { count: preview.state.preview.files.length })}
								</span>
							)}
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-(--omp-border-muted) px-3 py-2.5">
							{preview.state.status === "loading" && (
								<Spinner label={t("skills.community.previewLoading")} size="sm" />
							)}
							{preview.state.status === "error" && (
								<p className="text-omp-sm text-(--omp-error)">
									{t("skills.community.previewFailed")}: {preview.state.error}
								</p>
							)}
							{preview.state.status === "ok" && <MarkdownRenderer content={preview.state.preview.skillMd} />}
						</div>
						<div className="flex items-center justify-end gap-2">
							<Button onClick={() => setPreview(null)} size="sm" variant="ghost">
								{t("common.close")}
							</Button>
							<Button
								disabled={previewInstalled || installing !== null}
								loading={installing === preview.skill.id}
								onClick={() => void install(preview.skill)}
								size="sm"
							>
								{!previewInstalled && <Download size={12} />}
								{t(previewInstalled ? "skills.community.installed" : "skills.community.install")}
							</Button>
						</div>
					</>
				)}
			</Modal>
		</div>
	);
}
