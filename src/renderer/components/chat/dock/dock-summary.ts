import { subagentActivity } from "../../agents/agent-activity";
import type { SubagentListRow } from "../../panels/subagent-graph";

export const AGENT_SUMMARY_LIMIT = 5;

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

	const parentById = new Map<string, string>();
	const ancestors: string[] = [];
	for (const { agent, depth } of rows) {
		const parent = ancestors[depth - 1];
		if (parent !== undefined) parentById.set(agent.id, parent);
		ancestors[depth] = agent.id;
	}
	const visibleIds = new Set<string>();
	const addWithAncestors = (id: string): void => {
		for (let next: string | undefined = id; next !== undefined && !visibleIds.has(next); next = parentById.get(next)) {
			visibleIds.add(next);
		}
	};

	for (const { agent } of rows) {
		const activity = subagentActivity(agent);
		if (activity === "working" || activity === "waiting" || activity === "failed") addWithAncestors(agent.id);
	}

	const recentTerminal = rows
		.filter(({ agent }) => !visibleIds.has(agent.id))
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
