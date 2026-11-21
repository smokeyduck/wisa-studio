/**
 * Contracts for the last-painted-transcript cache: a re-open of a session must
 * paint its history at once, and a stale entry must never be able to grow
 * without bound or survive a deleted session file.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { AgentMessage } from "../../shared/rpc-types";
import { cachedTranscript, clearTranscriptCache, forgetTranscript, rememberTranscript } from "./transcript-cache";

function messages(text: string): AgentMessage[] {
	return [{ role: "user", content: text }] as AgentMessage[];
}

afterEach(() => {
	clearTranscriptCache();
});

describe("transcript cache", () => {
	it("returns what was painted for the same session file", () => {
		const painted = messages("hello");
		rememberTranscript("/sessions/a.json", painted);
		expect(cachedTranscript("/sessions/a.json")).toBe(painted);
	});

	it("keeps sessions apart and answers null for an unknown file", () => {
		rememberTranscript("/sessions/a.json", messages("a"));
		rememberTranscript("/sessions/b.json", messages("b"));
		expect(cachedTranscript("/sessions/a.json")?.[0]).toMatchObject({ content: "a" });
		expect(cachedTranscript("/sessions/b.json")?.[0]).toMatchObject({ content: "b" });
		expect(cachedTranscript("/sessions/c.json")).toBeNull();
	});

	it("ignores a null key and an empty transcript", () => {
		rememberTranscript(null, messages("a"));
		rememberTranscript("/sessions/a.json", []);
		expect(cachedTranscript("/sessions/a.json")).toBeNull();
	});

	it("forgets one session's entry", () => {
		rememberTranscript("/sessions/a.json", messages("a"));
		forgetTranscript("/sessions/a.json");
		expect(cachedTranscript("/sessions/a.json")).toBeNull();
	});

	it("evicts least-recently-written entries once it is full", () => {
		// More sessions than the cache holds: the ones painted first must be the
		// ones that go, so a long session list cannot pin every transcript.
		for (let index = 0; index < 20; index++) rememberTranscript(`/sessions/${index}.json`, messages(String(index)));
		expect(cachedTranscript("/sessions/0.json")).toBeNull();
		expect(cachedTranscript("/sessions/19.json")?.[0]).toMatchObject({ content: "19" });
	});

	it("counts a read as use, so the session being reopened outlives the rest", () => {
		rememberTranscript("/sessions/keep.json", messages("keep"));
		for (let index = 0; index < 7; index++) rememberTranscript(`/sessions/${index}.json`, messages(String(index)));
		// The read is what a re-open does: it must refresh the entry's standing,
		// or the session opened most often would be the first to fall out.
		expect(cachedTranscript("/sessions/keep.json")).not.toBeNull();
		rememberTranscript("/sessions/fresh.json", messages("fresh"));
		expect(cachedTranscript("/sessions/keep.json")).not.toBeNull();
		expect(cachedTranscript("/sessions/0.json")).toBeNull();
	});
});
