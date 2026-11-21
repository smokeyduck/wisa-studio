/**
 * Last painted transcript per session file, kept in memory across tab switches.
 *
 * Opening a session spawns a sidecar (or resumes one) and only then fetches the
 * transcript, so the reader stares at a spinner for seconds after clicking a
 * row — on a slow host, for as long as the process takes to boot. The messages
 * were already on screen a minute ago; keeping the last snapshot lets the
 * transcript paint immediately and be replaced by the fetched copy when it
 * lands, which is what every chat app does on a re-open.
 *
 * Bounded and deliberately dumb: entries are the committed message arrays
 * already held by the messages store (no copies, no serialization), evicted
 * least-recently-written first. A stale entry is only ever shown while the
 * fetch is in flight, and the fetch always wins.
 */
import type { AgentMessage } from "../../shared/rpc-types";

const MAX_ENTRIES = 8;

const cache = new Map<string, AgentMessage[]>();

/** Remember a painted transcript. Empty transcripts are not worth a slot. */
export function rememberTranscript(sessionFile: string | null | undefined, messages: readonly AgentMessage[]): void {
	if (!sessionFile || messages.length === 0) return;
	// Re-insert so the newest entry is last in insertion order.
	cache.delete(sessionFile);
	cache.set(sessionFile, messages as AgentMessage[]);
	while (cache.size > MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
}

/** The last painted transcript for `sessionFile`, or null when none is held. */
export function cachedTranscript(sessionFile: string | null | undefined): AgentMessage[] | null {
	if (!sessionFile) return null;
	const hit = cache.get(sessionFile);
	if (!hit) return null;
	// Touch: the entry that keeps being opened should outlive the one that was.
	cache.delete(sessionFile);
	cache.set(sessionFile, hit);
	return hit;
}

/** Drop one session's entry (its file was deleted or replaced). */
export function forgetTranscript(sessionFile: string | null | undefined): void {
	if (sessionFile) cache.delete(sessionFile);
}

/** Test hook: clear the whole cache. */
export function clearTranscriptCache(): void {
	cache.clear();
}
