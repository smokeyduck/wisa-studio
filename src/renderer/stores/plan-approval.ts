/**
 * Plan-approval store: holds the pending structured plan proposal emitted by
 * the agent (`plan_proposal` event) for the owning session's plan inspector. The sidecar
 * can only have one plan awaiting approval at a time, so a new proposal
 * replaces the previous one (latest wins). The refine feedback lives here too
 * so it resets with the proposal lifecycle and survives inspector remounts.
 */

import { createStore } from "zustand/vanilla";
import { toBlockquote } from "../lib/quote-selection";
import { createScopedStoreApi, useScopedStore } from "./session-runtime-context";

export interface PendingPlanProposal {
	planFilePath: string;
	title?: string;
	suggestedFileName?: string;
	planContent: string;
	/** Approval choices advertised on the frame, including GUI save-only review. */
	options: string[];
}

export type PlanApprovalOption = "execute" | "compact" | "keep_context" | "save";
export type PlanApprovalSubmitState = { kind: "approve"; option?: PlanApprovalOption } | { kind: "refine" | "dismiss" };

export interface PlanComment {
	id: string;
	quote: string;
	feedback: string;
}

export function planFeedbackText(comments: readonly PlanComment[]): string {
	return comments.map(comment => `${toBlockquote(comment.quote)}\n\n${comment.feedback}`).join("\n\n---\n\n");
}

export interface PlanApprovalSnapshot {
	/** The proposal awaiting a host decision; null when answered. */
	pending: PendingPlanProposal | null;
	/** Feedback drafts keyed independently, even when two excerpts have the same text. */
	comments: PlanComment[];
	/** A successful approval that could not dispatch remains actionable. */
	notice: string | null;
	/** Submission state follows its owning tab so switching away cannot re-submit it. */
	submitting: PlanApprovalSubmitState | null;
}

export interface PlanApprovalStore extends PlanApprovalSnapshot {
	/** Show a proposal, replacing any previous one (latest wins). */
	showProposal: (proposal: PendingPlanProposal) => void;
	setComments: (comments: PlanComment[]) => void;
	setNotice: (notice: string | null) => void;
	setSubmitting: (submitting: PlanApprovalSubmitState | null) => void;
	/** Drop the pending proposal once it has been answered or dismissed. */
	clearProposal: () => void;
}

export const createPlanApprovalStore = () =>
	createStore<PlanApprovalStore>()(set => ({
		pending: null,
		comments: [],
		notice: null,
		submitting: null,
		showProposal: proposal => set({ pending: proposal, comments: [], notice: null, submitting: null }),
		setComments: comments => set({ comments }),
		setNotice: notice => set({ notice }),
		setSubmitting: submitting => set({ submitting }),
		clearProposal: () => set({ pending: null, comments: [], notice: null, submitting: null }),
	}));

const defaultPlanApprovalStore = createPlanApprovalStore();
function usePlanApproval(): PlanApprovalStore;
function usePlanApproval<U>(selector: (state: PlanApprovalStore) => U): U;
function usePlanApproval<U = PlanApprovalStore>(selector?: (state: PlanApprovalStore) => U): U {
	return useScopedStore("planApproval", defaultPlanApprovalStore, selector);
}
export const usePlanApprovalStore = Object.assign(
	usePlanApproval,
	createScopedStoreApi("planApproval", defaultPlanApprovalStore),
);

/** Fire-and-forget helper for non-component call sites. */
export function clearPendingPlanProposal(): void {
	usePlanApprovalStore.getState().clearProposal();
}
