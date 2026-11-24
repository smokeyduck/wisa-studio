/** Session-owned plan document and review, rendered exclusively in the inspector. */

import { CheckCircle2, Circle, ClipboardList, FileWarning, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AgentSessionEvent, PlanModeState } from "../../../shared/rpc-types";
import { describeError } from "../../lib/errors";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { MarkdownRenderer } from "../../lib/markdown";
import { livePlanWritePath, streamingPlanContent } from "../../lib/plan-tool";
import { acceptsActiveTabEvents } from "../../lib/tab-routing";
import { useTabRpc } from "../../lib/tab-rpc";
import { type PlanComment, planFeedbackText } from "../../stores/plan-approval";
import { type SessionStore, useSessionStore } from "../../stores/session";
import { sessionRuntime, sessionRuntimeStore, useSessionRuntime } from "../../stores/session-runtime-context";
import { useTabsStore } from "../../stores/tabs";
import { toast } from "../../stores/toast";
import { useToolsStore } from "../../stores/tools";
import { Button, Spinner, Tabs } from "../common";
import { PlanFeedback, usePlanFeedbackEditor } from "./PlanFeedback";

const POLL_STREAMING_MS = 400;

interface LoadOptions {
	quiet?: boolean;
	refreshMode?: boolean;
}

interface LoadRun {
	pending: LoadOptions | null;
}

const EMPTY_COMMENTS: PlanComment[] = [];
interface ResolvedPlanPath {
	fsPath: string;
	/** Session-local root (`<artifacts>/local`) when the plan lives under `local://`. */
	localRoot: string | null;
}

/**
 * Mirror of the agent-side `readPlanFile` resolution: `local://` URLs land in
 * `<sessionFile minus .jsonl>/local/`, absolute paths pass through, anything
 * else resolves against the session cwd. Returns null when a `local://` path
 * cannot be resolved because the session has no file on disk yet.
 */
function resolvePlanFsPath(planFilePath: string, sessionFile: string | null, cwd: string): ResolvedPlanPath | null {
	if (planFilePath.startsWith("local:")) {
		if (!sessionFile?.endsWith(".jsonl")) return null;
		const name = planFilePath.replace(/^local:\/+/, "");
		if (!name) return null;
		const localRoot = `${sessionFile.slice(0, -".jsonl".length)}/local`;
		return { fsPath: `${localRoot}/${name}`, localRoot };
	}
	if (/^(?:[/\\]|[a-z]:[/\\])/i.test(planFilePath)) return { fsPath: planFilePath, localRoot: null };
	if (!cwd) return null;
	return { fsPath: `${cwd.replace(/[/\\]+$/, "")}/${planFilePath}`, localRoot: null };
}

interface PlanStep {
	index: number;
	text: string;
	done: boolean;
	/** True when the source line was a `- [ ]` / `- [x]` checklist item. */
	checkbox: boolean;
}

interface PlanSection {
	heading: string | null;
	steps: PlanStep[];
}

/** Extract ordered steps (checkboxes, numbered and bulleted items) grouped under their headings. */
function parsePlanSections(markdown: string): PlanSection[] {
	const sections: PlanSection[] = [];
	let current: PlanSection = { heading: null, steps: [] };
	let ordinal = 0;
	let fence: string | null = null;
	const pushCurrent = () => {
		if (current.steps.length > 0) sections.push(current);
	};
	for (const line of markdown.split("\n")) {
		const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) {
			if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
			continue;
		}
		if (marker) {
			fence = marker[1];
			continue;
		}
		const heading = /^#{1,6}\s+(.+)$/.exec(line);
		if (heading) {
			pushCurrent();
			current = { heading: heading[1].trim(), steps: [] };
			continue;
		}
		const checkbox = /^\s*[-*]\s+\[([ xX])\]\s+(.+)$/.exec(line);
		const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
		const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
		const text = (checkbox?.[2] ?? numbered?.[1] ?? bullet?.[1])?.trim();
		if (text) {
			ordinal += 1;
			current.steps.push({
				index: ordinal,
				text,
				done: checkbox ? checkbox[1].toLowerCase() === "x" : false,
				checkbox: checkbox != null,
			});
		}
	}
	pushCurrent();
	return sections;
}

export function PlanPanel() {
	const t = useT();
	const rpc = useTabRpc();
	const runtime = useSessionRuntime();
	const selectedTabId = useTabsStore(state => state.activeTabId);
	const tabId = runtime?.tabId ?? selectedTabId;
	const sessionStore = sessionRuntimeStore<SessionStore>(tabId, "session") ?? useSessionStore;
	const sessionFile = useSessionStore(state => state.sessionFile);
	const switching = useSessionStore(state => state.switchPending !== null);
	const capture = useCallback(() => {
		if (!tabId || sessionStore.getState().switchPending) return null;
		const { sessionId, sessionFile, cwd } = sessionStore.getState();
		const generation = runtime?.sessionGeneration;
		const current = () => {
			if (
				runtime
					? sessionRuntime(tabId) !== runtime || runtime.sessionGeneration !== generation
					: useTabsStore.getState().activeTabId !== tabId || !acceptsActiveTabEvents()
			)
				return false;
			const state = sessionStore.getState();
			return (
				!state.switchPending &&
				state.sessionId === sessionId &&
				state.sessionFile === sessionFile &&
				state.cwd === cwd
			);
		};
		return current() ? { current, sessionFile, cwd } : null;
	}, [tabId, sessionStore, runtime]);
	const planModeEnabled = useSessionStore(s => s.planModeEnabled);
	const isStreaming = useSessionStore(s => s.isStreaming);
	const scrollRef = useRef<HTMLDivElement>(null);
	const pinned = useRef(true);
	const [following, setFollowing] = useState(true);
	const loadRun = useRef<LoadRun | null>(null);
	const [planFilePath, setPlanFilePath] = useState<string | null>(null);
	const [planFile, setPlanFile] = useState<string | null>(null);
	const [localRoot, setLocalRoot] = useState<string | null>(null);
	const [content, setContent] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [toggling, setToggling] = useState(false);
	const [tab, setTab] = useState("preview");
	const [submission, setSubmission] = useState<"approve" | "refine" | null>(null);
	const submitting = useRef(false);
	const [draft, setDraft] = useState<{ planPath: string | null; comments: PlanComment[] } | null>(null);
	const writePath = useToolsStore(state =>
		planModeEnabled ? livePlanWritePath(state.activeTools, planFilePath) : null,
	);
	const streamedContent = useToolsStore(state =>
		planModeEnabled ? streamingPlanContent(state.activeTools, planFilePath) : null,
	);
	const visibleContent = streamedContent ?? content;
	const writing = writePath !== null;
	const planning = (isStreaming && planModeEnabled) || writing;
	const knownPath = useRef<string | null>(null);
	const ready = useSessionStore(state => state.status) === "ready";

	const load = useCallback(
		async (options: LoadOptions = {}) => {
			const active = loadRun.current;
			if (active) {
				const queued = active.pending;
				active.pending = queued
					? {
							quiet: queued.quiet && options.quiet,
							refreshMode: queued.refreshMode || options.refreshMode,
						}
					: options;
				return;
			}
			const run: LoadRun = { pending: options };
			loadRun.current = run;
			try {
				while (run.pending && loadRun.current === run) {
					const request = run.pending;
					run.pending = null;
					const origin = capture();
					if (!origin) break;
					const isCurrent = () => loadRun.current === run && origin.current();
					if (!request.quiet) {
						setLoading(true);
						setError(null);
					}
					try {
						let path = knownPath.current;
						if (!request.quiet || request.refreshMode || !path) {
							const mode = await rpc.getPlanMode();
							if (!isCurrent()) break;
							if (!mode.success) {
								if (!request.quiet || !path) setError(describeError(mode.error));
								continue;
							}
							path = (mode.data as PlanModeState | undefined)?.planFilePath ?? null;
							if (path !== knownPath.current) {
								knownPath.current = path;
								setPlanFilePath(path);
								setPlanFile(null);
								setContent(null);
								setLocalRoot(null);
							}
						}
						if (!path) {
							setError(null);
							continue;
						}
						const resolved = resolvePlanFsPath(path, origin.sessionFile, origin.cwd);
						if (!resolved) {
							setError(t("planPanel.noFsPath"));
							continue;
						}
						const response = await window.omp.fs.readPlan({ ...resolved, tabId: tabId ?? undefined });
						if (!isCurrent()) break;
						if ((run.pending as LoadOptions | null)?.refreshMode) continue;
						if (!response.ok) {
							setError(describeError(response.error));
							continue;
						}
						setError(null);
						setLocalRoot(resolved.localRoot);
						setPlanFile(response.path);
						setContent(response.content);
					} catch (cause) {
						if (isCurrent()) setError(describeError(cause));
					} finally {
						if (isCurrent()) {
							setLoading(false);
							setLoaded(true);
						}
					}
				}
			} finally {
				if (loadRun.current === run) loadRun.current = null;
			}
		},
		[capture, rpc, t, tabId],
	);
	useLayoutEffect(() => {
		// Follow new content only while the user has not scrolled away.
		if (visibleContent === null) return;
		if (planning && pinned.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
	}, [planning, visibleContent]);
	useEffect(() => {
		const refresh = (events: AgentSessionEvent[], owner: string) => {
			if (owner !== tabId || !planModeEnabled || !ready) return;
			if (
				events.some(
					event =>
						event.type === "agent_end" ||
						(event.type === "tool_execution_end" &&
							(event.toolName === "write" || event.toolName === "edit" || event.toolName === "ast_edit")),
				)
			) {
				void load({ quiet: true, refreshMode: true });
			}
		};
		return window.omp.events.onTabBatch?.(refresh);
	}, [load, tabId, planModeEnabled, ready]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reload when the session gains a file or plan mode changes.
	useEffect(() => {
		if (switching || !ready) return;
		void load();
		return () => {
			loadRun.current = null;
		};
	}, [load, sessionFile, switching, ready, planModeEnabled]);

	const wasPlanning = useRef(planning);
	useEffect(() => {
		const finished = wasPlanning.current && !planning;
		wasPlanning.current = planning;
		if (finished && ready && planModeEnabled) void load({ quiet: true, refreshMode: true });
	}, [planning, planModeEnabled, ready, load]);

	// …and poll quietly while the planning turn streams so edits surface live.
	useEffect(() => {
		if (!ready || switching || !isStreaming || !planModeEnabled) return;
		const timer = setInterval(() => void load({ quiet: true }), POLL_STREAMING_MS);
		return () => clearInterval(timer);
	}, [ready, switching, isStreaming, planModeEnabled, load]);

	const togglePlanMode = useCallback(async () => {
		const next = !sessionStore.getState().planModeEnabled;
		const origin = capture();
		if (!origin) return;
		setToggling(true);
		try {
			const response = await rpc.setPlanMode(next);
			if (!origin.current()) return;
			if (!response.success) {
				toast({ variant: "error", title: t("planPanel.toggleFailed"), message: response.error });
				return;
			}
			const mode = response.data as PlanModeState | undefined;
			const enabled = mode?.enabled ?? next;
			sessionStore.setState({ planModeEnabled: enabled });
		} catch (cause) {
			if (origin.current())
				toast({ variant: "error", title: t("planPanel.toggleFailed"), message: describeError(cause) });
		} finally {
			setToggling(false);
		}
	}, [capture, rpc, t, sessionStore]);

	/** `local://<name>` when the file lives in the session-local root (how the agent refers to it). */
	const displayPath = useMemo(() => {
		const normalized = planFile?.replace(/\\/g, "/");
		const root = localRoot?.replace(/\\/g, "/");
		if (normalized && root && normalized.startsWith(`${root}/`)) {
			return `local://${normalized.slice(root.length + 1)}`;
		}
		return planFile ?? planFilePath;
	}, [planFile, localRoot, planFilePath]);

	const feedbackEditor = usePlanFeedbackEditor(displayPath);
	const activeDraft = draft?.planPath === displayPath ? draft : null;
	const comments = activeDraft?.comments ?? EMPTY_COMMENTS;
	const submit = async (kind: "approve" | "refine") => {
		const origin = capture();
		if (!origin || submitting.current) return;
		const feedback = kind === "refine" ? planFeedbackText(comments) : "";
		if (kind === "refine" && !feedback) return;
		submitting.current = true;
		setSubmission(kind);
		try {
			const target = displayPath ?? t("planPanel.fallbackTarget");
			const message =
				kind === "approve"
					? t("planPanel.approveMessage", { target })
					: t("planPanel.reviseMessage", { target, feedback });
			const response = sessionStore.getState().isStreaming ? await rpc.steer(message) : await rpc.prompt(message);
			if (!origin.current()) return;
			if (!response.success) {
				toast({ variant: "error", title: t("planPanel.feedbackFailed"), message: response.error });
				return;
			}
			if (kind === "approve") toast({ variant: "success", message: t("planPanel.approvalSent") });
			else setDraft(current => (current === draft ? null : current));
		} catch (cause) {
			if (origin.current())
				toast({ variant: "error", title: t("planPanel.feedbackFailed"), message: describeError(cause) });
		} finally {
			submitting.current = false;
			setSubmission(null);
		}
	};

	const sections = useMemo(() => parsePlanSections(visibleContent ?? ""), [visibleContent]);
	const stepCount = sections.reduce((count, section) => count + section.steps.length, 0);
	let checkCount = 0;
	let doneCount = 0;
	for (const section of sections)
		for (const step of section.steps) {
			if (step.checkbox) checkCount++;
			if (step.done) doneCount++;
		}
	const reviewable = ready && !switching && !writing && !error && !!content?.trim();
	const actionsDisabled = !reviewable || submission !== null || feedbackEditor.editor !== null;

	return (
		<section className="flex h-full min-h-0 flex-col" aria-label={t("dock.plan")}>
			<div className="flex shrink-0 items-center justify-between border-b border-(--omp-border-muted) px-3 py-2">
				<span className="flex items-center gap-2 text-omp-sm font-medium">
					<ClipboardList size={14} />
					{t("dock.plan")}
				</span>
				<div className="flex items-center gap-2">
					<button
						type="button"
						disabled={!ready || switching}
						aria-label={t("planPanel.refresh")}
						onClick={() => void load()}
					>
						<RefreshCw size={14} />
					</button>
					<button
						type="button"
						role="switch"
						aria-checked={planModeEnabled}
						aria-label={t("planPanel.toggle")}
						disabled={!ready || switching || toggling}
						onClick={() => void togglePlanMode()}
					>
						{t(planModeEnabled ? "planPanel.exit" : "planPanel.badge.on")}
					</button>
				</div>
			</div>
			{(planning || checkCount > 0) && (
				<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-(--omp-border-muted) px-3 py-2 text-omp-xs text-(--omp-muted)">
					{planning && (
						<span className="flex items-center gap-2" role="status">
							<Spinner size="sm" />
							{t(writing ? "planReview.writing" : "planReview.planning")}
						</span>
					)}
					{checkCount > 0 && (
						<span className="tabular-nums">{t("planPanel.checked", { done: doneCount, total: checkCount })}</span>
					)}
				</div>
			)}
			<div
				ref={scrollRef}
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
				onWheel={event => {
					if (event.deltaY < 0) {
						pinned.current = false;
						setFollowing(false);
					}
				}}
				onTouchMove={() => {
					pinned.current = false;
					setFollowing(false);
				}}
				onKeyDown={event => {
					if (event.target === event.currentTarget && ["ArrowUp", "PageUp", "Home"].includes(event.key)) {
						pinned.current = false;
						setFollowing(false);
					}
				}}
				onScroll={event => {
					const el = event.currentTarget;
					const latest = el.scrollHeight - el.scrollTop - el.clientHeight <= 1;
					pinned.current = latest;
					setFollowing(latest);
				}}
				tabIndex={0}
			>
				{error && visibleContent?.trim() && (
					<p role="status" className="px-3 pt-2 text-omp-xs text-(--omp-warning)">
						{error}
					</p>
				)}
				{loading && !loaded && visibleContent === null ? (
					<div className="flex items-center justify-center py-6">
						<Spinner />
					</div>
				) : error && !visibleContent?.trim() ? (
					<div className="flex flex-col items-center justify-center gap-2 px-6 py-4 text-center">
						<FileWarning className="text-(--omp-warning)" size={20} />
						<div className="text-omp-sm leading-snug text-(--omp-muted)">{error}</div>
						<Button onClick={() => void load()} size="sm">
							{t("planPanel.retry")}
						</Button>
					</div>
				) : !visibleContent?.trim() ? (
					<div className="flex flex-col items-center justify-center gap-2 px-6 py-4 text-center">
						<ClipboardList className="text-(--omp-dim)" size={20} />
						<div className="text-omp-xs text-(--omp-muted)">
							{t(visibleContent === null ? "planPanel.emptyTitle" : "planPanel.emptySoFar")}
						</div>
						<div className="text-omp-sm leading-snug text-(--omp-dim)">
							{t("planPanel.emptyDescPre")}
							<span className="font-mono">local://&lt;slug&gt;-plan.md</span>
							{t("planPanel.emptyDescPost")}
						</div>
						{displayPath && (
							<div
								className="max-w-full wrap-anywhere font-mono text-omp-xs text-(--omp-dim)"
								title={displayPath}
							>
								{displayPath}
							</div>
						)}
					</div>
				) : (
					<>
						<Tabs
							activeId={tab}
							ariaLabel={t("planPanel.tabsAria")}
							className="mx-3 mt-3"
							compact
							onChange={setTab}
							tabs={[
								{ id: "preview", label: t("filesPanel.preview") },
								{ id: "steps", label: t("planPanel.tabs.steps"), badge: stepCount > 0 ? stepCount : undefined },
								{ id: "raw", label: t("planPanel.tabs.raw") },
							]}
						/>
						<div className="min-w-0 px-3 py-2.5">
							<PlanFeedback
								comments={comments}
								controller={feedbackEditor}
								disabled={!reviewable || submission !== null}
								onCommentsChange={next => setDraft({ planPath: displayPath, comments: next })}
							>
								{tab === "preview" ? (
									<div className="min-w-0 wrap-anywhere text-omp-md" data-plan-preview>
										<MarkdownRenderer content={visibleContent} />
									</div>
								) : tab === "raw" ? (
									<pre className="font-mono text-omp-sm leading-relaxed whitespace-pre-wrap wrap-anywhere text-(--omp-text)">
										{visibleContent}
									</pre>
								) : sections.length === 0 ? (
									<div className="px-2 py-4 text-center text-omp-sm text-(--omp-dim)">
										{visibleContent.trim().length === 0 ? t("planPanel.emptySoFar") : t("planPanel.noSteps")}
									</div>
								) : (
									sections.map((section, sectionIndex) => (
										<section className="mb-1.5" key={sectionIndex}>
											{section.heading && (
												<div className="wrap-anywhere px-1 py-1 text-omp-sm font-semibold text-(--omp-text)">
													{section.heading}
												</div>
											)}
											<div className="ml-1 border-l border-(--omp-border-muted) pl-2">
												{section.steps.map(step => (
													<div key={step.index} className="flex items-start gap-1.5 py-1 pr-1">
														{step.checkbox ? (
															step.done ? (
																<CheckCircle2
																	className="mt-px shrink-0 text-(--omp-success)"
																	size={13}
																/>
															) : (
																<Circle className="mt-px shrink-0 text-(--omp-dim)" size={13} />
															)
														) : (
															<span className="w-4 shrink-0 pt-px text-right text-omp-xs tabular-nums text-(--omp-dim)">
																{step.index}
															</span>
														)}
														<span
															className={cx(
																"min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere text-omp-md leading-relaxed",
																step.done ? "text-(--omp-muted) line-through" : "text-(--omp-text)",
															)}
														>
															{step.text}
														</span>
													</div>
												))}
											</div>
										</section>
									))
								)}
							</PlanFeedback>
						</div>
					</>
				)}
			</div>
			{!following && (
				<Button
					className="shrink-0 self-center my-2"
					size="sm"
					onClick={() => {
						pinned.current = true;
						setFollowing(true);
						if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
					}}
				>
					{t("chat.jumpToLatest")}
				</Button>
			)}
			<div className="shrink-0 border-t border-(--omp-border-muted) p-3">
				<div className="grid grid-cols-2 gap-1.5">
					<Button
						className="h-auto! min-h-7 min-w-0 py-1 whitespace-normal"
						disabled={actionsDisabled}
						icon={<CheckCircle2 size={12} />}
						loading={submission === "approve"}
						onClick={() => void submit("approve")}
						size="sm"
						variant="primary"
					>
						{t("planPanel.approve")}
					</Button>
					<Button
						className="h-auto! min-h-7 min-w-0 py-1 whitespace-normal"
						disabled={actionsDisabled || comments.length === 0}
						loading={submission === "refine"}
						size="sm"
						onClick={() => void submit("refine")}
					>
						{t("planPanel.requestChanges")}
					</Button>
				</div>
				{reviewable && (
					<p className="mt-1.5 text-omp-xs leading-snug text-(--omp-dim)">{t("planPanel.footerNote")}</p>
				)}
			</div>
		</section>
	);
}
