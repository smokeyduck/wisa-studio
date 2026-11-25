/**
 * The agent's `ask` form. Each named control gets a step, but Core still
 * receives one response for the entire form. Model markup stays structured.
 */

import { Check } from "lucide-react";
import { type Dispatch, type ReactNode, type SetStateAction, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
	ExtensionFormBlock,
	ExtensionFormChoiceField,
	ExtensionFormField,
	ExtensionFormSection,
	ExtensionFormSpan,
	ExtensionFormTextField,
} from "../../../shared/rpc-types";
import { cx, sanitizeToolText } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { Button, Input, Modal, TextArea } from "../common";

/** One selectable row; `multi` draws a checkbox, otherwise a radio. */
export function ChoiceRow({
	checked,
	multi,
	disabled,
	onClick,
	children,
}: {
	checked: boolean;
	multi: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			aria-pressed={checked}
			className={cx(
				"flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-(--omp-border-accent)",
				checked
					? "border-(--omp-border-accent) bg-(--omp-selected-bg)"
					: "border-(--omp-border-muted) hover:border-(--omp-border-accent) hover:bg-(--omp-selected-bg)",
				disabled && "cursor-not-allowed opacity-50",
			)}
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			<span
				className={cx(
					"mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition-colors",
					multi ? "rounded-[3px]" : "rounded-full",
					checked ? "border-(--omp-accent) text-(--omp-accent)" : "border-(--omp-border-strong) text-transparent",
				)}
			>
				{multi ? <Check size={10} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
			</span>
			<span className="min-w-0 flex-1">{children}</span>
		</button>
	);
}

interface ChoiceDraft {
	checked: ReadonlySet<number>;
	other: string;
}
type FieldDraft = string | ChoiceDraft;

function plainText(spans: ExtensionFormSpan[]): string {
	return sanitizeToolText(spans.map(span => span.text).join(""));
}

function Spans({ spans }: { spans: ExtensionFormSpan[] }) {
	return (
		<>
			{spans.map((span, index) => {
				const text = sanitizeToolText(span.text);
				if (span.style === "code") {
					return (
						<code className="rounded bg-(--omp-code-bg) px-1 font-mono" key={index}>
							{text}
						</code>
					);
				}
				if (span.style === "strong") return <strong key={index}>{text}</strong>;
				if (span.style === "em") return <em key={index}>{text}</em>;
				return <span key={index}>{text}</span>;
			})}
		</>
	);
}

function initialDraft(field: ExtensionFormField): FieldDraft {
	if (field.kind === "text") return field.value;
	return {
		checked: new Set(field.options.flatMap((option, index) => (option.checked && !option.disabled ? [index] : []))),
		other: "",
	};
}

function isBlank(field: ExtensionFormField, draft: FieldDraft | undefined): boolean {
	if (typeof draft === "string") return draft.trim() === "";
	return field.kind === "choice" && (draft === undefined || (draft.checked.size === 0 && draft.other.trim() === ""));
}

function choiceFormValue(field: ExtensionFormChoiceField, draft: ChoiceDraft): string | string[] | undefined {
	const values = field.options.flatMap((option, index) => (draft.checked.has(index) ? [option.value] : []));
	const other = field.other ? draft.other.trim() : "";
	if (field.multi) return other ? [...values, other] : values;
	return other || values[0];
}

function formDataOf(fields: ExtensionFormField[], drafts: FieldDraft[]): Record<string, string | string[]> {
	const data: Record<string, string | string[]> = {};
	fields.forEach((field, index) => {
		const draft = drafts[index];
		const value =
			typeof draft === "string"
				? draft
				: draft && field.kind === "choice"
					? choiceFormValue(field, draft)
					: undefined;
		if (value !== undefined) data[field.name] = value;
	});
	return data;
}

function TextFieldInput({
	field,
	value,
	error,
	onChange,
}: {
	field: ExtensionFormTextField;
	value: string;
	error: string | undefined;
	onChange: (value: string) => void;
}) {
	const shared = {
		autoComplete: "off",
		error,
		label: plainText(field.label),
		maxLength: field.maxLength,
		minLength: field.minLength,
		placeholder: field.placeholder,
		required: field.required,
		value,
	};
	if (field.multiline) {
		return (
			<TextArea
				{...shared}
				className="[field-sizing:content]"
				onChange={event => onChange(event.target.value)}
				rows={field.rows}
			/>
		);
	}
	return (
		<Input
			{...shared}
			max={field.max}
			min={field.min}
			onChange={event => onChange(event.target.value)}
			pattern={field.pattern}
			step={field.type === "number" || field.type === "range" ? "any" : undefined}
			type={field.type === "range" ? "number" : field.type}
		/>
	);
}

function ChoiceFieldInput({
	field,
	draft,
	error,
	onChange,
}: {
	field: ExtensionFormChoiceField;
	draft: ChoiceDraft;
	error: string | undefined;
	onChange: (draft: ChoiceDraft) => void;
}) {
	const t = useT();
	const toggle = (index: number) => {
		if (!field.multi) {
			onChange({ checked: new Set([index]), other: "" });
			return;
		}
		const checked = new Set(draft.checked);
		if (checked.has(index)) checked.delete(index);
		else checked.add(index);
		onChange({ ...draft, checked });
	};
	return (
		<div className="space-y-2">
			<div className="omp-question-options" role="group" aria-label={plainText(field.label) || undefined}>
				{field.options.map((option, index) => (
					<ChoiceRow
						checked={draft.checked.has(index)}
						disabled={option.disabled}
						key={index}
						multi={field.multi}
						onClick={() => toggle(index)}
					>
						<span className="block text-omp-sm whitespace-pre-wrap text-(--omp-text)">
							<Spans spans={option.label} />
						</span>
					</ChoiceRow>
				))}
			</div>
			{field.other && (
				<Input
					aria-label={t("extDialog.ask.customPlaceholder")}
					autoComplete="off"
					onChange={event => {
						const other = event.target.value;
						// Single choice: typing an answer replaces the picked option.
						onChange({ other, checked: !field.multi && other.trim() !== "" ? new Set() : draft.checked });
					}}
					placeholder={t("extDialog.ask.customPlaceholder")}
					value={draft.other}
				/>
			)}
			{error && (
				<p className="text-omp-xs text-(--omp-error)" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}

function ContextBlock({ block }: { block: Exclude<ExtensionFormBlock, { kind: "field" }> }) {
	switch (block.kind) {
		case "text":
			return (
				<p
					className={cx(
						"text-omp-xs leading-relaxed break-words whitespace-pre-wrap text-(--omp-text)",
						block.heading && "font-medium",
					)}
				>
					<Spans spans={block.spans} />
				</p>
			);
		case "list": {
			const List = block.ordered ? "ol" : "ul";
			return (
				<List
					className={cx(
						"space-y-0.5 pl-5 text-omp-xs text-(--omp-text)",
						block.ordered ? "list-decimal" : "list-disc",
					)}
				>
					{block.items.map((item, index) => (
						<li key={index}>
							<Spans spans={item} />
						</li>
					))}
				</List>
			);
		}
		case "pre":
			return (
				<pre className="whitespace-pre-wrap rounded-md bg-(--omp-code-bg) px-2.5 py-2 font-mono text-omp-xs text-(--omp-text)">
					{sanitizeToolText(block.text)}
				</pre>
			);
		case "table":
			return (
				<div>
					<table className="w-full table-fixed text-left text-omp-xs text-(--omp-text)">
						<tbody>
							{block.rows.map((row, rowIndex) => {
								const Cell = rowIndex < block.headerRows ? "th" : "td";
								return (
									<tr className="border-b border-(--omp-border-muted)" key={rowIndex}>
										{row.map((cell, cellIndex) => (
											<Cell className="px-1.5 py-1 align-top" key={cellIndex}>
												<Spans spans={cell} />
											</Cell>
										))}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			);
	}
}

const questionDrafts = new WeakMap<object, unknown>();
/** Request-object ownership prevents cross-session draft reuse and survives transcript remounts. */
export function useQuestionDraft<T>(key: object, initial: () => T): [T, Dispatch<SetStateAction<T>>] {
	const [value, setValue] = useState<T>(() => (questionDrafts.has(key) ? (questionDrafts.get(key) as T) : initial()));
	return [
		value,
		next =>
			setValue(previous => {
				const value = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
				questionDrafts.set(key, value);
				return value;
			}),
	];
}
/** Questions dock in the composer; permission and sign-in surfaces stay modal. */
export function QuestionSurface({
	inline,
	title,
	onClose,
	children,
}: {
	inline?: boolean;
	title: string;
	onClose: () => void;
	children: ReactNode;
}) {
	return inline ? (
		<section
			aria-label={title}
			className="omp-inline-question rounded-xl border border-(--omp-border-accent) bg-(--omp-bg-secondary)"
			data-inline-question
		>
			<h2 className="omp-inline-question-title text-omp-sm font-semibold text-(--omp-text)">{title}</h2>
			{children}
		</section>
	) : (
		<Modal onClose={onClose} open size="lg" title={title}>
			{children}
		</Modal>
	);
}

/** Shared navigation; a submit on an intermediate step never responds to Core. */
export function QuestionForm({
	step,
	count,
	onStep,
	onAdvance,
	inline,
	onCancel,
	footer,
	secondary,
	kind,
	children,
}: {
	step: number;
	count: number;
	onStep: (step: number) => void;
	onAdvance: () => void;
	inline?: boolean;
	onCancel: () => void;
	footer: ReactNode;
	secondary?: ReactNode;
	kind?: "extDialog.ask.single" | "extDialog.ask.multiple" | "extDialog.ask.manual";
	children: ReactNode;
}) {
	const t = useT();
	const body = useRef<HTMLDivElement>(null);
	const previous = useRef(step);
	useLayoutEffect(() => {
		if (previous.current === step) return;
		previous.current = step;
		body.current?.focus();
	}, [step]);
	return (
		<QuestionSurface inline={inline} onClose={onCancel} title={t("extDialog.ask.title")}>
			<form
				className="omp-question-layout omp-question-flow"
				onSubmit={event => {
					event.preventDefault();
					onAdvance();
				}}
			>
				<div className="omp-question-body space-y-3" ref={body} tabIndex={-1}>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-omp-xs text-(--omp-muted)">
						<span aria-live="polite" className="font-medium tabular-nums text-(--omp-accent)">
							{t("extDialog.ask.progress", { current: step + 1, total: count })}
						</span>
						{kind && <span>{t(kind)}</span>}
					</div>
					<div className="space-y-3" key={step}>
						{children}
					</div>
				</div>
				<div className="omp-question-actions flex flex-wrap items-center justify-between gap-2 border-t border-(--omp-border-muted)">
					<div className="flex flex-wrap items-center gap-2">
						<Button onClick={onCancel} size="sm" type="button" variant="ghost">
							{t("common.cancel")}
						</Button>
						{secondary}
						{footer}
					</div>
					<div className="ml-auto flex flex-wrap gap-2">
						{step > 0 && (
							<Button onClick={() => onStep(step - 1)} size="sm" type="button" variant="secondary">
								{t("extDialog.ask.back")}
							</Button>
						)}
						<Button size="sm" type="submit" variant="primary">
							{t(step + 1 < count ? "extDialog.ask.next" : "extDialog.submit")}
						</Button>
					</div>
				</div>
			</form>
		</QuestionSurface>
	);
}

type FormContext = Exclude<ExtensionFormBlock, { kind: "field" }>;
interface FormStep {
	title: ExtensionFormSpan[];
	before: FormContext[];
	after?: FormContext[];
	field?: ExtensionFormField;
	fieldIndex: number;
}

function formSteps(sections: ExtensionFormSection[]): { fields: ExtensionFormField[]; steps: FormStep[] } {
	const fields: ExtensionFormField[] = [];
	const steps: FormStep[] = [];
	for (const { title, blocks } of sections) {
		let before: FormContext[] = [];
		let last: FormStep | undefined;
		for (const block of blocks) {
			if (block.kind !== "field") {
				before.push(block);
			} else if (block.field.name) {
				last = { title, before, field: block.field, fieldIndex: fields.length };
				fields.push(block.field);
				steps.push(last);
				before = [];
			}
		}
		if (last) last.after = before;
		else if (title.length || before.length) steps.push({ title, before, fieldIndex: -1 });
	}
	if (!steps.length) steps.push({ title: [], before: [], fieldIndex: -1 });
	return { fields, steps };
}

export function FormDialog({
	sections,
	footer,
	onSubmit,
	onCancel,
	inline,
	draftKey,
}: {
	sections: ExtensionFormSection[];
	/** Countdown shown beside the buttons. */
	footer: ReactNode;
	onSubmit: (formData: Record<string, string | string[]>) => void;
	onCancel: () => void;
	inline?: boolean;
	draftKey?: object;
}) {
	const t = useT();
	const { fields, steps } = useMemo(() => formSteps(sections), [sections]);
	const [{ step, drafts }, setFlow] = useQuestionDraft(draftKey ?? sections, () => ({
		step: 0,
		drafts: fields.map(initialDraft),
	}));
	const [missing, setMissing] = useState(false);
	const { title, before, after, field, fieldIndex } = steps[step]!;
	const draft = drafts[fieldIndex];
	const error = missing ? t("extDialog.form.required") : undefined;
	const goTo = (step: number) => {
		setMissing(false);
		setFlow(previous => ({ ...previous, step }));
	};
	const update = (draft: FieldDraft) => {
		setMissing(false);
		setFlow(previous => ({ ...previous, drafts: previous.drafts.with(fieldIndex, draft) }));
	};
	const advance = () => {
		if (field?.required && isBlank(field, draft)) {
			setMissing(true);
			return;
		}
		if (step + 1 < steps.length) goTo(step + 1);
		else onSubmit(formDataOf(fields, drafts));
	};
	return (
		<QuestionForm
			count={steps.length}
			footer={footer}
			inline={inline}
			kind={
				field?.kind === "choice"
					? field.multi
						? "extDialog.ask.multiple"
						: "extDialog.ask.single"
					: field && "extDialog.ask.manual"
			}
			onAdvance={advance}
			onCancel={onCancel}
			onStep={goTo}
			step={step}
		>
			{title.length > 0 && (
				<h3 className="text-omp-lg font-semibold whitespace-pre-wrap">
					<Spans spans={title} />
				</h3>
			)}
			{before.map((block, index) => (
				<ContextBlock block={block} key={index} />
			))}
			{field?.kind === "choice" && field.label.length > 0 && (
				<p className="text-omp-sm font-medium whitespace-pre-wrap">
					<Spans spans={field.label} />
				</p>
			)}
			{field?.kind === "text" && typeof draft === "string" && (
				<TextFieldInput error={error} field={field} onChange={update} value={draft} />
			)}
			{field?.kind === "choice" && draft && typeof draft !== "string" && (
				<ChoiceFieldInput draft={draft} error={error} field={field} onChange={update} />
			)}
			{after?.map((block, index) => (
				<ContextBlock block={block} key={index} />
			))}
		</QuestionForm>
	);
}
