import type { AgentMessage, SessionStats } from "../../../shared/rpc-types";
import type { ToolEntry } from "../../stores/tools";

interface TimeRange {
	start: number;
	end: number;
}

function timestampMs(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string") return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function addRange(ranges: TimeRange[], start: number | null, end: number | null): void {
	if (start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
	ranges.push({ start, end });
}

/** Cache reads divided by every prompt token eligible for caching. */
export function sessionCacheHitPercent(stats: SessionStats | null): number | null {
	if (!stats) return null;
	const denominator = stats.tokens.input + stats.tokens.cacheRead + stats.tokens.cacheWrite;
	return denominator > 0 ? (stats.tokens.cacheRead / denominator) * 100 : 0;
}

/** Prepare settled activity once; live ticks only measure its overlap with ongoing work. */
export function prepareSessionExecutionDuration({
	messages,
	streamingMessage,
	tools,
	awaitingModelSince,
	isStreaming,
}: {
	messages: AgentMessage[];
	streamingMessage: AgentMessage | null;
	tools: ReadonlyMap<string, Pick<ToolEntry, "startTime" | "endTime">>;
	awaitingModelSince: number | null;
	isStreaming: boolean;
}): (now: number) => number {
	const ranges: TimeRange[] = [];
	for (const message of messages) {
		if (message.role !== "assistant") continue;
		const start = timestampMs(message.timestamp);
		const duration = typeof message.duration === "number" && Number.isFinite(message.duration) ? message.duration : 0;
		addRange(ranges, start, start === null ? null : start + Math.max(0, duration));
	}
	let liveStart = Number.POSITIVE_INFINITY;
	for (const tool of tools.values()) {
		if (tool.endTime !== null) addRange(ranges, tool.startTime, tool.endTime);
		else if (isStreaming && Number.isFinite(tool.startTime)) liveStart = Math.min(liveStart, tool.startTime);
	}
	if (isStreaming) {
		const start = timestampMs(streamingMessage?.timestamp) ?? awaitingModelSince;
		if (start !== null && Number.isFinite(start)) liveStart = Math.min(liveStart, start);
	}
	ranges.sort((left, right) => left.start - right.start || left.end - right.end);
	const merged: TimeRange[] = [];
	for (const range of ranges) {
		const previous = merged[merged.length - 1];
		if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
		else merged.push(range);
	}
	const totals = [0];
	for (const range of merged) totals.push(totals[totals.length - 1]! + range.end - range.start);
	const total = totals[totals.length - 1]!;
	if (!Number.isFinite(liveStart)) return () => total;
	// Duration covered by settled activity before this timestamp. Prefix sums
	// keep each clock tick logarithmic even for a long session transcript.
	const coveredBefore = (time: number): number => {
		let low = 0;
		let high = merged.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (merged[middle]!.end <= time) low = middle + 1;
			else high = middle;
		}
		const range = merged[low];
		return totals[low]! + (range ? Math.max(0, time - range.start) : 0);
	};
	const coveredAtStart = coveredBefore(liveStart);
	return now => total + Math.max(0, now - liveStart) - Math.max(0, coveredBefore(now) - coveredAtStart);
}
