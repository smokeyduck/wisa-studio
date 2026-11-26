import { ChevronsDownUp, ChevronsUpDown, CircleCheck, FolderX, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RpcGitChanges, RpcGitDiff } from "../../../shared/rpc-types";
import { useWorkingTreeChanges } from "../../hooks/use-working-tree-changes";
import { describeError } from "../../lib/errors";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { useTabRpc } from "../../lib/tab-rpc";
import { useRuntimeTabId } from "../../stores/session-runtime-context";
import { showPathMenu } from "../common/LinkMenu";
import {
	ChangeBadge,
	countDiffLines,
	DiffBody,
	DiffFileCard,
	DiffStat,
	FileLabel,
	gitChangeKind,
	PanelEmpty,
	PanelSearch,
	ToolbarIconButton,
} from "./workspace-ui";

const PREFETCH_CONCURRENCY = 4;
/** Small change sets open fully — reading them is the whole point. */
const AUTO_EXPAND_LIMIT = 3;
/** Past this many files the filter field earns its row. */
const SEARCH_THRESHOLD = 6;

type DiffState =
	| { state: "loading" }
	| { state: "ready"; diff: RpcGitDiff; adds: number; removes: number }
	| { state: "error"; error: string };

// A new list (run completion, focus or manual refresh) also invalidates its diff bodies.
const cachedDiffs = new WeakMap<RpcGitChanges, Map<string, Extract<DiffState, { state: "ready" }>>>();
const EMPTY_DIFFS: ReadonlyMap<string, DiffState> = new Map();

export function RepositoryChanges({ split = false }: { split?: boolean }) {
	const t = useT();
	const rpc = useTabRpc();
	const tabId = useRuntimeTabId();
	const { data: changes, loading, error, refresh } = useWorkingTreeChanges();
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const [loaded, setLoaded] = useState<{ changes: RpcGitChanges; diffs: ReadonlyMap<string, DiffState> } | null>(null);
	const [query, setQuery] = useState("");
	const currentList = useRef<RpcGitChanges | null>(null);
	const requested = useRef(new Set<string>());
	const diffs = loaded && loaded.changes === changes ? loaded.diffs : EMPTY_DIFFS;

	useLayoutEffect(() => {
		const first = currentList.current?.root !== changes?.root || currentList.current === null;
		currentList.current = changes;
		requested.current.clear();
		if (!changes) {
			setLoaded(null);
			setExpanded(new Set());
			return;
		}
		const cached = cachedDiffs.get(changes);
		if (cached) for (const path of cached.keys()) requested.current.add(path);
		setLoaded({ changes, diffs: cached ?? EMPTY_DIFFS });
		const paths = new Set(changes.files.map(file => file.path));
		setExpanded(previous => {
			if (first) return changes.files.length <= AUTO_EXPAND_LIMIT ? paths : new Set();
			return new Set([...previous].filter(path => paths.has(path)));
		});
	}, [changes]);

	const loadDiff = useCallback(
		async (path: string) => {
			if (!changes || requested.current.has(path)) return;
			requested.current.add(path);
			const publish = (entry: DiffState) => {
				if (currentList.current !== changes) return;
				setLoaded(previous => ({ changes, diffs: new Map(previous?.diffs).set(path, entry) }));
			};
			publish({ state: "loading" });
			try {
				const response = await rpc.getGitDiff(path);
				if (!response.success) throw new Error(response.error ?? t("rpc.failed"));
				const diff = response.data as RpcGitDiff;
				const counts = diff.kind === "text" ? countDiffLines(diff.diff) : { adds: 0, removes: 0 };
				const entry = { state: "ready", diff, ...counts } as const;
				let cached = cachedDiffs.get(changes);
				if (!cached) {
					cached = new Map();
					cachedDiffs.set(changes, cached);
				}
				cached.set(path, entry);
				if (cached.size > 64) {
					const oldest = cached.keys().next().value;
					if (oldest !== undefined) cached.delete(oldest);
				}
				publish(entry);
			} catch (cause) {
				publish({ state: "error", error: describeError(cause) });
			}
		},
		[changes, rpc, t],
	);

	// Fetch diff bodies only for opened cards; collapsed paths need only Git status.
	useEffect(() => {
		if (!changes?.isRepo) return;
		const queue = [...expanded].filter(path => !requested.current.has(path));
		if (queue.length === 0) return;
		let cancelled = false;
		const worker = async () => {
			while (!cancelled) {
				const path = queue.shift();
				if (!path) return;
				// eslint-disable-next-line no-await-in-loop -- bounded concurrency
				await loadDiff(path);
			}
		};
		for (let i = 0, count = Math.min(queue.length, PREFETCH_CONCURRENCY); i < count; i++) void worker();
		return () => {
			cancelled = true;
		};
	}, [changes, expanded, loadDiff]);

	const files = useMemo(() => {
		const needle = query.trim().toLocaleLowerCase();
		return changes?.files.filter(file => file.path.toLocaleLowerCase().includes(needle)) ?? [];
	}, [changes, query]);

	const totals = useMemo(() => {
		let adds = 0;
		let removes = 0;
		let counted = 0;
		for (const entry of diffs.values()) {
			if (entry.state !== "ready") continue;
			adds += entry.adds;
			removes += entry.removes;
			counted++;
		}
		return counted > 0 && counted === changes?.files.length ? { adds, removes } : null;
	}, [changes, diffs]);

	const toggle = (path: string) =>
		setExpanded(previous => {
			const next = new Set(previous);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	const allExpanded = files.length > 0 && files.every(file => expanded.has(file.path));
	// Git names files from the repository root, which may sit above the workspace.
	const root = changes?.root?.replace(/[\\/]+$/, "");
	const fileCount = changes?.files.length ?? 0;

	const refreshButton = (
		<ToolbarIconButton label={t("common.refresh")} disabled={loading} onClick={refresh}>
			<RefreshCw size={14} className={cx(loading && changes && "animate-spin")} />
		</ToolbarIconButton>
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* The scope note is reference, not chrome: assistive tech reads it, sighted users get it on hover. */}
			<p className="sr-only">{t("diffPanel.repositoryScope")}</p>
			{error && (
				<p
					role="alert"
					className="mx-3 mb-2 break-words rounded-md bg-(--omp-tool-error-bg) px-2.5 py-1.5 text-omp-sm text-(--omp-error)"
				>
					{error}
				</p>
			)}
			{fileCount > SEARCH_THRESHOLD && (
				<div className="px-3 pb-2">
					<PanelSearch label={t("diffPanel.search")} value={query} onChange={setQuery} />
				</div>
			)}
			{changes?.truncated && (
				<p role="status" className="px-3 pb-2 text-omp-xs text-(--omp-warning)">
					{t("diffPanel.listLimited")}
				</p>
			)}
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
				{loading && !changes ? (
					<p className="px-3 py-2 text-omp-sm text-(--omp-dim)">{t("common.loading")}</p>
				) : changes && !changes.isRepo ? (
					<PanelEmpty icon={FolderX} title={t("diffPanel.notRepoTitle")} hint={t("diffPanel.notRepo")} />
				) : changes?.files.length === 0 ? (
					<PanelEmpty
						icon={CircleCheck}
						tone="success"
						title={t("diffPanel.clean")}
						hint={t("diffPanel.cleanHint")}
					/>
				) : changes && files.length === 0 ? (
					<p className="px-3 py-6 text-center text-omp-sm text-(--omp-dim)">{t("diffPanel.noMatch")}</p>
				) : (
					files.map(file => {
						const entry = diffs.get(file.path);
						const open = expanded.has(file.path);
						return (
							<div key={file.path} data-change-path={file.path}>
								<DiffFileCard
									expanded={open}
									onToggle={() => toggle(file.path)}
									onContextMenu={
										root ? event => showPathMenu(event, `${root}/${file.path}`, tabId) : undefined
									}
									leading={<ChangeBadge kind={gitChangeKind(file.status)} />}
									label={<FileLabel path={file.path} oldPath={file.oldPath} />}
									trailing={
										entry?.state === "ready" && entry.diff.kind === "text" ? (
											<DiffStat adds={entry.adds} removes={entry.removes} />
										) : null
									}
								>
									{!entry || entry.state === "loading" ? (
										<p className="px-4 py-2 text-omp-sm text-(--omp-dim)">{t("common.loading")}</p>
									) : entry.state === "error" ? (
										<p role="alert" className="break-words px-4 py-2 text-omp-sm text-(--omp-error)">
											{entry.error}
										</p>
									) : entry.diff.kind === "text" ? (
										<>
											<DiffBody diff={entry.diff.diff} filePath={entry.diff.path} split={split} />
											{entry.diff.truncated && (
												<p className="px-4 py-1.5 text-omp-xs text-(--omp-warning)">
													{t("diffPanel.previewLimited")}
												</p>
											)}
										</>
									) : (
										<p className="px-4 py-2 text-omp-sm text-(--omp-dim)">
											{t(`diffPanel.kind.${entry.diff.kind}`)}
										</p>
									)}
								</DiffFileCard>
							</div>
						);
					})
				)}
			</div>
			<div
				className="flex h-9 shrink-0 items-center gap-2 border-t border-(--omp-border-muted) pr-2 pl-3"
				title={t("diffPanel.repositoryScope")}
			>
				<span className="min-w-0 flex-1 truncate text-omp-sm text-(--omp-muted)">
					{changes?.isRepo && fileCount > 0
						? t("diffPanel.filesChanged", { count: fileCount, plural: fileCount === 1 ? "" : "s" })
						: t("diffPanel.mode.repository")}
				</span>
				{totals && <DiffStat adds={totals.adds} removes={totals.removes} />}
				{fileCount > 1 && (
					<ToolbarIconButton
						label={t(allExpanded ? "diffPanel.collapseAll" : "diffPanel.expandAll")}
						onClick={() => setExpanded(allExpanded ? new Set() : new Set(files.map(file => file.path)))}
					>
						{allExpanded ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
					</ToolbarIconButton>
				)}
				{refreshButton}
			</div>
		</div>
	);
}
