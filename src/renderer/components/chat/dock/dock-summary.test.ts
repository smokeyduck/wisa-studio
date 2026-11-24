import { describe, expect, it } from "vitest";
import type { SubagentSnapshot } from "../../../../shared/rpc-types";
import type { SubagentListRow } from "../../panels/subagent-graph";
import { buildAgentDockSummary } from "./dock-summary";

function agent(id: string, status: string, lastUpdate: number, parentSubagentId?: string): SubagentSnapshot {
	return {
		id,
		index: Number(id.replace(/\D/g, "")) || 0,
		agent: id,
		status,
		lastUpdate,
		parentSubagentId,
	};
}

describe("subagent transcript summary", () => {
	it("keeps urgent agents, preserves their ancestors, and fills the preview with recent completions", () => {
		const rows: SubagentListRow[] = [
			{ agent: agent("a1", "completed", 1), depth: 0 },
			{ agent: agent("a2", "running", 2, "a1"), depth: 1 },
			{ agent: agent("a3", "waiting", 3), depth: 0 },
			{ agent: agent("a4", "failed", 4), depth: 0 },
			{ agent: agent("a5", "completed", 5), depth: 0 },
			{ agent: agent("a6", "completed", 6), depth: 0 },
			{ agent: agent("a7", "completed", 7), depth: 0 },
			{ agent: agent("a8", "completed", 8), depth: 0 },
		];

		const summary = buildAgentDockSummary(rows);
		expect(summary.rows.map(row => row.agent.id)).toEqual(["a1", "a2", "a3", "a4", "a8"]);
		expect(summary).toMatchObject({ totalCount: 8, hiddenCount: 3 });
	});
});
