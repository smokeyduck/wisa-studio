import { MessageSquarePlus } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n";
import { isImeKeyEvent } from "../../lib/ime";
import { rangeQuoteText } from "../../lib/quote-selection";
import type { PlanComment } from "../../stores/plan-approval";
import { Button, TextArea } from "../common";

interface FeedbackEditor {
	id: string;
	quote: string;
	draft: string;
	top: number | null;
}

interface PlanFeedbackController {
	editor: FeedbackEditor | null;
	open(quote: string, top: number | null, trigger: HTMLElement | null, existing?: PlanComment): void;
	update(draft: string): void;
	close(): void;
}

export function usePlanFeedbackEditor(scope: object | string | null): PlanFeedbackController {
	const [state, setState] = useState<{ scope: typeof scope; editor: FeedbackEditor } | null>(null);
	const editor = state && state.scope === scope ? state.editor : null;
	const returnFocus = useRef<HTMLElement | null>(null);
	return {
		editor,
		open(quote: string, top: number | null, trigger: HTMLElement | null, existing?: PlanComment) {
			returnFocus.current = trigger;
			setState({
				scope,
				editor: { id: existing?.id ?? crypto.randomUUID(), quote, top, draft: existing?.feedback ?? "" },
			});
		},
		update(draft: string) {
			setState(current =>
				current && current.scope === scope ? { scope, editor: { ...current.editor, draft } } : current,
			);
		},
		close() {
			setState(null);
			const target = returnFocus.current;
			returnFocus.current = null;
			if (target)
				requestAnimationFrame(() => {
					if (target.isConnected) target.focus({ preventScroll: true });
				});
		},
	};
}

interface PlanFeedbackProps {
	children: ReactNode;
	comments: readonly PlanComment[];
	onCommentsChange: (comments: PlanComment[]) => void;
	controller: PlanFeedbackController;
	disabled: boolean;
}

/** Selection is confined to this document; saved excerpts stay attached to their own drafts. */
export function PlanFeedback({ children, comments, onCommentsChange, controller, disabled }: PlanFeedbackProps) {
	const t = useT();
	const { editor } = controller;
	const editing = editor !== null;
	const region = useRef<HTMLDivElement>(null);
	const documentRef = useRef<HTMLDivElement>(null);
	const actionRef = useRef<HTMLButtonElement>(null);
	const [anchor, setAnchor] = useState<number | null>(null);

	useEffect(() => {
		if (disabled || editing) {
			setAnchor(null);
			return;
		}
		let pointerDown = false;
		let frame: number | null = null;
		const measure = () => {
			frame = null;
			const node = documentRef.current;
			const range = selectedRange(node);
			const wrapper = region.current;
			if (!range || !wrapper || pointerDown) {
				setAnchor(null);
				return;
			}
			const rect = range.getBoundingClientRect();
			if (!rect.width || !rect.height) {
				setAnchor(null);
				return;
			}
			setAnchor(rect.bottom - wrapper.getBoundingClientRect().top + 4);
		};
		const schedule = () => {
			if (frame === null) frame = requestAnimationFrame(measure);
		};
		const pointerStart = (event: PointerEvent) => {
			if (actionRef.current?.contains(event.target as Node)) return;
			pointerDown = true;
			setAnchor(null);
		};
		const pointerEnd = () => {
			pointerDown = false;
			schedule();
		};
		const keyDown = (event: KeyboardEvent) => {
			if (!actionRef.current || event.defaultPrevented || isImeKeyEvent(event)) return;
			if (event.key === "Escape") {
				if (document.activeElement === actionRef.current || documentRef.current?.contains(document.activeElement))
					event.preventDefault();
				if (document.activeElement === actionRef.current) documentRef.current?.focus();
				setAnchor(null);
			} else if (event.key === "Tab" && !event.shiftKey && documentRef.current?.contains(document.activeElement)) {
				event.preventDefault();
				actionRef.current.focus();
			}
		};
		document.addEventListener("selectionchange", schedule);
		document.addEventListener("pointerdown", pointerStart, true);
		document.addEventListener("pointerup", pointerEnd, true);
		document.addEventListener("pointercancel", pointerEnd, true);
		document.addEventListener("keydown", keyDown);
		window.addEventListener("resize", schedule);
		return () => {
			if (frame !== null) cancelAnimationFrame(frame);
			document.removeEventListener("selectionchange", schedule);
			document.removeEventListener("pointerdown", pointerStart, true);
			document.removeEventListener("pointerup", pointerEnd, true);
			document.removeEventListener("pointercancel", pointerEnd, true);
			document.removeEventListener("keydown", keyDown);
			window.removeEventListener("resize", schedule);
		};
	}, [disabled, editing]);

	const commentOnSelection = () => {
		const range = selectedRange(documentRef.current);
		if (!range || anchor === null) return;
		const quote = rangeQuoteText(range).trim();
		if (!quote) return;
		controller.open(quote, anchor, documentRef.current);
		document.getSelection()?.removeAllRanges();
		setAnchor(null);
	};

	const save = () => {
		if (!editor || disabled) return;
		const next = editor.draft.trim();
		if (!next) return;
		const saved = { id: editor.id, quote: editor.quote, feedback: next };
		const index = comments.findIndex(comment => comment.id === editor.id);
		onCommentsChange(index === -1 ? [...comments, saved] : comments.with(index, saved));
		controller.close();
	};

	return (
		<div ref={region} className="relative min-w-0">
			<div ref={documentRef} tabIndex={disabled ? -1 : 0}>
				{children}
			</div>
			{anchor !== null && !disabled && !editor && (
				<button
					ref={actionRef}
					type="button"
					data-plan-comment-action
					className="omp-quote-action omp-pop-in absolute right-0 z-10 flex h-7 items-center gap-1.5 rounded-lg border border-(--omp-border) bg-(--omp-bg-elevated) px-2.5 text-omp-xs font-medium text-(--omp-text) shadow-(--omp-shadow-md) hover:bg-(--omp-selected-bg)"
					style={{ top: anchor }}
					onMouseDown={event => event.preventDefault()}
					onClick={commentOnSelection}
				>
					<MessageSquarePlus size={12} aria-hidden="true" />
					{t("planReview.addComment")}
				</button>
			)}
			{!disabled && !editor && <p className="mt-2 text-omp-xs text-(--omp-dim)">{t("planReview.selectHint")}</p>}
			{comments.length > 0 && (
				<ul className="mt-3 space-y-2">
					{comments.map(comment => (
						<li key={comment.id} className="rounded border border-(--omp-border-muted) p-2">
							<blockquote className="border-l-2 border-(--omp-border) pl-2 whitespace-pre-wrap wrap-anywhere text-omp-xs text-(--omp-muted)">
								{comment.quote}
							</blockquote>
							<p className="mt-1 whitespace-pre-wrap wrap-anywhere text-omp-sm">{comment.feedback}</p>
							<div className="mt-1 flex flex-wrap gap-1">
								<Button
									size="sm"
									variant="ghost"
									disabled={disabled || !!editor}
									onClick={event => controller.open(comment.quote, null, event.currentTarget, comment)}
								>
									{t("planReview.editComment")}
								</Button>
								<Button
									size="sm"
									variant="ghost"
									disabled={disabled || !!editor}
									onClick={() => onCommentsChange(comments.filter(item => item.id !== comment.id))}
								>
									{t("planReview.removeComment")}
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
			{editor && !disabled && (
				<div
					className={`rounded-md border border-(--omp-border) bg-(--omp-bg-elevated) p-2 ${editor.top === null ? "mt-2" : "absolute inset-x-0 z-10 shadow-(--omp-shadow-md)"}`}
					style={editor.top === null ? undefined : { top: editor.top }}
					onKeyDown={event => {
						if (event.key !== "Escape" || isImeKeyEvent(event)) return;
						event.preventDefault();
						event.stopPropagation();
						controller.close();
					}}
				>
					<blockquote className="mb-2 max-h-24 overflow-y-auto border-l-2 border-(--omp-border) pl-2 whitespace-pre-wrap wrap-anywhere text-omp-xs text-(--omp-muted)">
						{editor.quote}
					</blockquote>
					<TextArea
						autoFocus
						value={editor.draft}
						label={t("planApproval.refineLabel")}
						placeholder={t("planPanel.feedbackPlaceholder")}
						maxLength={8000}
						rows={2}
						onChange={event => controller.update(event.target.value)}
					/>
					<div className="mt-2 flex flex-wrap gap-1">
						<Button size="sm" variant="primary" disabled={!editor.draft.trim()} onClick={save}>
							{t("planReview.saveComment")}
						</Button>
						<Button size="sm" variant="ghost" onClick={controller.close}>
							{t("common.cancel")}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

function selectedRange(node: HTMLElement | null): Range | null {
	const selection = document.getSelection?.();
	if (!node || !selection || selection.isCollapsed || selection.rangeCount !== 1 || !selection.toString().trim())
		return null;
	const range = selection.getRangeAt(0);
	return node.contains(range.startContainer) && node.contains(range.endContainer) ? range : null;
}
