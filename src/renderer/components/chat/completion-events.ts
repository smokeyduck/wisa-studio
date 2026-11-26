import type { AgentMessage } from "../../../shared/rpc-types";
import { resultDetails } from "../../lib/format";
import { ircSenderId } from "../../lib/irc-notice";
import { messageTimestampMs } from "../../lib/message-identity";

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

/** Move replies and task results only when they have an owning history card. */
export function foldSubagentNotices(
	messages: AgentMessage[],
	claimAgent: (id: string, message: AgentMessage) => boolean,
	completions: Map<string, AgentMessage[]>,
	replies: Map<string, number[]>,
): AgentMessage[] {
	return messages.flatMap(message => {
		if (message.role !== "custom" || message.display === false) return [message];
		const type = message.customType;
		if (type === "irc:incoming" || type === "irc:autoreply" || type === "irc:relay") {
			const from = ircSenderId(message);
			if (!from || !claimAgent(from, message)) return [message];
			const times = replies.get(from);
			const timestamp = messageTimestampMs(message);
			if (times) times.push(timestamp);
			else replies.set(from, [timestamp]);
			return [];
		}
		if (type !== "async-result") return [message];
		const details = resultDetails(message);
		const jobs: unknown = details?.jobs;
		if (!Array.isArray(jobs)) return [message];
		const remaining: unknown[] = [];
		const matched = new Map<string, unknown[]>();
		for (const value of jobs as unknown[]) {
			const job = value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
			if (job?.type === "task" && typeof job.jobId === "string") {
				// Legacy deliveries use the job ID as the agent ID. An explicit ID
				// takes precedence because the job ID can be renamed on collision.
				const id = typeof job.agentId === "string" ? job.agentId : job.jobId;
				if (claimAgent(id, message)) {
					const group = matched.get(id);
					if (group) group.push(job);
					else matched.set(id, [job]);
					continue;
				}
			}
			remaining.push(value);
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
