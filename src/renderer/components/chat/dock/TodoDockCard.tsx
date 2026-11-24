/** The live session todo list, opened from its compact ribbon below the tabs. */

import {
	closestCenter,
	DndContext,
	type DndContextProps,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	AlertCircle,
	AlertTriangle,
	Check,
	CheckCircle2,
	ChevronRight,
	Circle,
	GripVertical,
	ListTodo,
	Pencil,
	Trash2,
	X,
	XCircle,
} from "lucide-react";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { TodoPhase, TodoTask } from "../../../../shared/rpc-types";
import { useT } from "../../../lib/i18n";
import { isImeKeyEvent } from "../../../lib/ime";
import { onEscape } from "../../../lib/keymap";
import { type OptimisticTarget, optimisticWrite } from "../../../lib/optimistic";
import { useTabRpc } from "../../../lib/tab-rpc";
import { useSessionStore } from "../../../stores/session";
import { sessionRuntimeStore, useRuntimeTabId } from "../../../stores/session-runtime-context";
import { toast } from "../../../stores/toast";
import { type TodoStore, type UiTodoPhase, type UiTodoTask, useTodoStore } from "../../../stores/todo";
import { useUiStore } from "../../../stores/ui";
import { anchorFromEvent, ContextMenu, type ContextMenuAnchor, type ContextMenuItem } from "../../common/ContextMenu";

const STATUS_LABEL_KEY: Record<TodoTask["status"], string> = {
	pending: "todoPanel.status.pending",
	in_progress: "todoPanel.status.inProgress",
	completed: "todoPanel.status.completed",
	abandoned: "todoPanel.status.abandoned",
};

/**
 * Abandoned is a verdict about a task, not a step on the way to done, so it
 * stays out of the click loop: it is set from the row's context menu, and a
 * click on an abandoned task returns it to pending.
 */
const STATUS_CYCLE: TodoTask["status"][] = ["pending", "in_progress", "completed"];

function nextStatus(current: TodoTask["status"]): TodoTask["status"] {
	return STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length] ?? "pending";
}

function TodoStatusIcon({ status }: { status: TodoTask["status"] }) {
	if (status === "in_progress") {
		return <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--omp-link)]" />;
	}
	if (status === "completed") {
		return <CheckCircle2 aria-hidden="true" className="text-[var(--omp-muted)]" size={15} />;
	}
	if (status === "abandoned") {
		return <AlertCircle aria-hidden="true" className="text-[var(--omp-error)]" size={15} />;
	}
	return <Circle aria-hidden="true" className="text-[var(--omp-dim)]" size={15} strokeDasharray="2.5 2.5" />;
}

function todoPayload(phases: UiTodoPhase[]): TodoPhase[] {
	return phases.map(phase => ({
		name: phase.name,
		tasks: phase.tasks.map(task => ({ content: task.content, status: task.status })),
	}));
}

interface SortableTaskRowProps {
	task: UiTodoTask;
	phaseId: string;
	onPatch: (phaseId: string, taskId: string, patch: Partial<UiTodoTask>) => void;
	onDelete: (phaseId: string, taskId: string) => void;
}

const SortableTaskRow = memo(function SortableTaskRow({ task, phaseId, onPatch, onDelete }: SortableTaskRowProps) {
	const t = useT();
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: task.id,
		data: { todoLabel: task.content, phaseId },
	});
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(task.content);
	const [statusMenu, setStatusMenu] = useState<ContextMenuAnchor>();
	const statusItems: ContextMenuItem[] = [
		{
			danger: true,
			id: "abandoned",
			icon: XCircle,
			label: t("todoPanel.markAbandoned"),
			onSelect: () => {
				setStatusMenu(undefined);
				onPatch(phaseId, task.id, { status: "abandoned" });
			},
		},
	];
	const commit = () => {
		const content = draft.trim();
		setEditing(false);
		if (content && content !== task.content) onPatch(phaseId, task.id, { content });
		else setDraft(task.content);
	};

	return (
		<div
			className={`group flex min-h-7 items-start gap-1.5 rounded-md px-1 py-0.5 text-omp-sm leading-6 transition-colors ${
				isDragging ? "z-10 bg-(--omp-selected-bg) shadow-md shadow-black/30" : "hover:bg-(--omp-bg-tertiary)"
			}`}
			ref={setNodeRef}
			style={{
				transform: transform
					? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
					: undefined,
				transition,
			}}
		>
			<button
				aria-label={t("todoPanel.reorder")}
				className="grid size-6 shrink-0 cursor-grab place-items-center text-(--omp-dim) opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
				{...attributes}
				{...listeners}
				aria-roledescription={undefined}
				type="button"
			>
				<GripVertical size={12} />
			</button>
			<button
				aria-label={t("todoPanel.statusAria", {
					status: t(STATUS_LABEL_KEY[task.status] ?? "todoPanel.status.pending"),
				})}
				className="omp-pressable flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
				onClick={() => onPatch(phaseId, task.id, { status: nextStatus(task.status) })}
				onContextMenu={event => setStatusMenu(anchorFromEvent(event))}
				title={t("todoPanel.cycleHint")}
				type="button"
			>
				<TodoStatusIcon status={task.status} />
			</button>
			{statusMenu && (
				<ContextMenu
					items={statusItems}
					onClose={() => setStatusMenu(undefined)}
					x={statusMenu.x}
					y={statusMenu.y}
				/>
			)}
			{editing ? (
				<div
					className="flex min-w-0 flex-1 flex-wrap items-start justify-end gap-1"
					onBlur={event => {
						if (!event.currentTarget.contains(event.relatedTarget)) commit();
					}}
				>
					<textarea
						autoFocus
						aria-label={t("todoPanel.edit")}
						className="min-h-8 w-full min-w-0 resize-y rounded-md border border-(--omp-border-accent) bg-(--omp-input-bg) px-2 py-1 text-omp-md text-(--omp-text) [field-sizing:content] focus:outline-none"
						rows={2}
						onChange={event => setDraft(event.target.value)}
						onKeyDown={event => {
							if (isImeKeyEvent(event)) return;
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								commit();
							}
							onEscape(event, () => {
								setDraft(task.content);
								setEditing(false);
							});
						}}
						value={draft}
					/>
					<button aria-label={t("common.save")} className="text-(--omp-success)" onClick={commit} type="button">
						<Check size={12} />
					</button>
					<button
						aria-label={t("common.cancel")}
						className="text-(--omp-muted)"
						onClick={() => {
							setDraft(task.content);
							setEditing(false);
						}}
						type="button"
					>
						<X size={12} />
					</button>
				</div>
			) : (
				<>
					<span
						className={`min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere ${
							task.status === "abandoned"
								? "text-(--omp-dim) line-through"
								: task.status === "completed"
									? "text-(--omp-muted)"
									: "text-(--omp-text)"
						}`}
						onDoubleClick={() => {
							setDraft(task.content);
							setEditing(true);
						}}
						title={task.content}
					>
						{task.content}
					</span>
					<button
						aria-label={t("todoPanel.edit")}
						className="grid size-6 shrink-0 place-items-center rounded text-(--omp-dim) opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-(--omp-text)"
						onClick={() => {
							setDraft(task.content);
							setEditing(true);
						}}
						type="button"
					>
						<Pencil size={11} />
					</button>
					<button
						aria-label={t("common.delete")}
						className="grid size-6 shrink-0 place-items-center rounded text-(--omp-dim) opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-(--omp-error)"
						onClick={() => onDelete(phaseId, task.id)}
						type="button"
					>
						<Trash2 size={11} />
					</button>
				</>
			)}
		</div>
	);
});

function PhaseSection({
	phase,
	hideHeader,
	collapsed,
	onToggle,
	onPatch,
	onDelete,
}: {
	phase: UiTodoPhase;
	hideHeader: boolean;
	collapsed: boolean;
	onToggle: () => void;
	onPatch: (phaseId: string, taskId: string, patch: Partial<UiTodoTask>) => void;
	onDelete: (phaseId: string, taskId: string) => void;
}) {
	const t = useT();
	const done = phase.tasks.filter(task => task.status === "completed").length;
	const total = phase.tasks.length;

	return (
		<section className="mb-2 last:mb-0">
			{!hideHeader && (
				<button
					aria-expanded={!collapsed}
					className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-(--omp-bg-tertiary)"
					onClick={onToggle}
					type="button"
				>
					<ChevronRight
						className="omp-disclosure-chevron mt-0.5 shrink-0 text-(--omp-dim)"
						size={12}
						style={{ transform: collapsed ? undefined : "rotate(90deg)" }}
					/>
					<span className="min-w-0 flex-1 wrap-anywhere text-omp-sm font-semibold text-(--omp-text)">
						{phase.name}
					</span>
					<span className="shrink-0 text-omp-xs tabular-nums text-(--omp-dim)">
						{done}/{total}
					</span>
				</button>
			)}
			{(hideHeader || !collapsed) && (
				<SortableContext items={phase.tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
					<div className={hideHeader ? undefined : "ml-2 border-l border-(--omp-border-muted) pl-1.5"}>
						{phase.tasks.map(task => (
							<SortableTaskRow
								key={task.id}
								onDelete={onDelete}
								onPatch={onPatch}
								phaseId={phase.id}
								task={task}
							/>
						))}
						{total === 0 && (
							<div className="py-1 text-omp-sm text-(--omp-dim) italic">{t("todoPanel.noTasks")}</div>
						)}
					</div>
				</SortableContext>
			)}
		</section>
	);
}

export function TodoRibbon() {
	const tabId = useRuntimeTabId();
	const sessionId = useSessionStore(state => state.sessionId);
	return <SessionTodoRibbon key={`${tabId ?? ""}:${sessionId ?? ""}`} />;
}

function SessionTodoRibbon() {
	const rpc = useTabRpc();
	const tabId = useRuntimeTabId();
	const todoStore = sessionRuntimeStore<TodoStore>(tabId, "todo") ?? useTodoStore;
	const t = useT();
	const phases = useTodoStore(state => state.phases);
	const reminderVisible = useTodoStore(state => state.reminderVisible);
	const reminderTodos = useTodoStore(state => state.reminderTodos);
	const clearReminder = useTodoStore(state => state.clearReminder);
	const setPhases = useTodoStore(state => state.setPhases);

	const [open, setOpen] = useState(false);
	const root = useRef<HTMLElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const dragging = useRef(false);
	const listId = useId();
	const ribbonRequest = useUiStore(state => state.todoRibbonRequest);
	const seenRequest = useRef(ribbonRequest);

	useEffect(() => {
		if (seenRequest.current === ribbonRequest) return;
		seenRequest.current = ribbonRequest;
		trigger.current?.focus();
		setOpen(true);
	}, [ribbonRequest]);

	useEffect(() => {
		if (!open) return;
		const onOutside = (event: PointerEvent) => {
			const target = event.target;
			if (target instanceof Element && !root.current?.contains(target) && !target.closest('[role="menu"]')) {
				setOpen(false);
			}
		};
		document.addEventListener("pointerdown", onOutside);
		return () => {
			dragging.current = false;
			document.removeEventListener("pointerdown", onOutside);
		};
	}, [open]);
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);
	const dragAccessibility = useMemo<DndContextProps["accessibility"]>(
		() => ({
			screenReaderInstructions: { draggable: t("todoPanel.dragInstructions") },
			announcements: {
				onDragStart: ({ active }) => t("todoPanel.dragPicked", { task: active.data.current?.todoLabel ?? "" }),
				onDragOver: ({ active, over }) =>
					over && active.id !== over.id && active.data.current?.phaseId === over.data.current?.phaseId
						? t("todoPanel.dragOver", { task: over.data.current?.todoLabel ?? "" })
						: undefined,
				onDragEnd: ({ active, over }) =>
					over && active.id !== over.id && active.data.current?.phaseId === over.data.current?.phaseId
						? t("todoPanel.dragPlaced", { task: active.data.current?.todoLabel ?? "" })
						: t("todoPanel.dragCancelled"),
				onDragCancel: () => t("todoPanel.dragCancelled"),
			},
		}),
		[t],
	);

	/* The ribbon edits through setPhases, which archives each change as a
	   transcript snapshot — so both the optimistic value and its rollback go
	   through it instead of assigning `phases` behind the archive's back. */
	const writes = useMemo<OptimisticTarget<TodoStore>>(
		() => ({
			getState: () => todoStore.getState(),
			setState: partial => {
				if (partial.phases) setPhases(partial.phases);
				else todoStore.setState(partial);
			},
		}),
		[setPhases, todoStore],
	);

	const applyPhases = useCallback(
		(next: UiTodoPhase[]) => {
			void optimisticWrite({
				store: writes,
				mutate: () => ({ phases: next }),
				persist: () => rpc.setTodos(todoPayload(next)),
				onFailure: message => toast({ variant: "error", title: t("todoPanel.updateFailed"), message }),
			});
		},
		[rpc, t, writes],
	);

	const patchTask = useCallback(
		(phaseId: string, taskId: string, patch: Partial<UiTodoTask>) => {
			const next = phases.map(phase =>
				phase.id !== phaseId
					? phase
					: {
							...phase,
							tasks: phase.tasks.map(task => (task.id === taskId ? { ...task, ...patch } : task)),
						},
			);
			applyPhases(next);
		},
		[phases, applyPhases],
	);

	const deleteTask = useCallback(
		(phaseId: string, taskId: string) => {
			const next = phases
				.map(phase =>
					phase.id === phaseId ? { ...phase, tasks: phase.tasks.filter(task => task.id !== taskId) } : phase,
				)
				.filter(phase => phase.id !== phaseId || phase.tasks.length > 0);
			applyPhases(next);
		},
		[applyPhases, phases],
	);

	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			dragging.current = false;
			const { active, over } = event;
			if (!over || active.id === over.id) return;
			const phase = phases.find(p => p.tasks.some(task => task.id === active.id));
			if (!phase) return;
			const from = phase.tasks.findIndex(task => task.id === active.id);
			const to = phase.tasks.findIndex(task => task.id === over.id);
			if (from < 0 || to < 0) return;
			applyPhases(phases.map(p => (p.id === phase.id ? { ...p, tasks: arrayMove(p.tasks, from, to) } : p)));
		},
		[phases, applyPhases],
	);

	const togglePhase = useCallback((id: string) => {
		setCollapsed(prev => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const taskCounts = useMemo(() => {
		const counts = { running: 0, pending: 0, completed: 0, abandoned: 0, total: 0, current: "" };
		for (const phase of phases) {
			counts.total += phase.tasks.length;
			for (const task of phase.tasks) {
				if (task.status === "in_progress") {
					counts.running++;
					counts.current ||= task.content;
				} else if (task.status === "pending") counts.pending++;
				else if (task.status === "completed") counts.completed++;
				else if (task.status === "abandoned") counts.abandoned++;
			}
		}
		return counts;
	}, [phases]);
	const taskSummary =
		taskCounts.running > 0 && taskCounts.pending > 0
			? t("dock.todo.runningAndPending", taskCounts)
			: taskCounts.running > 0
				? t("dock.todo.running", taskCounts)
				: taskCounts.pending > 0
					? t("dock.todo.pending", taskCounts)
					: t("dock.todo.completed", taskCounts);
	const ribbonState =
		taskCounts.running > 0
			? "running"
			: taskCounts.abandoned > 0
				? "failed"
				: taskCounts.pending === 0 && taskCounts.completed > 0
					? "complete"
					: "pending";
	const abandoned = taskCounts.abandoned > 0 ? t("dock.todo.abandoned", taskCounts) : "";
	const summary =
		taskCounts.total === 0
			? t("todoPanel.noTasks")
			: taskCounts.total === taskCounts.abandoned
				? abandoned
				: abandoned
					? `${taskSummary} · ${abandoned}`
					: taskSummary;
	if (phases.length === 0 && !reminderVisible) return null;

	return (
		<section
			aria-label={t("dock.todo")}
			className="relative z-30 flex h-6 shrink-0 items-center justify-center border-b border-(--omp-border-muted) bg-(--omp-bg-secondary)"
			data-todo-ribbon
			data-state={ribbonState}
			onBlur={event => {
				const next = event.relatedTarget;
				if (!event.currentTarget.contains(next) && !next?.closest('[role="menu"]')) setOpen(false);
			}}
			onKeyDown={event => {
				if (!open || dragging.current || event.defaultPrevented) return;
				onEscape(event, () => {
					trigger.current?.focus();
					setOpen(false);
				});
			}}
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={event => {
				const active = document.activeElement;
				if (!event.currentTarget.contains(active) && !active?.closest('[role="menu"]')) setOpen(false);
			}}
			ref={root}
		>
			<button
				aria-controls={open ? listId : undefined}
				aria-expanded={open}
				className="omp-pressable flex h-full w-full min-w-0 items-center justify-center gap-2 px-2 text-omp-xs text-(--omp-muted) hover:text-(--omp-text) focus-visible:text-(--omp-text)"
				onClick={() => setOpen(true)}
				onFocus={() => setOpen(true)}
				ref={trigger}
				type="button"
			>
				{ribbonState === "running" ? (
					<span aria-hidden="true" className="omp-working-dot omp-working-dot--sm shrink-0" />
				) : ribbonState === "failed" ? (
					<AlertCircle aria-hidden="true" className="shrink-0 text-(--omp-error)" size={12} />
				) : ribbonState === "complete" ? (
					<CheckCircle2 aria-hidden="true" className="shrink-0 text-(--omp-success)" size={12} />
				) : (
					<ListTodo aria-hidden="true" className="shrink-0 text-(--omp-muted)" size={12} />
				)}
				<span className="shrink-0 font-medium text-(--omp-text)">{t("dock.todo")}</span>
				{taskCounts.current && (
					<span className="min-w-0 max-w-md truncate text-(--omp-text)" title={taskCounts.current}>
						{taskCounts.current}
					</span>
				)}
				<span aria-live="polite" className="min-w-0 truncate" title={summary}>
					{summary}
				</span>
				{reminderVisible && (
					<AlertTriangle aria-hidden="true" className="shrink-0 text-(--omp-warning)" size={12} />
				)}
				<ChevronRight aria-hidden="true" className="shrink-0 rotate-90" size={12} />
			</button>
			{open && (
				<div
					className="absolute inset-x-2 top-full mx-auto max-h-[min(24rem,50dvh)] max-w-xl space-y-2 overflow-y-auto overscroll-contain rounded-b-xl border border-(--omp-border) bg-(--omp-bg-elevated) px-2.5 py-2 shadow-lg"
					id={listId}
				>
					{taskCounts.total > 0 && (
						<div className="flex items-center gap-2 px-1">
							<div
								aria-label={t("dock.todo")}
								aria-valuenow={taskCounts.completed}
								aria-valuemin={0}
								aria-valuemax={taskCounts.total}
								className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-(--omp-border-muted)"
								role="progressbar"
							>
								<div
									className="h-full rounded-full bg-(--omp-success)"
									style={{ width: `${(taskCounts.completed / taskCounts.total) * 100}%` }}
								/>
							</div>
							<span className="shrink-0 text-omp-xs tabular-nums text-(--omp-muted)">
								{taskCounts.completed}/{taskCounts.total}
							</span>
						</div>
					)}
					{reminderVisible && (
						<div className="mb-1.5 flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--omp-warning)_40%,transparent)] bg-transparent px-2.5 py-2">
							<AlertTriangle className="mt-px shrink-0 text-(--omp-warning)" size={13} />
							<div className="min-w-0 flex-1 text-omp-sm leading-snug text-(--omp-warning)">
								<span className="font-semibold">{t("todoPanel.reminder")}</span>
								<span className="text-(--omp-muted)">
									{` - ${t("todoPanel.reminderCount", { count: reminderTodos.length })}`}
								</span>
							</div>
							<button
								aria-label={t("todoPanel.dismissReminder")}
								className="shrink-0 text-(--omp-warning) opacity-70 transition-opacity hover:opacity-100"
								onClick={clearReminder}
								type="button"
							>
								<X size={12} />
							</button>
						</div>
					)}
					<DndContext
						accessibility={dragAccessibility}
						collisionDetection={closestCenter}
						onDragCancel={() => {
							dragging.current = false;
						}}
						onDragEnd={onDragEnd}
						onDragStart={() => {
							dragging.current = true;
						}}
						sensors={sensors}
					>
						{phases.map(phase => (
							<PhaseSection
								collapsed={collapsed.has(phase.id)}
								hideHeader={phases.length === 1}
								key={phase.id}
								onDelete={deleteTask}
								onPatch={patchTask}
								onToggle={() => togglePhase(phase.id)}
								phase={phase}
							/>
						))}
					</DndContext>
				</div>
			)}
		</section>
	);
}
