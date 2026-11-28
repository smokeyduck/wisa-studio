/** Session-scoped side questions, with a separate history picker and local image drafts. */
import { GitBranch, History, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type BtwHistoryTurn, getBtwCopyText, getBtwLatestTurn, getBtwTurns } from "../../../shared/rpc-types";
import { hydrateSession, hydrateTabSession } from "../../hooks/use-rpc-events";
import { modelProfile } from "../../lib/context-strategy";
import { describeError } from "../../lib/errors";
import { copyText, cx, formatClock } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { MarkdownRenderer } from "../../lib/markdown";
import { useBtwStore } from "../../stores/btw";
import type { ComposerImage } from "../../stores/composer";
import { useModelStore } from "../../stores/model";
import { useSessionStore } from "../../stores/session";
import { useRuntimeTabId } from "../../stores/session-runtime-context";
import { toast } from "../../stores/toast";
import { Badge, type BadgeVariant, Button, Modal, Spinner, TextArea } from "../common";
import { ZoomableImage } from "../common/ImageViewer";
import { fileToImage } from "../layout/input-area-utils";
import { BtwAnswer } from "./BtwAnswer";

const STATUS_LABEL_KEYS: Record<BtwHistoryTurn["status"], string | null> = {
	running: "btw.statusRunning",
	complete: null,
	cancelled: "btw.statusCancelled",
	error: "btw.statusError",
	interrupted: "btw.statusInterrupted",
};

function statusVariant(status: BtwHistoryTurn["status"]): BadgeVariant {
	if (status === "running") return "info";
	return status === "error" ? "error" : "warning";
}

interface BtwDraft {
	text: string;
	images: ComposerImage[];
	reading: number;
	error: string | null;
	generation: number;
}

const EMPTY_DRAFT: BtwDraft = { text: "", images: [], reading: 0, error: null, generation: 0 };

export function BtwPanel() {
	const t = useT();
	const tabId = useRuntimeTabId();
	const records = useBtwStore(state => state.records);
	const selectedId = useBtwStore(state => state.selectedId);
	const branchableId = useBtwStore(state => state.branchableId);
	const pending = useBtwStore(state => state.pending);
	const loading = useBtwStore(state => state.loading);
	const error = useBtwStore(state => state.error);
	const refresh = useBtwStore(state => state.refresh);
	const select = useBtwStore(state => state.select);
	const ask = useBtwStore(state => state.ask);
	const cancel = useBtwStore(state => state.cancel);
	const branch = useBtwStore(state => state.branch);
	const sessionId = useSessionStore(state => state.sessionId);
	const model = useModelStore(state => state.model);
	const imagesUnsupported = model?.input !== undefined && !modelProfile(model).vision;
	const draftKey = JSON.stringify([tabId, sessionId]);
	const [drafts, setDrafts] = useState<Record<string, BtwDraft>>({});
	const currentDraft = drafts[draftKey] ?? EMPTY_DRAFT;
	const { text: draft, images, reading, error: askError } = currentDraft;
	const updateDraft = (update: (current: BtwDraft) => BtwDraft): void => {
		setDrafts(current => ({ ...current, [draftKey]: update(current[draftKey] ?? EMPTY_DRAFT) }));
	};
	const [historyOpen, setHistoryOpen] = useState(false);
	const [branching, setBranching] = useState(false);
	const threadRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	/** Follow a streaming answer until the reader scrolls away. */
	const followRef = useRef(true);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const record = selectedId ? (records.find(candidate => candidate.id === selectedId) ?? null) : null;
	const latest = record ? getBtwLatestTurn(record) : null;
	const running = latest?.status === "running";
	const runningRecord = records.find(candidate => getBtwLatestTurn(candidate).status === "running");
	const busy = pending || runningRecord !== undefined;
	const copyTextValue = record ? getBtwCopyText(record) : undefined;
	const branchable = selectedId !== null && branchableId === selectedId && latest?.status === "complete";

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-pin the reader as the streaming answer grows while following.
	useEffect(() => {
		const element = threadRef.current;
		if (!element || !running || !followRef.current) return;
		element.scrollTop = element.scrollHeight;
	}, [running, latest?.answer]);

	const newQuestion = (): void => {
		followRef.current = true;
		select(null);
		updateDraft(current => ({ ...EMPTY_DRAFT, generation: current.generation + 1 }));
		inputRef.current?.focus();
	};

	const submit = async (): Promise<void> => {
		if ((!draft.trim() && images.length === 0) || busy || reading > 0) return;
		if (images.length > 0 && imagesUnsupported) {
			updateDraft(current => ({ ...current, error: t("btw.imagesUnsupported") }));
			return;
		}
		const question = draft.trim() || t("btw.imageQuestion");
		updateDraft(current => ({ ...current, error: null }));
		try {
			await ask(question, selectedId ?? undefined, images.length ? images.map(image => image.content) : undefined);
			updateDraft(current =>
				current.text === draft && current.images === images
					? { ...EMPTY_DRAFT, generation: current.generation + 1 }
					: current,
			);
			followRef.current = true;
		} catch (cause) {
			updateDraft(current => ({ ...current, error: describeError(cause) }));
		}
	};

	const pasteImages = async (files: File[]): Promise<void> => {
		if (imagesUnsupported) {
			updateDraft(current => ({ ...current, error: t("btw.imagesUnsupported") }));
			return;
		}
		const generation = currentDraft.generation;
		updateDraft(current => ({ ...current, reading: current.reading + 1, error: null }));
		const results = await Promise.allSettled(files.map(fileToImage));
		updateDraft(current =>
			current.generation !== generation
				? current
				: {
						...current,
						images: [
							...current.images,
							...results.flatMap(result => (result.status === "fulfilled" ? [result.value] : [])),
						],
						reading: current.reading - 1,
						error: results.some(result => result.status === "rejected")
							? t("input.attachmentFailed")
							: current.error,
					},
		);
	};

	const stop = (): void => {
		if (!record) return;
		void cancel(record.id).catch(() => {});
	};

	const copy = async (): Promise<void> => {
		if (!copyTextValue) return;
		if (!(await copyText(copyTextValue))) {
			toast({ variant: "error", message: t("btw.copyFailed") });
			return;
		}
		toast({ variant: "success", message: t("btw.copied") });
	};

	const branchIntoChat = async (): Promise<void> => {
		if (!branchable || branching) return;
		setBranching(true);
		try {
			const data = await branch();
			if (data.cancelled) {
				toast({ variant: "info", message: t("btw.branchCancelled") });
				return;
			}
			if (tabId) await hydrateTabSession(tabId);
			else await hydrateSession();
			toast({ variant: "success", message: t("btw.branched") });
		} catch (cause) {
			toast({ variant: "error", title: t("btw.branchFailed"), message: String(cause) });
		} finally {
			setBranching(false);
		}
	};

	const statusBadge = (status: BtwHistoryTurn["status"]) => {
		const key = STATUS_LABEL_KEYS[status];
		if (!key) return null;
		return (
			<Badge dot pulse={status === "running"} variant={statusVariant(status)}>
				{t(key)}
			</Badge>
		);
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-9 shrink-0 items-center gap-2 border-b border-(--omp-border-muted) px-2">
				<Button icon={<Plus size={14} />} onClick={newQuestion} size="sm" variant="ghost">
					{t("btw.newQuestion")}
				</Button>
				<Button icon={<History size={14} />} onClick={() => setHistoryOpen(true)} size="sm" variant="ghost">
					{t("btw.history")}
				</Button>
			</div>

			{error ? (
				<div className="flex shrink-0 items-start gap-2 border-b border-(--omp-border-muted) px-3 py-2 text-omp-xs text-[var(--omp-error)]">
					<div className="min-w-0 flex-1">
						<div className="font-medium">{t("btw.historyFailed")}</div>
						<div className="mt-0.5 break-words">{error}</div>
					</div>
					<Button onClick={() => void refresh()} size="sm" variant="secondary">
						{t("common.retry")}
					</Button>
				</div>
			) : null}

			<Modal
				open={historyOpen}
				onClose={() => setHistoryOpen(false)}
				title={t("btw.history")}
				bodyClassName="p-0"
				size="md"
			>
				<div className="max-h-[60vh] overflow-y-auto">
					{records.length === 0 ? <div className="p-4 text-omp-sm text-(--omp-dim)">{t("btw.empty")}</div> : null}
					{records.map(entry => {
						const followUps = entry.followUps?.length ?? 0;
						const active = entry.id === selectedId;
						return (
							<button
								aria-pressed={active}
								className={cx(
									"block w-full px-3 py-2 text-left transition-colors",
									active ? "bg-(--omp-selected-bg)" : "hover:bg-(--omp-sidebar-item-hover)",
								)}
								key={entry.id}
								onClick={() => {
									followRef.current = true;
									select(entry.id);
									setHistoryOpen(false);
								}}
								type="button"
							>
								<span className="block truncate text-omp-md text-[var(--omp-text)]">{entry.question}</span>
								<span className="mt-0.5 flex items-center gap-1.5 text-omp-xs text-(--omp-dim)">
									<span className="shrink-0">{formatClock(entry.createdAt)}</span>
									{followUps > 0 ? (
										<span className="truncate">
											- {t("btw.followUpCount", { count: followUps, plural: followUps === 1 ? "" : "s" })}
										</span>
									) : null}
									<span className="ml-auto shrink-0">{statusBadge(getBtwLatestTurn(entry).status)}</span>
								</span>
							</button>
						);
					})}
				</div>
			</Modal>

			<div
				className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
				onScroll={event => {
					const element = event.currentTarget;
					followRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
				}}
				ref={threadRef}
			>
				{loading && records.length === 0 ? (
					<div className="flex items-center justify-center gap-2 py-10 text-omp-sm text-(--omp-dim)">
						<Spinner size="sm" /> {t("common.loading")}
					</div>
				) : records.length === 0 ? (
					<div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
						<div className="text-omp-lg font-medium text-(--omp-text)">{t("btw.empty")}</div>
						<div className="max-w-xs text-omp-sm text-(--omp-dim)">{t("btw.emptyHint")}</div>
					</div>
				) : record ? (
					<div className="space-y-5">
						{getBtwTurns(record).map((turn, index, turns) => {
							const statusNote =
								turn.status === "cancelled"
									? t("btw.statusCancelled")
									: turn.status === "interrupted"
										? t("btw.statusInterrupted")
										: turn.status === "error"
											? turn.error || t("btw.statusError")
											: null;
							return (
								<div className="space-y-2" key={`${record.id}:${index}`}>
									<div className="flex flex-col items-end gap-1">
										<div className="max-w-[85%] rounded-xl border border-[var(--omp-user-msg-border)] bg-[var(--omp-user-msg-bg)] px-3 py-2 text-omp-md leading-[1.6] text-[var(--omp-text)]">
											<MarkdownRenderer content={turn.question} />
										</div>
										{turn.images?.map((image, imageIndex) => (
											<ZoomableImage
												key={imageIndex}
												src={`data:${image.mimeType};base64,${image.data}`}
												alt={t("input.attachmentAlt", { index: imageIndex + 1 })}
												className="max-h-56 max-w-full rounded-lg border border-(--omp-border-muted) object-contain"
											/>
										))}
										<div className="text-omp-xs tabular-nums text-(--omp-dim)">
											{index === 0
												? formatClock(turn.createdAt)
												: `${t("btw.followUpLabel")} - ${formatClock(turn.createdAt)}`}
										</div>
									</div>
									<div className="flex flex-col items-start gap-1.5">
										{turn.answer.trim() ? (
											<BtwAnswer
												answer={turn.answer}
												inject={index === turns.length - 1 ? record.inject : undefined}
												recordId={record.id}
											/>
										) : turn.status === "running" ? (
											<div className="flex items-center gap-2 py-2 text-omp-sm text-(--omp-dim)">
												<Spinner size="sm" /> {t("btw.thinking")}
											</div>
										) : null}
										{statusNote ? <div className="text-omp-xs text-(--omp-dim)">{statusNote}</div> : null}
									</div>
								</div>
							);
						})}
					</div>
				) : null}
			</div>

			{record ? (
				<div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-(--omp-border-muted) px-3 py-2">
					{running ? (
						<Button onClick={stop} size="sm" variant="secondary">
							{t("btw.cancel")}
						</Button>
					) : null}
					<Button disabled={!copyTextValue} onClick={() => void copy()} size="sm" variant="secondary">
						{t("btw.copy")}
					</Button>
					<Button
						disabled={!branchable || branching}
						onClick={() => void branchIntoChat()}
						size="sm"
						variant="secondary"
					>
						{branching ? <Spinner size="sm" /> : <GitBranch size={13} />}
						{t("btw.branch")}
					</Button>
				</div>
			) : null}

			<div className="shrink-0 border-t border-(--omp-border-muted) p-2">
				{busy && !running ? (
					<div className="mb-1.5 flex items-center gap-2 text-omp-xs text-(--omp-dim)">
						<span className="min-w-0 flex-1">{t("btw.busyHint")}</span>
						<Button
							onClick={() => {
								if (runningRecord) void cancel(runningRecord.id).catch(() => {});
							}}
							size="sm"
							variant="secondary"
						>
							{t("btw.cancel")}
						</Button>
					</div>
				) : null}
				{askError ? (
					<div className="mb-1.5 break-words text-omp-sm text-[var(--omp-error)]" role="alert">
						{askError}
					</div>
				) : null}
				{images.length > 0 ? (
					<div className="mb-2 flex flex-wrap gap-2" data-btw-attachments>
						{images.map((image, index) => (
							<div key={index} className="relative">
								<ZoomableImage
									src={image.preview}
									alt={t("input.attachmentAlt", { index: index + 1 })}
									className="h-20 w-24 rounded-lg border border-(--omp-border-muted) object-cover"
								/>
								<button
									type="button"
									aria-label={t("input.removeAttachment")}
									onClick={() =>
										updateDraft(current => ({
											...current,
											images: current.images.filter((_, itemIndex) => itemIndex !== index),
										}))
									}
									className="absolute right-1 top-1 grid size-5 place-items-center rounded-full border border-(--omp-border-muted) bg-(--omp-bg-elevated) text-(--omp-text)"
								>
									<X size={11} />
								</button>
							</div>
						))}
					</div>
				) : null}
				<TextArea
					aria-label={t("btw.title")}
					autoGrow
					className="max-h-40 w-full"
					onChange={event => updateDraft(current => ({ ...current, text: event.target.value }))}
					onPaste={event => {
						const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
						if (files.length === 0) return;
						event.preventDefault();
						void pasteImages(files);
					}}
					onKeyDown={event => {
						// Enter asks; Shift+Enter is a newline. The separate "Ask now"
						// button was a second way to do the same thing.
						if (event.key !== "Enter" || event.shiftKey) return;
						// An IME's Enter commits the composition, it does not ask.
						if ((event.nativeEvent as KeyboardEvent | undefined)?.isComposing) return;
						if (event.metaKey || event.ctrlKey) return;
						event.preventDefault();
						if ((draft.trim() || images.length > 0) && !busy && reading === 0) void submit();
					}}
					placeholder={selectedId ? t("btw.followUpPlaceholder") : t("btw.questionPlaceholder")}
					ref={inputRef}
					rows={2}
					value={draft}
				/>
				{pending || reading > 0 ? (
					<div className="mt-1.5 flex items-center gap-2 text-omp-xs text-(--omp-dim)">
						<Spinner size="sm" />
					</div>
				) : null}
			</div>
		</div>
	);
}
