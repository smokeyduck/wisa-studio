import type { UiTodoPhase } from "../../../stores/todo";
import { subagentActivity } from "../../agents/agent-activity";
import type { SubagentListRow } from "../../panels/subagent-graph";

export const TODO_SUMMARY_THRESHOLD = 10;
export const TODO_COMPLETED_PREVIEW = 3;
export const AGENT_SUMMARY_LIMIT = 5;

export interface TodoDockSummary {
	phases: UiTodoPhase[];
	hiddenCount: number;
	totalCount: number;
}

/**
 * Above ten todos, keep every actionable task visible and add only the three
 * most recent completed tasks. Abandoned work is available in focused mode.
 */
export function buildTodoDockSummary(phases: UiTodoPhase[]): TodoDockSummary {
	const tasks = phases.flatMap(phase => phase.tasks);
	if (tasks.length <= TODO_SUMMARY_THRESHOLD) {
		return { phases, hiddenCount: 0, totalCount: tasks.length };
	}

	const visibleIds = new Set(
		tasks.filter(task => task.status !== "completed" && task.status !== "abandoned").map(task => task.id),
	);
	for (const task of tasks.filter(task => task.status === "completed").slice(-TODO_COMPLETED_PREVIEW)) {
		visibleIds.add(task.id);
	}

	const summaryPhases = phases
		.map(phase => ({ ...phase, tasks: phase.tasks.filter(task => visibleIds.has(task.id)) }))
		.filter(phase => phase.tasks.length > 0);
	return {
		phases: summaryPhases,
		hiddenCount: tasks.length - visibleIds.size,
		totalCount: tasks.length,
	};
}

/**
 * Only unfinished work and its resolved ancestors belong in the live card.
 * Sharing a task call does not keep finished siblings alive. The pre-order
 * depths preserve parents resolved from transcript tool ownership too.
 */
export function liveAgentRows(rows: SubagentListRow[]): SubagentListRow[] {
	const ancestors: string[] = [];
	const keep = new Set<string>();
	for (const { agent, depth } of rows) {
		ancestors.length = Math.min(ancestors.length, depth);
		ancestors.push(agent.id);
		const activity = subagentActivity(agent);
		if (activity === "working" || activity === "waiting") {
			for (const id of ancestors) keep.add(id);
		}
	}
	return rows.filter(({ agent }) => keep.has(agent.id));
}

export interface AgentDockSummary {
	rows: SubagentListRow[];
	hiddenCount: number;
	totalCount: number;
}

/**
 * Keep every live/failed agent, then fill a five-row preview with the most
 * recently updated terminal agents. Ancestors are retained so the tree never
 * shows an indented orphan.
 */
export function buildAgentDockSummary(rows: SubagentListRow[]): AgentDockSummary {
	if (rows.length <= AGENT_SUMMARY_LIMIT) {
		return { rows, hiddenCount: 0, totalCount: rows.length };
	}

	const agentById = new Map(rows.map(row => [row.agent.id, row.agent]));
	const visibleIds = new Set<string>();
	const addWithAncestors = (id: string): void => {
		let current = agentById.get(id);
		const seen = new Set<string>();
		while (current && !seen.has(current.id)) {
			visibleIds.add(current.id);
			seen.add(current.id);
			current = current.parentSubagentId ? agentById.get(current.parentSubagentId) : undefined;
		}
	};

	for (const { agent } of rows) {
		if (subagentActivity(agent) !== "done" && subagentActivity(agent) !== "stopped") {
			addWithAncestors(agent.id);
		}
	}

	const recentTerminal = rows
		.filter(({ agent }) => subagentActivity(agent) === "done" || subagentActivity(agent) === "stopped")
		.toSorted((a, b) => b.agent.lastUpdate - a.agent.lastUpdate || b.agent.index - a.agent.index);
	for (const { agent } of recentTerminal) {
		if (visibleIds.size >= AGENT_SUMMARY_LIMIT) break;
		addWithAncestors(agent.id);
	}

	return {
		rows: rows.filter(({ agent }) => visibleIds.has(agent.id)),
		hiddenCount: rows.length - visibleIds.size,
		totalCount: rows.length,
	};
}
