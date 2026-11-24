import type { AgentMessage } from "../../../shared/rpc-types";
import { resultDetails } from "../../lib/format";

export interface LaunchCompletionDaemon {
	name: string;
	state?: string;
	exitCode?: number;
	startedAt?: number;
	exitedAt?: number;
}

export function isCompletionMessage(message: AgentMessage): boolean {
	return message.customType === "async-result" || message.customType === "launch-completion";
}

export function launchCompletionDaemons(message: AgentMessage): LaunchCompletionDaemon[] {
	if (message.customType !== "launch-completion") return [];
	if (typeof message.details !== "object" || message.details === null) return [];
	const daemons = (message.details as Record<string, unknown>).daemons;
	if (!Array.isArray(daemons)) return [];
	return daemons.flatMap(value => {
		if (typeof value !== "object" || value === null) return [];
		const daemon = value as Record<string, unknown>;
		if (typeof daemon.name !== "string" || daemon.name.trim() === "") return [];
		return [
			{
				name: daemon.name.trim(),
				state: typeof daemon.state === "string" ? daemon.state : undefined,
				exitCode: typeof daemon.exitCode === "number" ? daemon.exitCode : undefined,
				startedAt: typeof daemon.startedAt === "number" ? daemon.startedAt : undefined,
				exitedAt: typeof daemon.exitedAt === "number" ? daemon.exitedAt : undefined,
			},
		];
	});
}

export function launchCompletionFailureCount(message: AgentMessage): number {
	return launchCompletionDaemons(message).filter(
		daemon => daemon.state === "failed" || (daemon.exitCode !== undefined && daemon.exitCode !== 0),
	).length;
}

/** Move only task results whose exact agent ID has a visible history card. */
export function foldSubagentCompletions(
	messages: AgentMessage[],
	agents: ReadonlyMap<string, number>,
	completions: Map<string, AgentMessage[]>,
): AgentMessage[] {
	if (agents.size === 0) return messages;
	return messages.flatMap(message => {
		if (message.role !== "custom" || message.customType !== "async-result" || message.display === false)
			return [message];
		const details = resultDetails(message);
		const jobs: unknown = details?.jobs;
		if (!Array.isArray(jobs)) return [message];
		const remaining: unknown[] = [];
		const matched = new Map<string, unknown[]>();
		for (const value of jobs as unknown[]) {
			const job = value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
			if (
				job?.type === "task" &&
				typeof job.jobId === "string" &&
				typeof job.agentId === "string" &&
				agents.has(job.agentId)
			) {
				const group = matched.get(job.agentId);
				if (group) group.push(job);
				else matched.set(job.agentId, [job]);
			} else remaining.push(value);
		}
		if (matched.size === 0) return [message];
		for (const [id, results] of matched) {
			const delivery = { ...message, details: { ...details, jobs: results } };
			const group = completions.get(id);
			if (group) group.push(delivery);
			else completions.set(id, [delivery]);
		}
		return remaining.length ? [{ ...message, details: { ...details, jobs: remaining } }] : [];
	});
}
