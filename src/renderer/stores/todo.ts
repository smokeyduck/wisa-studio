import { createStore } from "zustand/vanilla";
import type { TodoPhase, TodoTask } from "../../shared/rpc-types";
import { createScopedStoreApi, useScopedStore } from "./session-runtime-context";

export interface UiTodoTask extends TodoTask {
	id: string;
}

export interface UiTodoPhase extends Omit<TodoPhase, "tasks"> {
	id: string;
	tasks: UiTodoTask[];
}

export interface TodoStore {
	phases: UiTodoPhase[];
	reminderVisible: boolean;
	reminderTodos: TodoTask[];
	setPhases: (phases: TodoPhase[]) => void;
	autoClearCompleted: () => void;
	showReminder: (todos: TodoTask[]) => void;
	clearReminder: () => void;
	reset: () => void;
}

const initialState = {
	phases: [] as UiTodoPhase[],
	reminderVisible: false,
	reminderTodos: [] as TodoTask[],
};

function normalizePhases(phases: TodoPhase[]): UiTodoPhase[] {
	return phases.map((phase, phaseIndex) => {
		const existingPhaseId = "id" in phase && typeof phase.id === "string" ? phase.id : null;
		const phaseId = existingPhaseId ?? `phase:${phaseIndex}:${phase.name}`;
		return {
			...phase,
			id: phaseId,
			tasks: phase.tasks.map((task, taskIndex) => ({
				...task,
				id: "id" in task && typeof task.id === "string" ? task.id : `${phaseId}:task:${taskIndex}`,
			})),
		};
	});
}

/**
 * A task status as the GUI tracks it. Saved sessions from before omp 18.19 can
 * still carry `blocked`, which the agent now restores as pending; reading it
 * the same way preserves tasks written by those versions.
 */
function todoStatusOf(value: unknown): TodoTask["status"] | undefined {
	if (value === "blocked") return "pending";
	return value === "pending" || value === "in_progress" || value === "completed" || value === "abandoned"
		? value
		: undefined;
}

function todoTaskOf(value: unknown): TodoTask | undefined {
	if (typeof value !== "object" || value === null || !("content" in value) || typeof value.content !== "string")
		return undefined;
	const status = "status" in value ? todoStatusOf(value.status) : undefined;
	return status ? { ...value, content: value.content, status } : undefined;
}

function todoPhaseOf(value: unknown): TodoPhase | undefined {
	if (typeof value !== "object" || value === null || !("name" in value) || typeof value.name !== "string")
		return undefined;
	if (!("tasks" in value) || !Array.isArray(value.tasks)) return undefined;
	const tasks = value.tasks.map(todoTaskOf);
	return tasks.every(task => task !== undefined) ? { name: value.name, tasks } : undefined;
}

/** The phases a `todo` tool result carries, live or saved; undefined when it carries none. */
export function todoPhasesFromToolResult(result: unknown): TodoPhase[] | undefined {
	if (typeof result !== "object" || result === null || !("details" in result)) return undefined;
	const details = result.details;
	if (typeof details !== "object" || details === null || !("phases" in details)) return undefined;
	if (!Array.isArray(details.phases)) return undefined;
	const phases = details.phases.map(todoPhaseOf);
	return phases.every(phase => phase !== undefined) ? phases : undefined;
}

export const createTodoStore = () =>
	createStore<TodoStore>()(set => ({
		...initialState,
		setPhases: phases => set({ phases: normalizePhases(phases) }),
		autoClearCompleted: () =>
			set({
				phases: [],
				reminderVisible: false,
				reminderTodos: [],
			}),
		showReminder: todos => set({ reminderVisible: true, reminderTodos: todos }),
		clearReminder: () => set({ reminderVisible: false, reminderTodos: [] }),
		reset: () => set(initialState),
	}));

const defaultTodoStore = createTodoStore();
function useTodo(): TodoStore;
function useTodo<U>(selector: (state: TodoStore) => U): U;
function useTodo<U = TodoStore>(selector?: (state: TodoStore) => U): U {
	return useScopedStore("todo", defaultTodoStore, selector);
}
export const useTodoStore = Object.assign(useTodo, createScopedStoreApi("todo", defaultTodoStore));
