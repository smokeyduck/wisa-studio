import { useSyncExternalStore } from "react";
import type { StoreApi } from "zustand/vanilla";
import { type SessionStore, useSessionStore } from "../stores/session";
import { useSessionRuntime } from "../stores/session-runtime-context";

interface WorkspaceRevision {
	subscribe: (listener: () => void) => () => void;
	getSnapshot: () => number;
	invalidate: () => void;
}

const revisions = new WeakMap<StoreApi<SessionStore>, WorkspaceRevision>();

function useWorkspaceRevisionSource(): WorkspaceRevision {
	const runtime = useSessionRuntime();
	const store = (runtime?.stores.get("session") as StoreApi<SessionStore> | undefined) ?? useSessionStore;
	let revision = revisions.get(store);
	if (!revision) {
		let version = 0;
		const listeners = new Set<() => void>();
		const invalidate = () => {
			version++;
			for (const listener of listeners) listener();
		};
		// The tab owns this subscription; closing the tab releases its store and its cache revision together.
		store.subscribe((state, previous) => {
			if (
				state.cwd === previous.cwd &&
				state.sessionId === previous.sessionId &&
				!(previous.isStreaming && !state.isStreaming) &&
				!(previous.status === "ready" && state.status !== "ready")
			) {
				return;
			}
			invalidate();
		});
		revision = {
			getSnapshot: () => version,
			invalidate,
			subscribe: listener => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
		};
		revisions.set(store, revision);
	}
	return revision;
}

/** Notice runs that settle with the inspector closed, without polling or keeping panels mounted. */
export function useWorkspaceRevision(): number {
	const revision = useWorkspaceRevisionSource();
	return useSyncExternalStore(revision.subscribe, revision.getSnapshot);
}

export function useInvalidateWorkspace(): () => void {
	return useWorkspaceRevisionSource().invalidate;
}
