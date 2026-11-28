import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
	RpcForeignSessionInfo,
	RpcOfficialArchiveImportResult,
	RpcOfficialArchivePreview,
} from "../../../shared/rpc-types";
import { describeError } from "../../lib/errors";
import { cx, formatTimeAgo } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { useTabRpc } from "../../lib/tab-rpc";
import { useSessionStore } from "../../stores/session";
import { useTabsStore } from "../../stores/tabs";
import { useUiStore } from "../../stores/ui";
import { Button, Input, Modal, Spinner } from "../common";

type Source = "official" | "claude" | "codex";
const SOURCES: Source[] = ["official", "claude", "codex"];
type Imported = RpcOfficialArchiveImportResult["imported"][number];

/** The renderer receives metadata only; archive bytes remain in the native/Core boundary. */
export function ImportForeignDialog() {
	const t = useT();
	const tabRpc = useTabRpc();
	const activeTabId = useTabsStore(state => state.activeTabId);
	const ready = useSessionStore(state => state.status) === "ready";
	const close = useUiStore(state => state.closeImportDialog);
	const [source, setSource] = useState<Source>("official");
	const [sessions, setSessions] = useState<RpcForeignSessionInfo[]>([]);
	const [preview, setPreview] = useState<RpcOfficialArchivePreview | null>(null);
	const [filePath, setFilePath] = useState("");
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [imported, setImported] = useState<Imported[]>([]);
	const [result, setResult] = useState<RpcOfficialArchiveImportResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const pending = useRef<symbol | null>(null);
	const generation = useRef(0);
	const mounted = useRef(true);
	const context = useRef({ tabRpc, activeTabId, ready });
	// Invalidate during render as well as cleanup: an old promise can settle before effects run.
	if (
		context.current.tabRpc !== tabRpc ||
		context.current.activeTabId !== activeTabId ||
		context.current.ready !== ready
	) {
		generation.current++;
		context.current = { tabRpc, activeTabId, ready };
	}
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			generation.current++;
		};
	}, []);

	const reset = () => {
		setSessions([]);
		setPreview(null);
		setFilePath("");
		setSelected(new Set());
		setImported([]);
		setResult(null);
		setError(null);
		setQuery("");
	};

	// A synchronous token guards picker/list/import/open actions, including same-tick double clicks.
	const run = async (action: (valid: () => boolean) => Promise<void>) => {
		if (pending.current || !ready) return;
		const token = Symbol();
		pending.current = token;
		const version = generation.current;
		const valid = () =>
			mounted.current &&
			generation.current === version &&
			pending.current === token &&
			useTabsStore.getState().activeTabId === activeTabId;
		setBusy(true);
		setError(null);
		try {
			await action(valid);
		} catch (cause) {
			if (valid()) setError(describeError(cause));
		} finally {
			if (pending.current === token) {
				pending.current = null;
				if (generation.current === version) setBusy(false);
			}
		}
	};

	const loadLocal = (target: "claude" | "codex") =>
		run(async valid => {
			const response = await tabRpc.listForeignSessions(target);
			if (!valid()) return;
			if (!response.success) throw new Error(describeError(response.error));
			setSessions((response.data as { sessions?: RpcForeignSessionInfo[] } | undefined)?.sessions ?? []);
		});

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on actual routing/client changes only.
	useEffect(() => {
		pending.current = null;
		setBusy(false);
		reset();
		if (source !== "official" && ready) void loadLocal(source);
	}, [source, tabRpc, activeTabId, ready]);

	const pickArchive = () =>
		run(async valid => {
			const paths = await window.omp.system.showOpenDialog([
				{ name: t("import.archiveFilter"), extensions: ["zip", "json"] },
			]);
			if (!valid() || !paths?.[0]) return;
			reset();
			const response = await tabRpc.previewOfficialArchive(paths[0]);
			if (!valid()) return;
			if (!response.success) throw new Error(describeError(response.error));
			const data = response.data as RpcOfficialArchivePreview;
			setFilePath(paths[0]);
			setPreview(data);
			setSessions(data.sessions);
		});

	const completed = useMemo(() => new Set(imported.map(item => item.sourceId)), [imported]);
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return sessions.filter(
			session =>
				!q || [session.title, session.firstMessage, session.cwd].some(value => value?.toLowerCase().includes(q)),
		);
	}, [sessions, query]);
	const toggle = (id: string) =>
		setSelected(current => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	const openSession = (item: Imported) =>
		run(async valid => {
			const tabId = await useTabsStore.getState().openTab({ sessionPath: item.sessionPath });
			// openTab itself changes the route; accept that exact returned tab, not an unrelated switch.
			if (!mounted.current || (!valid() && (!tabId || useTabsStore.getState().activeTabId !== tabId))) return;
			if (tabId) close();
			else setError(t("import.openFailed", { path: item.sessionPath }));
		});
	const doImport = () =>
		run(async valid => {
			const ids = sessions
				.filter(session => selected.has(session.id) && !completed.has(session.id))
				.map(session => session.id);
			if (!ids.length) return;
			const successes: Imported[] = [];
			const failures: Array<{ sourceId: string; error: string }> = [];
			if (source === "official") {
				if (!preview) return;
				const response = await tabRpc.importOfficialArchive(filePath, preview.archiveId, ids);
				if (!valid()) return;
				if (!response.success) throw new Error(describeError(response.error));
				const data = response.data as RpcOfficialArchiveImportResult;
				setResult(data);
				successes.push(...data.imported);
				failures.push(...data.failed);
			} else {
				for (const id of ids) {
					try {
						const response = await tabRpc.importForeignSession(source, id);
						if (!valid()) return;
						if (!response.success) throw new Error(describeError(response.error));
						const data = response.data as { sessionPath: string; sessionId: string; cwd: string };
						successes.push({ sourceId: id, ...data });
					} catch (cause) {
						if (!valid()) return;
						failures.push({ sourceId: id, error: describeError(cause) });
					}
				}
			}
			if (!valid()) return;
			setImported(current => [
				...current,
				...successes.filter(item => !current.some(existing => existing.sourceId === item.sourceId)),
			]);
			setSelected(new Set(failures.map(item => item.sourceId)));
			setError(
				failures.length
					? failures
							.map(
								item =>
									`${sessions.find(session => session.id === item.sourceId)?.title ?? item.sourceId}: ${item.error}`,
							)
							.join("\n")
					: null,
			);
			// Keep official results visible so preserved data and batch sessions remain reachable.
			if (source !== "official" && ids.length === 1 && successes[0]) {
				const tabId = await useTabsStore.getState().openTab({ sessionPath: successes[0].sessionPath });
				if (!mounted.current || (!valid() && (!tabId || useTabsStore.getState().activeTabId !== tabId))) return;
				if (tabId) close();
				else setError(t("import.openFailed", { path: successes[0].sessionPath }));
			}
		});
	const preservedAction = (path: string, reveal: boolean) =>
		run(async valid => {
			const response = await (reveal ? window.omp.system.revealPath(path) : window.omp.system.openPath(path));
			if (valid() && !response.ok) setError(describeError(response.error));
		});

	return (
		<Modal
			open
			onClose={() => {
				if (!pending.current) close();
			}}
			title={t("import.title")}
			size="lg"
		>
			<div className="mb-3 flex flex-wrap items-center gap-2">
				{SOURCES.map(candidate => (
					<button
						key={candidate}
						type="button"
						disabled={busy}
						aria-pressed={source === candidate}
						onClick={() => {
							if (!pending.current && source !== candidate) {
								generation.current++;
								setSource(candidate);
							}
						}}
						className={cx(
							"rounded-lg border px-3 py-1.5 text-omp-md font-medium",
							source === candidate
								? "bg-(--omp-btn-primary-bg) text-(--omp-btn-primary-text)"
								: "border-(--omp-border) text-(--omp-muted)",
						)}
					>
						{t(
							candidate === "official"
								? "import.official"
								: candidate === "claude"
									? "import.claudeCode"
									: "import.codexLocal",
						)}
					</button>
				))}
			</div>
			{source === "official" ? (
				<div className="mb-3 space-y-2 text-omp-sm text-(--omp-muted)">
					<p>{t("import.privacy")}</p>
					<p>{t("import.exportGuide")}</p>
					<p>{t("import.limitations")}</p>
					<Button size="sm" disabled={!ready || busy} onClick={() => void pickArchive()}>
						{t("import.pickArchive")}
					</Button>
					{preview && (
						<p>
							{t("import.archiveSummary", {
								source: t(preview.source === "claude" ? "import.claudeOfficial" : "import.chatgptOfficial"),
								name: preview.fileName,
								chats: sessions.length,
								projects: preview.projectCount,
								files: preview.fileCount,
							})}
						</p>
					)}
					{[...new Set([...(preview?.warnings ?? []), ...(result?.warnings ?? [])])].map(warning => (
						<p key={warning}>{warning}</p>
					))}
				</div>
			) : (
				<Button size="sm" disabled={!ready || busy} onClick={() => void loadLocal(source)}>
					{t("common.refresh")}
				</Button>
			)}
			{!ready && <p role="alert">{t("import.notConnected")}</p>}
			{error && (
				<p role="alert" className="mb-2 whitespace-pre-wrap text-omp-sm text-(--omp-error)">
					{error}
				</p>
			)}
			{error && source === "official" && (
				<p className="mb-2 text-omp-sm text-(--omp-muted)">{t("import.updateRequired")}</p>
			)}
			{imported.length > 0 && (
				<div role="status" className="mb-2 text-omp-sm">
					<p>{t("import.batchStatus", { count: imported.length })}</p>
					{imported.map(item => (
						<Button
							key={item.sourceId}
							size="sm"
							disabled={busy || !ready}
							onClick={() => void openSession(item)}
						>
							{t("import.openChat", {
								title: sessions.find(session => session.id === item.sourceId)?.title ?? t("import.untitled"),
							})}
						</Button>
					))}
				</div>
			)}
			{result && (
				<div className="mb-3 flex flex-wrap gap-2">
					<Button
						size="sm"
						disabled={busy || !ready}
						onClick={() => void preservedAction(result.workspacePath, false)}
					>
						{t("import.openWorkspace")}
					</Button>
					<Button
						size="sm"
						disabled={busy || !ready}
						onClick={() => void preservedAction(result.workspacePath, true)}
					>
						{t("import.revealWorkspace")}
					</Button>
					<Button
						size="sm"
						disabled={busy || !ready}
						onClick={() => void preservedAction(result.archivePath, true)}
					>
						{t("import.revealArchive")}
					</Button>
				</div>
			)}
			<div className="my-2 flex flex-wrap items-center gap-2">
				<Input
					aria-label={t("import.search")}
					placeholder={t("import.search")}
					value={query}
					onChange={event => setQuery(event.target.value)}
				/>
				<Button
					size="sm"
					disabled={busy || !ready || !sessions.length}
					onClick={() =>
						setSelected(
							new Set(sessions.filter(session => !completed.has(session.id)).map(session => session.id)),
						)
					}
				>
					{t("import.selectAll")}
				</Button>
				<Button size="sm" disabled={busy || !selected.size} onClick={() => setSelected(new Set())}>
					{t("import.clearAll")}
				</Button>
				<span className="text-omp-xs text-(--omp-dim)">
					{t("import.selection", { selected: selected.size, total: sessions.length, visible: filtered.length })}
				</span>
			</div>
			<div className="max-h-[46vh] min-h-[200px] overflow-y-auto rounded-lg border border-(--omp-border-muted)">
				{busy && (
					<div role="status" className="flex justify-center p-3">
						<Spinner size="sm" />
					</div>
				)}
				{!busy && !filtered.length && <p className="p-4 text-omp-sm text-(--omp-dim)">{t("import.empty")}</p>}
				{filtered.map(session => (
					<label
						key={session.id}
						className="flex cursor-pointer items-start gap-3 border-b border-(--omp-border-muted) px-3 py-2.5 last:border-0 hover:bg-(--omp-selected-bg)"
					>
						<input
							type="checkbox"
							disabled={!ready || busy || completed.has(session.id)}
							checked={selected.has(session.id)}
							onChange={() => toggle(session.id)}
							className="mt-1"
						/>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-omp-md font-medium">
								{session.title ?? session.firstMessage ?? t("import.untitled")}
								{completed.has(session.id) && (
									<span className="ml-2 text-(--omp-success)">{t("import.done")}</span>
								)}
							</span>
							<span className="block whitespace-pre-wrap text-omp-sm text-(--omp-muted)">
								{session.firstMessage}
							</span>
							{source !== "official" && (
								<span className="block truncate font-mono text-omp-xs text-(--omp-dim)">{session.cwd}</span>
							)}
						</span>
						<span className="shrink-0 text-right text-omp-xs text-(--omp-dim)">
							{formatTimeAgo(session.modified)}
							{session.messageCount !== undefined && (
								<span className="block">{t("import.messages", { count: session.messageCount })}</span>
							)}
						</span>
					</label>
				))}
			</div>
			<div className="mt-3 flex items-center gap-3">
				<span className="text-omp-sm text-(--omp-dim)">{t("import.copyNote")}</span>
				<Button
					size="sm"
					disabled={!ready || busy || !selected.size}
					icon={busy ? <Spinner size="sm" /> : <Download size={13} />}
					onClick={() => void doImport()}
				>
					{selected.size ? t("import.importN", { count: selected.size }) : t("import.import")}
				</Button>
			</div>
		</Modal>
	);
}
