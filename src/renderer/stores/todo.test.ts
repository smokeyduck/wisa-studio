import { describe, expect, it } from "vitest";
import { todoPhasesFromToolResult } from "./todo";

describe("todo results saved before omp 18.19", () => {
	it("reads a since-removed blocked task as pending instead of dropping the whole plan", () => {
		const phases = todoPhasesFromToolResult({
			details: {
				phases: [
					{
						name: "Ship",
						tasks: [
							{ content: "Wait on review", status: "blocked", blocker: "reviewer out" },
							{ content: "Merge", status: "completed" },
						],
					},
				],
			},
		});
		expect(phases?.[0]?.tasks.map(task => [task.content, task.status])).toEqual([
			["Wait on review", "pending"],
			["Merge", "completed"],
		]);
	});
});
