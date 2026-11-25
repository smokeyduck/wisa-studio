/**
 * Extension UI dispatcher: renders the oldest pending extension_ui_request
 * as the right surface (select / confirm / input / editor / open_url),
 * routes tool-approval selects to ApprovalDialog, turns `notify` into a
 * toast, and enforces request timeouts with a visible countdown.
 *
 * `setStatus` / `setWidget` are captured by the extension-ui store and
 * surfaced here as floating status segments / widget panels.
 * `setTitle` / `set_editor_text` / `cancel` are consumed by the store /
 * event router and never render here; if one slips into the queue it is
 * dropped silently.
 */

import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { isApprovalRequest } from "../../../shared/approval-prompt";
import type { ExtensionAskDialogResult, ExtensionUIRequest } from "../../../shared/rpc-types";
import { AnsiText } from "../../lib/ansi";
import { useT } from "../../lib/i18n";
import { MarkdownRenderer } from "../../lib/markdown";
import {
	extensionRequestReceivedAt,
	removeExtensionRequest,
	useAllPendingRequests,
	useExtensionUiStore,
} from "../../stores/extension-ui";
import { toast } from "../../stores/toast";
import { Button, Input, Modal, Spinner, TextArea } from "../common";
import { ApprovalDialog } from "./ApprovalDialog";
import { ChoiceRow, FormDialog, QuestionForm, QuestionSurface, useQuestionDraft } from "./FormDialog";

/** The `open_url` request a sign-in prompt says it belongs to. */
function signInOwner(request: ExtensionUIRequest): string | undefined {
	return request.method === "input" ? (request.authCodeFor ?? request.loginPromptFor) : undefined;
}

/** A sign-in prompt shown inside its browser dialog rather than on its own. */
function belongsToOpenUrl(request: ExtensionUIRequest, pending: ExtensionUIRequest[]): boolean {
	const owner = signInOwner(request);
	return owner !== undefined && pending.some(other => other.id === owner && other.method === "open_url");
}

/** Requests handled elsewhere (store/router) — never rendered as dialogs. */
const NON_DIALOG_METHODS = new Set(["notify", "setStatus", "setWidget", "setTitle", "set_editor_text", "cancel"]);

/**
 * Floating surface for extension-pushed widgets. Transient `setStatus` text is
 * intentionally not rendered: the GUI has no status line, and floating pills
 * obscure composer controls.
 */
function ExtensionSurfaces() {
	const widgetPanels = useExtensionUiStore(state => state.widgetPanels);
	const widgets = Object.entries(widgetPanels);
	if (widgets.length === 0) return null;
	return (
		<div className="pointer-events-none fixed bottom-9 left-1/2 z-40 flex max-h-[40vh] w-[min(560px,92vw)] -translate-x-1/2 flex-col gap-1.5 overflow-y-auto">
			{widgets.map(([key, lines]) => (
				<div
					aria-label={key}
					className="pointer-events-auto rounded-md border border-(--omp-border-muted) bg-(--omp-bg-elevated) px-2.5 py-1.5 shadow-lg shadow-black/40"
					key={key}
					role="region"
				>
					<div className="mb-0.5 text-omp-xxs font-medium text-(--omp-dim)">{key}</div>
					{lines.map((line, index) => (
						<div
							className="font-mono text-omp-xs leading-snug break-words whitespace-pre-wrap text-(--omp-text)"
							key={index}
						>
							{line === "" ? "\u00A0" : <AnsiText text={line} />}
						</div>
					))}
				</div>
			))}
		</div>
	);
}

function useCountdown(request: ExtensionUIRequest | null): number | null {
	const timeout =
		request && request.method === "select"
			? request.timeout
			: request && request.method === "confirm"
				? request.timeout
				: request &&
						(request.method === "input" ||
							request.method === "askDialog" ||
							request.method === "ask" ||
							request.method === "form")
					? request.timeout
					: undefined;
	// Remaining time is derived PER REQUEST at render: a state-only countdown
	// leaked the previous request's last value (0ms) into the next commit,
	// whose auto-cancel effect then answered the new request as timed out
	// before the reset could render.
	const [, setTick] = useState(0);
	const startedAt = request ? extensionRequestReceivedAt(request) : Date.now();

	useEffect(() => {
		if (timeout === undefined) return;
		const timer = setInterval(() => setTick(v => v + 1), 200);
		return () => clearInterval(timer);
	}, [timeout]);

	if (timeout === undefined) return null;
	const remaining = Math.max(0, timeout - (Date.now() - startedAt));
	return remaining;
}

function TimeoutFooter({ remaining }: { remaining: number | null }) {
	const t = useT();
	if (remaining === null) return null;
	return (
		<span className="text-omp-xs tabular-nums text-(--omp-dim)">
			{t("extDialog.autoDismiss", { seconds: Math.ceil(remaining / 1000) })}
		</span>
	);
}

function SelectDialog({
	request,
	remaining,
	onValue,
	onCancel,
	inline,
}: {
	request: Extract<ExtensionUIRequest, { method: "select" }>;
	remaining: number | null;
	onValue: (value: string) => void;
	onCancel: () => void;
	inline?: boolean;
}) {
	const t = useT();
	return (
		<QuestionSurface inline={inline} onClose={onCancel} title={request.title}>
			<div className="omp-question-layout space-y-1">
				<div className="omp-question-body space-y-1">
					{request.options.map((option, index) => (
						<button
							autoFocus={!inline && index === 0}
							className="flex w-full items-center gap-2 rounded-md border border-(--omp-border-muted) px-3 py-2 text-left text-omp-xs text-(--omp-text) transition-colors hover:border-(--omp-border-accent) hover:bg-(--omp-selected-bg) focus-visible:outline-2 focus-visible:outline-(--omp-border-accent)"
							key={option}
							onClick={() => onValue(option)}
							type="button"
						>
							<span className="w-4 shrink-0 text-omp-xs text-(--omp-dim)">{index + 1}</span>
							<span className="min-w-0 break-words">
								<span className="block">{option}</span>
								{request.optionDetails?.[index]?.description && (
									<span className="mt-1 block text-omp-xs whitespace-pre-wrap text-(--omp-muted)">
										{request.optionDetails[index].description}
									</span>
								)}
							</span>
						</button>
					))}
				</div>
				<div className="omp-question-actions flex items-center justify-between pt-2">
					<TimeoutFooter remaining={remaining} />
					<Button onClick={onCancel} size="sm" variant="ghost">
						{t("common.cancel")}
					</Button>
				</div>
			</div>
		</QuestionSurface>
	);
}

function ConfirmDialog({
	request,
	remaining,
	onConfirm,
	onCancel,
}: {
	request: Extract<ExtensionUIRequest, { method: "confirm" }>;
	remaining: number | null;
	onConfirm: (confirmed: boolean) => void;
	onCancel: () => void;
}) {
	const t = useT();
	return (
		<Modal onClose={onCancel} open size="sm" title={request.title}>
			<p className="text-omp-xs leading-relaxed break-words whitespace-pre-wrap text-(--omp-muted)">
				{request.message}
			</p>
			<div className="mt-4 flex items-center justify-between gap-2">
				<TimeoutFooter remaining={remaining} />
				<div className="flex gap-2">
					<Button onClick={() => onConfirm(false)} size="sm" variant="ghost">
						{t("approval.deny")}
					</Button>
					<Button autoFocus onClick={() => onConfirm(true)} size="sm" variant="primary">
						{t("approval.approve")}
					</Button>
				</div>
			</div>
		</Modal>
	);
}

function InputDialog({
	request,
	remaining,
	onValue,
	onCancel,
	inline,
}: {
	request: Extract<ExtensionUIRequest, { method: "input" }>;
	remaining: number | null;
	onValue: (value: string) => void;
	onCancel: () => void;
	inline?: boolean;
}) {
	const t = useT();
	const [value, setValue] = useQuestionDraft(request, () => "");
	return (
		<QuestionSurface inline={inline} onClose={onCancel} title={request.title}>
			<form
				className="omp-question-layout space-y-3"
				onSubmit={event => {
					event.preventDefault();
					onValue(value);
				}}
			>
				<div className="omp-question-body">
					<Input
						autoFocus={!inline}
						aria-label={request.title}
						onChange={event => setValue(event.target.value)}
						placeholder={request.placeholder}
						value={value}
					/>
				</div>
				<div className="omp-question-actions flex items-center justify-between gap-2">
					<TimeoutFooter remaining={remaining} />
					<div className="flex gap-2">
						<Button onClick={onCancel} size="sm" type="button" variant="ghost">
							{t("common.cancel")}
						</Button>
						<Button size="sm" type="submit" variant="primary">
							{t("extDialog.submit")}
						</Button>
					</div>
				</div>
			</form>
		</QuestionSurface>
	);
}

interface AskAnswerState {
	selected: Set<string>;
	custom: string;
	note: string;
}

/**
 * Multi-question ask dialog: each question renders its options as checkboxes
 * (multi) or radio rows (single), plus an optional custom-answer input and an
 * optional note input. Single-select mirrors the TUI: picking an option
 * replaces the custom answer, typing one clears the option selection.
 */
function AskDialog({
	request,
	remaining,
	onSubmit,
	onCancel,
	inline,
}: {
	request: Extract<ExtensionUIRequest, { method: "askDialog" | "ask" }>;
	remaining: number | null;
	onSubmit: (result: ExtensionAskDialogResult) => void;
	onCancel: () => void;
	inline?: boolean;
}) {
	const t = useT();
	const [{ step, answers }, setFlow] = useQuestionDraft(request, () => ({
		step: 0,
		answers: request.questions.map<AskAnswerState>(() => ({ selected: new Set(), custom: "", note: "" })),
	}));
	const goTo = (step: number) => setFlow(previous => ({ ...previous, step }));
	const question = request.questions[step];
	const answer = answers[step];
	const update = (change: (answer: AskAnswerState) => AskAnswerState) =>
		setFlow(previous => ({ ...previous, answers: previous.answers.with(step, change(previous.answers[step]!)) }));

	const toggleOption = (label: string) => {
		update(answer => {
			if (!question?.multi) return { ...answer, selected: new Set([label]), custom: "" };
			const selected = new Set(answer.selected);
			if (selected.has(label)) selected.delete(label);
			else selected.add(label);
			return { ...answer, selected };
		});
	};

	const unansweredCount = request.questions.reduce((count, _question, index) => {
		const answer = answers[index];
		return answer && answer.selected.size === 0 && answer.custom.trim() === "" ? count + 1 : count;
	}, 0);

	const submit = () => {
		onSubmit({
			kind: "submit",
			results: request.questions.map((question, index) => {
				const answer = answers[index];
				const custom = answer?.custom.trim() ?? "";
				const note = answer?.note.trim() ?? "";
				return {
					id: question.id,
					question: question.question,
					options: question.options.map(option => option.label),
					multi: question.multi ?? false,
					selectedOptions: question.options
						.map(option => option.label)
						.filter(label => answer?.selected.has(label)),
					...(custom !== "" ? { customInput: answer?.custom ?? "" } : {}),
					...(note !== "" ? { note: answer?.note ?? "" } : {}),
				};
			}),
		});
	};

	return (
		<QuestionForm
			count={Math.max(1, request.questions.length)}
			footer={
				<>
					<TimeoutFooter remaining={remaining} />
					{unansweredCount > 0 && (
						<span className="text-omp-xs text-(--omp-warning)">
							{t("extDialog.ask.unanswered", { count: unansweredCount })}
						</span>
					)}
				</>
			}
			inline={inline}
			kind={
				question &&
				(!question.options.length
					? "extDialog.ask.manual"
					: question.multi
						? "extDialog.ask.multiple"
						: "extDialog.ask.single")
			}
			onAdvance={() => {
				if (step + 1 < request.questions.length) goTo(step + 1);
				else submit();
			}}
			onCancel={onCancel}
			onStep={goTo}
			secondary={
				<Button onClick={() => onSubmit({ kind: "chat" })} size="sm" type="button" variant="secondary">
					{t("extDialog.ask.chat")}
				</Button>
			}
			step={step}
		>
			{question && answer && (
				<>
					{question.header && <div className="text-omp-xs font-medium text-(--omp-muted)">{question.header}</div>}
					<h3 className="text-omp-lg font-semibold whitespace-pre-wrap">{question.question}</h3>
					{question.options.length > 0 && (
						<div aria-label={question.question} className="omp-question-options" role="group">
							{question.options.map((option, index) => (
								<ChoiceRow
									checked={answer.selected.has(option.label)}
									key={option.label}
									multi={question.multi ?? false}
									onClick={() => toggleOption(option.label)}
								>
									<span className="flex flex-wrap items-center gap-1.5 text-omp-sm text-(--omp-text)">
										<span className="min-w-0">{option.label}</span>
										{question.recommended === index && (
											<span className="rounded border border-(--omp-border-accent) px-1 text-omp-xxs font-medium text-(--omp-accent)">
												{t("extDialog.ask.recommended")}
											</span>
										)}
									</span>
									{option.description && (
										<span className="mt-1 block text-omp-xs whitespace-pre-wrap text-(--omp-muted)">
											{option.description}
										</span>
									)}
								</ChoiceRow>
							))}
						</div>
					)}
					{question.options.map(option =>
						answer.selected.has(option.label) && option.preview ? (
							<div
								className="min-w-0 rounded-md border border-(--omp-border-muted) bg-(--omp-code-bg) px-2.5 py-2 text-omp-sm"
								key={option.label}
							>
								<MarkdownRenderer content={option.preview} />
							</div>
						) : null,
					)}
					<div className="omp-ask-fields">
						<TextArea
							aria-label={t("extDialog.ask.customPlaceholder")}
							className="[field-sizing:content]"
							onChange={event => {
								const custom = event.target.value;
								update(answer => ({
									...answer,
									custom,
									selected: !question.multi && custom.trim() ? new Set() : answer.selected,
								}));
							}}
							placeholder={t("extDialog.ask.customPlaceholder")}
							rows={2}
							value={answer.custom}
						/>
						{request.method === "askDialog" && (
							<Input
								aria-label={t("extDialog.ask.notePlaceholder")}
								onChange={event => {
									const note = event.target.value;
									update(answer => ({ ...answer, note }));
								}}
								placeholder={t("extDialog.ask.notePlaceholder")}
								value={answer.note}
							/>
						)}
					</div>
				</>
			)}
		</QuestionForm>
	);
}

function looksLikeJson(text: string): boolean {
	const trimmed = text.trim();
	return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

function EditorDialog({
	request,
	onValue,
	onCancel,
}: {
	request: Extract<ExtensionUIRequest, { method: "editor" }>;
	onValue: (value: string) => void;
	onCancel: () => void;
}) {
	const t = useT();
	const hostRef = useRef<HTMLDivElement>(null);
	const valueRef = useRef(request.prefill ?? "");

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		// The editor view is rebuilt per request — resync the submit ref so text
		// left over from a previous request can't leak into this one's value.
		valueRef.current = request.prefill ?? "";
		const view = new EditorView({
			doc: request.prefill ?? "",
			extensions: [
				EditorView.lineWrapping,
				...(looksLikeJson(request.prefill ?? "") ? [json()] : []),
				EditorView.theme({
					"&": {
						backgroundColor: "var(--omp-code-bg)",
						color: "var(--omp-text)",
						fontSize: "12px",
						height: "100%",
					},
					"&.cm-focused": { outline: "none" },
					".cm-content": { fontFamily: "var(--font-mono, monospace)", padding: "8px 0" },
					".cm-line": { padding: "0 10px" },
					".cm-cursor": { borderLeftColor: "var(--omp-accent)" },
					".cm-selectionBackground": { backgroundColor: "var(--omp-selected-bg) !important" },
					".cm-gutters": {
						backgroundColor: "transparent",
						borderRight: "1px solid var(--omp-border-muted)",
						color: "var(--omp-dim)",
					},
				}),
				EditorView.updateListener.of(update => {
					if (update.docChanged) valueRef.current = update.state.doc.toString();
				}),
			],
			parent: host,
		});
		view.focus();
		return () => view.destroy();
	}, [request.prefill]);

	return (
		<Modal bodyClassName="p-0" onClose={onCancel} open size="lg" title={request.title}>
			<div className="flex h-[55vh] flex-col">
				<div className="min-h-0 flex-1 overflow-hidden border-b border-(--omp-border-muted)" ref={hostRef} />
				<div className="flex items-center justify-end gap-2 p-3">
					<Button onClick={onCancel} size="sm" variant="ghost">
						{t("common.cancel")}
					</Button>
					<Button onClick={() => onValue(valueRef.current)} size="sm" variant="primary">
						{t("extDialog.submit")}
					</Button>
				</div>
			</div>
		</Modal>
	);
}

type CodePrompt = Extract<ExtensionUIRequest, { method: "input" }>;

type ExtensionResponse =
	| { value: string }
	| { confirmed: boolean }
	| { askDialog: ExtensionAskDialogResult }
	| { answers: Array<{ id: string; selectedOptions: string[]; customInput?: string }> }
	| { formData: Record<string, string | string[]> }
	| { cancelled: true };

function answerExtensionRequest(id: string, response: ExtensionResponse): void {
	window.omp.ui.respondExtensionUi({ type: "extension_ui_response", id, ...response });
	removeExtensionRequest(id);
}

/**
 * The browser step of a sign-in. It stays up while the agent waits for the
 * browser and closes when the sign-in ends; the agent sends the close. When
 * the sign-in also accepts a pasted code, the agent's paste prompt
 * (`authCodeFor`) shows here as an optional field instead of as a second
 * dialog, for a browser that cannot reach this machine. A prompt the sign-in
 * is waiting on (`loginPromptFor`, such as an API key) shows here too, open
 * and masked: the page only helps the user find the answer.
 */
function OpenUrlDialog({
	request,
	codePrompt,
	onCode,
	onCancel,
}: {
	request: Extract<ExtensionUIRequest, { method: "open_url" }>;
	codePrompt: CodePrompt | undefined;
	onCode: (prompt: CodePrompt, value: string) => void;
	onCancel: () => void;
}) {
	const t = useT();
	const [opened, setOpened] = useState(false);
	const [pasting, setPasting] = useState(false);
	const [code, setCode] = useState("");
	const [revealed, setRevealed] = useState(false);
	// The prompt last answered; a new paste prompt after it means the agent could not use that value.
	const [answered, setAnswered] = useState<CodePrompt | null>(null);
	const target = request.launchUrl ?? request.url;
	const checking = answered !== null && (!codePrompt || codePrompt.id === answered.id);
	// Falls back to the answered prompt so the dialog keeps its shape while that answer is checked.
	const prompt = codePrompt ?? answered;
	const loginPrompt = prompt?.loginPromptFor ? prompt : undefined;
	const retry = !loginPrompt && answered !== null && codePrompt !== undefined && codePrompt.id !== answered.id;
	const fieldLabel = loginPrompt ? loginPrompt.title : t("extDialog.openUrl.pastePlaceholder");
	const submitLabel = loginPrompt ? t("extDialog.openUrl.promptSubmit") : t("extDialog.openUrl.pasteSubmit");

	return (
		<Modal
			onClose={onCancel}
			open
			size="sm"
			title={loginPrompt ? t("extDialog.openUrl.signInTitle") : t("extDialog.openUrl.title")}
		>
			<div className="space-y-3">
				{request.instructions && (
					<p className="text-omp-xs leading-relaxed break-words whitespace-pre-wrap text-(--omp-muted)">
						{request.instructions}
					</p>
				)}
				<div className="rounded-md border border-(--omp-border-muted) bg-(--omp-code-bg) px-2.5 py-2 font-mono text-omp-xs break-all text-(--omp-md-link)">
					{target}
				</div>
				{opened && !loginPrompt && (
					<div className="flex items-center gap-2 text-omp-xs text-(--omp-muted)" role="status">
						<Spinner size="sm" />
						<span>{t("extDialog.openUrl.waiting")}</span>
					</div>
				)}
				{prompt &&
					(loginPrompt || pasting ? (
						<form
							className="space-y-1.5"
							onSubmit={event => {
								event.preventDefault();
								const value = code.trim();
								if (!codePrompt || checking || (!value && !codePrompt.allowEmpty)) return;
								onCode(codePrompt, value);
								setAnswered(codePrompt);
								setCode("");
								setRevealed(false);
							}}
						>
							{loginPrompt && (
								<p className="text-omp-md font-medium text-(--omp-text-secondary)">{loginPrompt.title}</p>
							)}
							<div className="flex items-center gap-2">
								<div className="relative min-w-0 flex-1">
									<Input
										// Keyed: the next question in a sign-in takes the focus back.
										key={prompt.id}
										aria-label={fieldLabel}
										autoComplete="off"
										autoFocus
										className={loginPrompt ? "pr-8" : undefined}
										disabled={checking}
										onChange={event => setCode(event.target.value)}
										placeholder={loginPrompt ? loginPrompt.placeholder : fieldLabel}
										spellCheck={false}
										type={loginPrompt && !revealed ? "password" : "text"}
										value={code}
									/>
									{loginPrompt && (
										<button
											aria-label={revealed ? t("common.hideValue") : t("common.revealValue")}
											className="absolute right-2 top-1/2 -translate-y-1/2 text-(--omp-dim) transition-colors hover:text-(--omp-text)"
											onClick={() => setRevealed(prev => !prev)}
											type="button"
										>
											{revealed ? <EyeOff size={13} /> : <Eye size={13} />}
										</button>
									)}
								</div>
								<Button
									disabled={checking || (!code.trim() && !prompt.allowEmpty)}
									size="sm"
									type="submit"
									variant={loginPrompt ? "primary" : "secondary"}
								>
									{checking ? t("extDialog.openUrl.pasteChecking") : submitLabel}
								</Button>
							</div>
							{retry && <p className="text-omp-xs text-(--omp-error)">{t("extDialog.openUrl.pasteRetry")}</p>}
						</form>
					) : (
						<button
							className="text-omp-xs text-(--omp-md-link) hover:underline"
							onClick={() => setPasting(true)}
							type="button"
						>
							{t("extDialog.openUrl.pasteToggle")}
						</button>
					))}
				<div className="flex items-center justify-end gap-2">
					<Button onClick={onCancel} size="sm" variant="ghost">
						{t("common.cancel")}
					</Button>
					<Button
						autoFocus={!loginPrompt}
						icon={<ExternalLink size={12} />}
						onClick={() => {
							void window.omp.system.openExternal(target);
							setOpened(true);
						}}
						size="sm"
						variant={opened || loginPrompt ? "secondary" : "primary"}
					>
						{opened ? t("extDialog.openUrl.openAgain") : t("extDialog.openUrl.open")}
					</Button>
				</div>
				{!opened && !loginPrompt && (
					<p className="text-right text-omp-xs text-(--omp-dim)">{t("extDialog.openUrl.hint")}</p>
				)}
			</div>
		</Modal>
	);
}

function ActiveDialog({
	request,
	remaining,
	codePrompt,
	inline = false,
}: {
	request: ExtensionUIRequest;
	remaining: number | null;
	/** The paste prompt that belongs to an `open_url` request. */
	codePrompt?: CodePrompt;
	inline?: boolean;
}) {
	const respond = (response: ExtensionResponse) => answerExtensionRequest(request.id, response);
	const cancel = () => respond({ cancelled: true });

	switch (request.method) {
		case "select":
			return isApprovalRequest(request) ? (
				<ApprovalDialog onRespond={respond} request={request} />
			) : (
				<SelectDialog
					inline={inline}
					onCancel={cancel}
					onValue={value => respond({ value })}
					remaining={remaining}
					request={request}
				/>
			);
		case "confirm":
			return (
				<ConfirmDialog
					onCancel={cancel}
					onConfirm={confirmed => respond({ confirmed })}
					remaining={remaining}
					request={request}
				/>
			);
		case "input":
			return (
				// Keyed: consecutive input requests must not inherit the previous
				// request's typed draft.
				<InputDialog
					inline={inline}
					key={request.id}
					onCancel={cancel}
					onValue={value => respond({ value })}
					remaining={remaining}
					request={request}
				/>
			);
		case "askDialog":
			return (
				<AskDialog
					inline={inline}
					key={request.id}
					onCancel={cancel}
					onSubmit={result => respond({ askDialog: result })}
					remaining={remaining}
					request={request}
				/>
			);
		case "ask":
			// Upstream's opt-in protocol (enabled via set_ask_dialog at session
			// start): same dialog, but the wire wants one `answers` entry per
			// question. "Chat instead" has no answers shape — report it as a cancel.
			return (
				<AskDialog
					inline={inline}
					key={request.id}
					onCancel={cancel}
					onSubmit={result =>
						respond(
							result.kind === "submit"
								? {
										answers: result.results.map(item => ({
											id: item.id,
											selectedOptions: item.selectedOptions,
											customInput: item.customInput,
										})),
									}
								: { cancelled: true },
						)
					}
					remaining={remaining}
					request={request}
				/>
			);
		case "form":
			return (
				<FormDialog
					inline={inline}
					draftKey={request}
					footer={<TimeoutFooter remaining={remaining} />}
					key={request.id}
					onCancel={cancel}
					onSubmit={formData => respond({ formData })}
					sections={request.sections}
				/>
			);
		case "editor":
			return (
				<EditorDialog key={request.id} onCancel={cancel} onValue={value => respond({ value })} request={request} />
			);
		case "open_url":
			// Keyed: `opened` and paste state must reset per request.
			return (
				<OpenUrlDialog
					codePrompt={codePrompt}
					key={request.id}
					onCancel={() => {
						// Cancelling the sign-in also answers its paste prompt, so the
						// prompt cannot surface as its own dialog in between.
						if (codePrompt) answerExtensionRequest(codePrompt.id, { cancelled: true });
						cancel();
					}}
					onCode={(prompt, value) => answerExtensionRequest(prompt.id, { value })}
					request={request}
				/>
			);
		default:
			return null;
	}
}

export function isInlineQuestion(request: ExtensionUIRequest): boolean {
	return (
		request.method === "ask" ||
		request.method === "askDialog" ||
		request.method === "form" ||
		(request.method === "select" && !isApprovalRequest(request)) ||
		(request.method === "input" && !request.authCodeFor && !request.loginPromptFor)
	);
}

/** Render a pending question instead of the owning tab's composer without unmounting its draft. */
export function ComposerQuestions({ children }: { children: ReactNode }) {
	const request = useExtensionUiStore(state => state.pendingRequests.find(isInlineQuestion)) ?? null;
	const remaining = useCountdown(request);
	return (
		<>
			<div className={request ? "hidden" : "shrink-0"} hidden={request !== null}>
				{children}
			</div>
			{request && (
				<div className="omp-composer-shell omp-question-dock min-h-0 w-full shrink-0 px-2 pb-1">
					<ActiveDialog inline key={request.id} remaining={remaining} request={request} />
				</div>
			)}
		</>
	);
}

export function ExtensionDialog() {
	// Dialog surface is global: a blocking request parked in a background tab's
	// queue still pops here (its agent waits). Side-effect requests do NOT
	// aggregate — set_editor_text must fill the OWNING tab's composer, so they
	// stay scoped to the focused tab and fire when that tab is on screen.
	const pending = useAllPendingRequests();
	const focusedPending = useExtensionUiStore(state => state.pendingRequests);
	useEffect(() => {
		const expire = () => {
			for (const req of pending) {
				if (!isInlineQuestion(req) || !("timeout" in req) || req.timeout === undefined) continue;
				if (Date.now() - extensionRequestReceivedAt(req) < req.timeout) continue;
				window.omp.ui.respondExtensionUi({
					type: "extension_ui_response",
					id: req.id,
					cancelled: true,
					timedOut: true,
				});
				removeExtensionRequest(req.id);
			}
		};
		const timer = setInterval(expire, 200);
		return () => clearInterval(timer);
	}, [pending]);

	const request = useMemo(
		() =>
			pending.find(
				req => !NON_DIALOG_METHODS.has(req.method) && !isInlineQuestion(req) && !belongsToOpenUrl(req, pending),
			) ?? null,
		[pending],
	);
	const codePrompt = useMemo(
		() =>
			request?.method === "open_url"
				? pending.find((req): req is CodePrompt => req.method === "input" && signInOwner(req) === request.id)
				: undefined,
		[pending, request],
	);
	const remaining = useCountdown(request);

	// Consume non-dialog requests in place. Editor/title mutations must target
	// real GUI surfaces directly; dispatching listenerless events drops them.
	useEffect(() => {
		for (const req of focusedPending) {
			if (req.method === "notify") {
				// Suppress mount notifications (tool commands, or xd:// devices from a
				// pinned sidecar) — startup-time informational messages, no user action.
				if (!req.message.startsWith("Tool commands: ") && !req.message.startsWith("xd://: mounted")) {
					toast({
						variant: req.notifyType ?? "info",
						message: req.message,
						durationMs: 6000,
					});
				}
				removeExtensionRequest(req.id);
			} else if (req.method === "set_editor_text") {
				window.dispatchEvent(
					new CustomEvent("omp:fill-composer", {
						detail: { text: req.text, images: req.images, prepend: req.prepend },
					}),
				);
				removeExtensionRequest(req.id);
			} else if (req.method === "setTitle") {
				document.title = req.title;
				removeExtensionRequest(req.id);
			} else if (NON_DIALOG_METHODS.has(req.method)) {
				removeExtensionRequest(req.id);
			}
		}
	}, [focusedPending]);

	// Timeout: auto-cancel with timedOut marker.
	useEffect(() => {
		if (!request || remaining === null || remaining > 0) return;
		window.omp.ui.respondExtensionUi({
			type: "extension_ui_response",
			id: request.id,
			cancelled: true,
			timedOut: true,
		});
		removeExtensionRequest(request.id);
	}, [request, remaining]);

	return (
		<>
			<ExtensionSurfaces />
			{request && <ActiveDialog codePrompt={codePrompt} remaining={remaining} request={request} />}
		</>
	);
}
