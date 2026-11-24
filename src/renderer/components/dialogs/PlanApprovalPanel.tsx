/** Structured plan approval lives exclusively in the owning session's inspector. */

import { ClipboardList, History, ListCollapse, Play, Save, Send } from "lucide-react";
import type { ReactNode } from "react";
import { basename } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { MarkdownRenderer } from "../../lib/markdown";
import { acceptsActiveTabEvents } from "../../lib/tab-routing";
import { useTabRpc } from "../../lib/tab-rpc";
import {
	type PlanApprovalOption,
	type PlanApprovalStore,
	type PlanApprovalSubmitState,
	planFeedbackText,
	usePlanApprovalStore,
} from "../../stores/plan-approval";
import { type SessionStore, useSessionStore } from "../../stores/session";
import { sessionRuntime, sessionRuntimeStore, useSessionRuntime } from "../../stores/session-runtime-context";
import { settleTabPlanApproval, useTabsStore } from "../../stores/tabs";
import { toast } from "../../stores/toast";
import { Button, LongTaskStatus } from "../common";
import { PlanFeedback, usePlanFeedbackEditor } from "../panels/PlanFeedback";

type SubmitKind = PlanApprovalSubmitState["kind"];

/** Wire result of the `plan_approval` command (RpcPlanApprovalResult). */
interface PlanApprovalResult {
	approved: boolean;
	dispatched: boolean;
	reason?: string;
	savedPath?: string;
	freshSessionStarted?: boolean;
}

const APPROVE_CHOICES: Record<PlanApprovalOption, { labelKey: string; hintKey: string; icon: ReactNode }> = {
	execute: {
		labelKey: "planApproval.approve.execute.label",
		hintKey: "planApproval.approve.execute.hint",
		icon: <Play size={12} />,
	},
	compact: {
		labelKey: "planApproval.approve.compact.label",
		hintKey: "planApproval.approve.compact.hint",
		icon: <ListCollapse size={12} />,
	},
	keep_context: {
		labelKey: "planApproval.approve.keepContext.label",
		hintKey: "planApproval.approve.keepContext.hint",
		icon: <History size={12} />,
	},
	save: {
		labelKey: "planApproval.approve.save.label",
		hintKey: "planApproval.approve.save.hint",
		icon: <Save size={12} />,
	},
};

/** Approve buttons from the advertised options; falls back to execute when none are recognizable. */
function approveOptionsOf(options: string[]): PlanApprovalOption[] {
	const known = options.filter(
		(option): option is PlanApprovalOption =>
			option === "execute" || option === "compact" || option === "keep_context" || option === "save",
	);
	return known.length > 0 ? known : ["execute"];
}

export function PlanApprovalPanel() {
	const tabRpc = useTabRpc();
	const t = useT();
	const pending = usePlanApprovalStore(state => state.pending);
	const editor = usePlanFeedbackEditor(pending);
	const runtime = useSessionRuntime();
	const comments = usePlanApprovalStore(state => state.comments);
	const setComments = usePlanApprovalStore(state => state.setComments);
	const notice = usePlanApprovalStore(state => state.notice);
	const submitting = usePlanApprovalStore(state => state.submitting);
	const sidecarReady = useSessionStore(state => state.status) === "ready";
	const maintenance = useSessionStore(state => state.manualMaintenance);

	if (!pending) return null;

	const respond = async (kind: SubmitKind, option?: PlanApprovalOption) => {
		const target = pending;
		const originTabId = runtime?.tabId ?? useTabsStore.getState().activeTabId;
		const generation = runtime?.sessionGeneration;
		const session = sessionRuntimeStore<SessionStore>(originTabId, "session") ?? useSessionStore;
		const store = sessionRuntimeStore<PlanApprovalStore>(originTabId, "planApproval") ?? usePlanApprovalStore;
		const { sessionId: originSessionId, cwd } = session.getState();
		const ownsDecision = () =>
			(runtime
				? sessionRuntime(originTabId) === runtime && runtime.sessionGeneration === generation
				: useTabsStore.getState().activeTabId === originTabId && acceptsActiveTabEvents()) &&
			!session.getState().switchPending &&
			session.getState().status === "ready" &&
			session.getState().sessionId === originSessionId &&
			store.getState().pending === target;
		if (!ownsDecision() || store.getState().submitting !== null) return;
		const trimmed = kind === "refine" ? planFeedbackText(store.getState().comments) : "";
		if (kind === "refine" && !trimmed) return;
		store.getState().setSubmitting(kind === "approve" ? { kind, option } : { kind });
		try {
			let savePath: string | null | undefined;
			if (kind === "approve" && option === "save") {
				savePath = await window.omp.system.showSaveDialog(
					`${cwd}/${target.suggestedFileName ?? basename(target.planFilePath)}`,
					[{ name: "Markdown", extensions: ["md"] }],
				);
				if (!savePath || !ownsDecision()) {
					settleTabPlanApproval(originTabId, originSessionId, target, { submitting: null });
					return;
				}
			}
			const response =
				kind === "approve"
					? option === "save"
						? await tabRpc.planApproval(true, option, undefined, savePath ?? undefined)
						: await tabRpc.planApproval(true, option)
					: kind === "refine"
						? await tabRpc.planApproval(false, undefined, trimmed)
						: await tabRpc.planApproval(false);
			if (!response.success) {
				settleTabPlanApproval(originTabId, originSessionId, target, { submitting: null });
				toast({ variant: "error", title: t("planApproval.failed"), message: response.error });
				return;
			}
			const result = response.data as PlanApprovalResult | null | undefined;
			if (option === "save" && result?.savedPath) {
				settleTabPlanApproval(originTabId, originSessionId, target, { clear: true, exitPlanMode: true });
				toast({
					variant: result.freshSessionStarted === false ? "warning" : "success",
					message:
						result.freshSessionStarted === false
							? t("planApproval.savedWithoutFresh", {
									path: result.savedPath,
									reason: result.reason ?? t("common.unknownError"),
								})
							: t("planApproval.saved", { path: result.savedPath }),
				});
				return;
			}
			if (result && !result.dispatched) {
				if (kind === "approve") {
					// Approval stands but nothing was dispatched (e.g. compaction
					// failed) — surface the reason and stay open so the host can
					// pick another option.
					settleTabPlanApproval(originTabId, originSessionId, target, {
						exitPlanMode: true,
						notice: result.reason ?? t("planApproval.notDispatched"),
						submitting: null,
					});
					return;
				}
				// Plain reject / empty refine: resolved with nothing dispatched.
				settleTabPlanApproval(originTabId, originSessionId, target, { clear: true });
				return;
			}
			settleTabPlanApproval(originTabId, originSessionId, target, {
				clear: true,
				exitPlanMode: kind === "approve",
			});
			toast({
				variant: "success",
				message:
					kind === "approve"
						? t("planApproval.approved")
						: kind === "refine"
							? t("planApproval.refined")
							: t("planApproval.dismissed"),
			});
		} catch (cause) {
			settleTabPlanApproval(originTabId, originSessionId, target, { submitting: null });
			toast({ variant: "error", title: t("planApproval.failed"), message: String(cause) });
		}
	};

	const requestDismiss = () => {
		if (submitting !== null) return;
		void respond("dismiss");
	};

	const approveOptions = approveOptionsOf(pending.options);
	const showRefine = pending.options.length === 0 || pending.options.includes("refine");
	const busy = submitting !== null;
	const hasContent = pending.planContent.trim().length > 0;

	return (
		<section aria-label={pending.title ?? t("planApproval.reviewFallback")} className="flex h-full min-h-0 flex-col">
			<h2 className="flex shrink-0 items-center gap-2 border-b border-(--omp-border-muted) px-4 py-3 text-omp-sm font-semibold">
				<ClipboardList size={14} />
				{pending.title ?? t("planApproval.reviewFallback")}
			</h2>
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
				<div className="flex items-center gap-2 text-omp-xs text-(--omp-dim)">
					<span className="shrink-0">{t("planApproval.planFile")}</span>
					<span className="truncate font-mono" title={pending.planFilePath}>
						{basename(pending.planFilePath)}
					</span>
				</div>
				<PlanFeedback
					comments={comments}
					controller={editor}
					disabled={busy || !sidecarReady || !showRefine || !hasContent}
					onCommentsChange={setComments}
				>
					{hasContent ? (
						<MarkdownRenderer content={pending.planContent} />
					) : (
						<p className="text-omp-xs text-(--omp-dim)">{t("planApproval.emptyPlan")}</p>
					)}
				</PlanFeedback>
				{notice !== null && (
					<div className="rounded-md border border-[color-mix(in_srgb,var(--omp-warning)_35%,transparent)] bg-transparent px-3 py-2 text-omp-sm text-(--omp-warning)">
						{notice}
					</div>
				)}
			</div>
			<div className="shrink-0 border-t border-(--omp-border-muted) p-3">
				{/* Approve-and-compact runs a whole compaction first: minutes on a long session. */}
				{submitting?.kind === "approve" && submitting.option === "compact" && maintenance && (
					<LongTaskStatus
						label={t("chat.maintenance.compact")}
						onStop={() => void tabRpc.abort()}
						slowHint={t("chat.maintenance.slow")}
						startedAt={maintenance.startedAt}
					/>
				)}
				<div className="flex flex-wrap items-center justify-end gap-2">
					<Button
						disabled={!sidecarReady || busy || editor.editor !== null}
						onClick={requestDismiss}
						size="sm"
						title={!sidecarReady ? t("sidecar.notResponding") : undefined}
						variant="ghost"
					>
						{t("planApproval.dismiss")}
					</Button>
					{showRefine && (
						<Button
							disabled={!sidecarReady || busy || editor.editor !== null || comments.length === 0}
							icon={<Send size={12} />}
							loading={submitting?.kind === "refine"}
							onClick={() => void respond("refine")}
							size="sm"
							title={!sidecarReady ? t("sidecar.notResponding") : t("planApproval.refineTitle")}
							variant="secondary"
						>
							{t("planApproval.refine")}
						</Button>
					)}
					{approveOptions.map((option, index) => {
						const choice = APPROVE_CHOICES[option];
						return (
							<Button
								disabled={!hasContent || !sidecarReady || busy || editor.editor !== null}
								icon={choice.icon}
								key={option}
								loading={submitting?.kind === "approve" && submitting.option === option}
								onClick={() => void respond("approve", option)}
								size="sm"
								title={!sidecarReady ? t("sidecar.notResponding") : t(choice.hintKey)}
								variant={index === 0 ? "primary" : "secondary"}
							>
								{t(choice.labelKey)}
							</Button>
						);
					})}
				</div>
			</div>
		</section>
	);
}
