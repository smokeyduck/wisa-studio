/**
 * PlanApprovalPanel + use-plan-approval: proposal capture, per-option RPC mapping,
 * refinement, dismissal, fallback options and persistent non-modal review.
 * Rendered with react-dom/client into a linkedom document (see
 * ForkHandoffDialogs.test.tsx for the pattern).
 */

import { parseHTML } from "linkedom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { AgentSessionEvent, RpcResponse } from "../../../shared/rpc-types";
import { I18nProvider } from "../../lib/i18n";
import { usePlanApprovalStore } from "../../stores/plan-approval";
import { useSessionStore } from "../../stores/session";
import { useToastStore } from "../../stores/toast";
import { PlanApprovalPanel } from "./PlanApprovalPanel";
import { usePlanApproval } from "../../hooks/use-plan-approval";

function PlanReview() { usePlanApproval(); return <PlanApprovalPanel />; }

const { document, window, Event, HTMLElement, Node } = parseHTML("<html><body></body></html>");

const globals = globalThis as Record<string, unknown>;
globals.document = document;
globals.window = window;
globals.Event = Event;
globals.HTMLElement = HTMLElement;
globals.Node = Node;
globals.IS_REACT_ACT_ENVIRONMENT = true;
globals.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);
globals.cancelAnimationFrame = clearTimeout;

const elementPrototype = HTMLElement.prototype as unknown as Record<string, unknown>;
if (typeof elementPrototype.focus !== "function") elementPrototype.focus = () => {};

/** Structural stand-in for linkedom nodes, keeping tests decoupled from its types. */
interface TestElement {
	textContent: string | null;
	className: string;
	disabled: boolean;
	value: string;
	remove: () => void;
	appendChild: (child: TestElement) => void;
	dispatchEvent: (event: object) => boolean;
}

function success(data: unknown): RpcResponse {
	return { type: "response", command: "plan_approval", success: true, data };
}

function failure(error: string): RpcResponse {
	return { type: "response", command: "plan_approval", success: false, error };
}

type PlanApprovalFn = (
	approved: boolean,
	option?: string,
	feedback?: string,
	savePath?: string,
) => Promise<RpcResponse>;
type SaveDialogFn = (
	defaultPath?: string,
	filters?: { name: string; extensions: string[] }[],
) => Promise<string | null>;
type BatchListener = (events: AgentSessionEvent[]) => void;

let batchListener: BatchListener | null = null;

function installMockOmp(
	planApproval: Mock<PlanApprovalFn>,
	showSaveDialog: Mock<SaveDialogFn> = vi.fn(async () => "/work/auth-refactor.md"),
): void {
	batchListener = null;
	const ompWindow = window as unknown as {
		omp: {
			rpc: { planApproval: Mock<PlanApprovalFn> };
			events: { onBatch: (callback: BatchListener) => () => void };
			system: { showSaveDialog: Mock<SaveDialogFn> };
		};
	};
	ompWindow.omp = {
		rpc: { planApproval },
		system: { showSaveDialog },
		events: {
			onBatch: callback => {
				batchListener = callback;
				return () => {
					batchListener = null;
				};
			},
		},
	};
}

function proposal(content: string, overrides: Partial<Extract<AgentSessionEvent, { type: "plan_proposal" }>> = {}) {
	return {
		type: "plan_proposal",
		planFilePath: "/session/plans/2026-08-03-auth-refactor.md",
		title: "Auth refactor",
		suggestedFileName: "AUTH_REFACTOR_PLAN.md",
		planContent: content,
		options: ["execute", "compact", "keep_context", "save", "refine"],
		...overrides,
	} satisfies AgentSessionEvent;
}

let container: TestElement;
let root: Root;

beforeEach(() => {
	useSessionStore.setState({ status: "ready" });
});

async function flush(): Promise<void> {
	await act(async () => {
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 0);
		await promise;
	});
}

async function mount(element: ReactElement): Promise<void> {
	container = document.createElement("div") as unknown as TestElement;
	document.body.appendChild(container as never);
	root = createRoot(container as unknown as Element);
	await act(async () => {
		root.render(<I18nProvider>{element}</I18nProvider>);
	});
	await flush();
}

async function emit(events: AgentSessionEvent[]): Promise<void> {
	await act(async () => {
		batchListener?.(events);
	});
	await flush();
}

function buttonWithText(text: string): TestElement | undefined {
	const buttons = Array.from(document.querySelectorAll("button")) as unknown as TestElement[];
	return buttons.find(button => button.textContent?.includes(text));
}

function click(element: TestElement): void {
	element.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
}

function keydownOnDocument(key: string): void {
	const event = new Event("keydown", { bubbles: true, cancelable: true });
	(event as unknown as { key: string }).key = key;
	document.dispatchEvent(event);
}

afterEach(async () => {
	if (root) {
		await act(async () => {
			root.unmount();
		});
	}
	container?.remove();
	usePlanApprovalStore.getState().clearProposal();
	useToastStore.setState({ toasts: [] });
	batchListener = null;
	useSessionStore.getState().reset();
});

describe("plan-approval store", () => {
	it("keeps only the latest proposal and resets feedback with the proposal lifecycle", () => {
		const store = usePlanApprovalStore.getState();
		expect(usePlanApprovalStore.getState().pending).toBeNull();
		store.showProposal({ planFilePath: "/a.md", planContent: "first", options: [] });
		const comment = { id: "first", quote: "First", feedback: "Change this" };
		usePlanApprovalStore.getState().setComments([comment]);
		expect(usePlanApprovalStore.getState().comments).toEqual([comment]);
		usePlanApprovalStore.getState().showProposal({ planFilePath: "/b.md", planContent: "second", options: [] });
		expect(usePlanApprovalStore.getState().pending?.planFilePath).toBe("/b.md");
		expect(usePlanApprovalStore.getState().comments).toEqual([]);
		usePlanApprovalStore.getState().setComments([comment]);
		usePlanApprovalStore.getState().clearProposal();
		expect(usePlanApprovalStore.getState().pending).toBeNull();
		expect(usePlanApprovalStore.getState().comments).toEqual([]);
	});
});

describe("PlanApprovalPanel", () => {
	it("renders nothing without a proposal and subscribes to plan_proposal events", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () => success({ approved: false, dispatched: false }));
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		expect(document.querySelector("[role='dialog']")).toBeNull();
		expect(batchListener).not.toBeNull();

		await emit([proposal("# The Plan\n\n1. Do the thing.")]);
		expect(document.querySelector("section[aria-label]")).not.toBeNull();
		expect(document.body.textContent).toContain("Auth refactor");
		expect(document.body.textContent).toContain("Do the thing.");
	});

	it("shows one button per advertised option and approves with the matching option", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () => success({ approved: true, dispatched: true }));
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([proposal("# Plan")]);

		expect(buttonWithText("Approve and execute")).toBeDefined();
		expect(buttonWithText("Approve and compact")).toBeDefined();
		expect(buttonWithText("Keep context")).toBeDefined();
		expect(buttonWithText("Save plan")).toBeDefined();
		expect(buttonWithText("Refine plan")).toBeDefined();
		expect(buttonWithText("Dismiss")).toBeDefined();

		const compact = buttonWithText("Approve and compact");
		if (!compact) throw new Error("missing compact button");
		await act(async () => click(compact));
		await flush();
		expect(planApproval).toHaveBeenCalledWith(true, "compact");
		// Dispatched → dialog closes with a success toast.
		expect(usePlanApprovalStore.getState().pending).toBeNull();
		expect(document.querySelector("[role='dialog']")).toBeNull();
		expect(useToastStore.getState().toasts.some(t => t.variant === "success")).toBe(true);
	});

	it("saves the plan to the host-selected Markdown path without dispatching execution", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () =>
			success({
				approved: true,
				dispatched: false,
				reason: "saved",
				savedPath: "/work/auth-refactor.md",
				freshSessionStarted: true,
			}),
		);
		const showSaveDialog = vi.fn<SaveDialogFn>(async () => "/work/auth-refactor.md");
		installMockOmp(planApproval, showSaveDialog);
		await mount(<PlanReview />);
		await emit([proposal("# Plan")]);

		const save = buttonWithText("Save plan");
		if (!save) throw new Error("missing save button");
		await act(async () => click(save));
		await flush();

		expect(showSaveDialog).toHaveBeenCalledWith(expect.stringContaining("AUTH_REFACTOR_PLAN.md"), [
			{ name: "Markdown", extensions: ["md"] },
		]);
		expect(planApproval).toHaveBeenCalledWith(true, "save", undefined, "/work/auth-refactor.md");
		expect(usePlanApprovalStore.getState().pending).toBeNull();
		expect(useToastStore.getState().toasts.at(-1)?.message).toContain("/work/auth-refactor.md");
		expect(useToastStore.getState().toasts.at(-1)?.variant).toBe("success");
	});

	it("closes with a warning when the plan saved but the fresh session was cancelled", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () =>
			success({
				approved: true,
				dispatched: false,
				reason: "saved; new session cancelled",
				savedPath: "/work/auth-refactor.md",
				freshSessionStarted: false,
			}),
		);
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([proposal("# Plan")]);

		const save = buttonWithText("Save plan");
		if (!save) throw new Error("missing save button");
		await act(async () => click(save));
		await flush();

		expect(usePlanApprovalStore.getState().pending).toBeNull();
		expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ variant: "warning" });
		expect(useToastStore.getState().toasts.at(-1)?.message).toContain("new session cancelled");
	});

	it("maps keep_context to planApproval(true, 'keep_context')", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () => success({ approved: true, dispatched: true }));
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([proposal("# Plan")]);

		const keepContext = buttonWithText("Keep context");
		if (!keepContext) throw new Error("missing keep-context button");
		await act(async () => click(keepContext));
		await flush();
		expect(planApproval).toHaveBeenCalledWith(true, "keep_context");
		expect(usePlanApprovalStore.getState().pending).toBeNull();
	});

	it("does not open an unanchored editor or send until there are selected-text comments", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () => success({ approved: false, dispatched: true }));
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([proposal("# Plan")]);

		const refineBefore = buttonWithText("Refine plan");
		if (!refineBefore) throw new Error("missing refine button");
		expect(document.querySelector("textarea")).toBeNull();
		expect(refineBefore.disabled).toBe(true);
		await act(async () => click(refineBefore));
		expect(document.querySelector("textarea")).toBeNull();
		expect(planApproval).not.toHaveBeenCalled();

		await act(async () => {
			usePlanApprovalStore.getState().setComments([{ id: "rollback", quote: "# Plan", feedback: "Add a rollback step." }]);
		});
		await flush();

		const refine = buttonWithText("Refine plan");
		if (!refine) throw new Error("missing refine button");
		expect(refine.disabled).toBe(false);
		await act(async () => click(refine));
		await flush();
		expect(planApproval).toHaveBeenCalledWith(false, undefined, "> # Plan\n\nAdd a rollback step.");
		expect(usePlanApprovalStore.getState().pending).toBeNull();
		expect(usePlanApprovalStore.getState().comments).toEqual([]);
	});

	it("keeps separate quoted comments in the refine RPC payload", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () => success({ approved: false, dispatched: true }));
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([proposal("# The Plan\n\nOne task.\n\nTwo tasks.")]);
		const first = { id: "1", quote: "One task.", feedback: "Document the rollback." };
		const second = { id: "2", quote: "Two tasks.\nShip separately.", feedback: "Add an integration check." };
		await act(async () => usePlanApprovalStore.getState().setComments([first, second]));
		expect(document.querySelectorAll("blockquote")).toHaveLength(2);
		expect(document.querySelector("textarea")).toBeNull();
		expect(planApproval).not.toHaveBeenCalled();
		const refine = buttonWithText("Refine plan");
		if (!refine) throw new Error("missing refine button");
		await act(async () => click(refine));
		await flush();
		expect(planApproval).toHaveBeenCalledWith(false, undefined,
			"> One task.\n\nDocument the rollback.\n\n---\n\n> Two tasks.\n> Ship separately.\n\nAdd an integration check.");
		expect(usePlanApprovalStore.getState().comments).toEqual([]);
	});

	it("opens an inline editor quoting the selected passage without calling the sidecar", async () => {
		const planApproval = vi.fn<PlanApprovalFn>();
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([proposal("# Plan heading\n\nOne task to review.")]);
		const text = document.querySelector(".markdown-body p")?.firstChild;
		if (!text) throw new Error("missing plan paragraph");
		const previous = Object.getOwnPropertyDescriptor(document, "getSelection");
		const selection = {
			isCollapsed: false,
			rangeCount: 1,
			toString: () => "One task",
			getRangeAt: () => ({
				startContainer: text,
				endContainer: text,
				getBoundingClientRect: () => ({ width: 50, height: 15, bottom: 40 }),
				cloneContents: () => {
					const fragment = document.createDocumentFragment();
					fragment.append(document.createTextNode("One task"));
					return fragment;
				},
			}),
			removeAllRanges: vi.fn(),
		};
		Object.defineProperty(document, "getSelection", { configurable: true, value: () => selection });
		try {
			await act(async () => { document.dispatchEvent(new Event("selectionchange")); });
			await flush();
			const action = document.querySelector("[data-plan-comment-action]") as unknown as TestElement | null;
			if (!action) throw new Error("missing selection action");
			await act(async () => click(action));
			expect(document.querySelector("textarea")).not.toBeNull();
			expect(document.querySelector("blockquote")?.textContent).toBe("One task");
			expect(selection.removeAllRanges).toHaveBeenCalledOnce();
			expect(planApproval).not.toHaveBeenCalled();
		} finally {
			if (previous) Object.defineProperty(document, "getSelection", previous);
			else Reflect.deleteProperty(document, "getSelection");
		}
	});

	it("never applies a delayed Save dialog to a replacement proposal", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () => success({ approved: true, dispatched: false }));
		const path = Promise.withResolvers<string | null>();
		installMockOmp(planApproval, vi.fn<SaveDialogFn>(() => path.promise));
		await mount(<PlanReview />);
		await emit([proposal("# Old Plan")]);
		const save = buttonWithText("Save plan");
		if (!save) throw new Error("missing save button");
		await act(async () => click(save));
		await emit([proposal("# Replacement Plan")]);
		await act(async () => path.resolve("/work/old.md"));
		expect(planApproval).not.toHaveBeenCalled();
		expect(usePlanApprovalStore.getState().pending?.planContent).toBe("# Replacement Plan");
	});

	it("dismisses with planApproval(false) and closes", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () =>
			success({ approved: false, dispatched: false, reason: "rejected" }),
		);
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([proposal("# Plan")]);

		const dismiss = buttonWithText("Dismiss");
		if (!dismiss) throw new Error("missing dismiss button");
		await act(async () => click(dismiss));
		await flush();
		expect(planApproval).toHaveBeenCalledWith(false);
		expect(usePlanApprovalStore.getState().pending).toBeNull();
		expect(document.querySelector("[role='dialog']")).toBeNull();
	});

	it("does not dismiss the persistent sidebar on Escape", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () => success({ approved: false, dispatched: false }));
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([proposal("# Plan")]);
		await act(async () => keydownOnDocument("Escape"));
		expect(planApproval).not.toHaveBeenCalled();
		expect(usePlanApprovalStore.getState().pending).not.toBeNull();
	});

	it("falls back to execute/refine/dismiss when options are empty", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () => success({ approved: true, dispatched: true }));
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([proposal("# Plan", { options: [] })]);

		expect(buttonWithText("Approve and execute")).toBeDefined();
		expect(buttonWithText("Approve and compact")).toBeUndefined();
		expect(buttonWithText("Keep context")).toBeUndefined();
		expect(buttonWithText("Refine plan")).toBeDefined();

		const execute = buttonWithText("Approve and execute");
		if (!execute) throw new Error("missing execute button");
		await act(async () => click(execute));
		await flush();
		expect(planApproval).toHaveBeenCalledWith(true, "execute");
	});

	it("shows the latest proposal when rapid proposals arrive", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () => success({ approved: true, dispatched: true }));
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([
			proposal("# Old plan", { title: "Old title", planFilePath: "/plans/old.md" }),
			proposal("# New plan", { title: "New title", planFilePath: "/plans/new.md" }),
		]);
		expect(document.body.textContent).toContain("New title");
		expect(document.body.textContent).not.toContain("Old title");
	});

	it("stays open with an error toast when the RPC fails", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () => failure("no plan is awaiting approval"));
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([proposal("# Plan")]);

		const execute = buttonWithText("Approve and execute");
		if (!execute) throw new Error("missing execute button");
		await act(async () => click(execute));
		await flush();
		expect(usePlanApprovalStore.getState().pending).not.toBeNull();
		expect(document.querySelector("section[aria-label]")).not.toBeNull();
		expect(useToastStore.getState().toasts.some(t => t.variant === "error")).toBe(true);
	});

	it("shows the reason inline when approval is recorded but not dispatched", async () => {
		const planApproval = vi.fn<PlanApprovalFn>(async () =>
			success({ approved: true, dispatched: false, reason: "compaction failed: model offline" }),
		);
		installMockOmp(planApproval);
		await mount(<PlanReview />);
		await emit([proposal("# Plan")]);

		const compact = buttonWithText("Approve and compact");
		if (!compact) throw new Error("missing compact button");
		await act(async () => click(compact));
		await flush();
		expect(usePlanApprovalStore.getState().pending).not.toBeNull();
		expect(document.body.textContent).toContain("compaction failed: model offline");
	});
});
