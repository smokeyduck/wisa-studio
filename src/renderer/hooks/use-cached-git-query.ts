import { useCallback, useEffect, useSyncExternalStore } from "react";
import { describeError } from "../lib/errors";
import { useT } from "../lib/i18n";
import { useTabRpc } from "../lib/tab-rpc";
import { useSessionStore } from "../stores/session";
import { useSessionRuntime } from "../stores/session-runtime-context";
import { useWorkspaceRevision } from "./use-workspace-revision";

interface GitSnapshot<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
}

export interface GitQueryCache<T> {
	cwd: string;
	revision: number;
	request: number;
	snapshot: GitSnapshot<T>;
	getSnapshot: () => GitSnapshot<T>;
	listeners: Set<() => void>;
	subscribe: (listener: () => void) => () => void;
}

/** Share successful reads between views, with a separate slot per kind of Git query. */
export function useCachedGitQuery<T>(
	cache: WeakMap<object, GitQueryCache<T>>,
	command: "getGitChanges" | "getGitStatus",
): GitSnapshot<T> & { refresh: () => void } {
	const t = useT();
	const rpc = useTabRpc();
	const owner = useSessionRuntime() ?? rpc;
	const cwd = useSessionStore(state => state.cwd);
	const ready = useSessionStore(state => state.status === "ready" && !state.switchPending);
	const streaming = useSessionStore(state => state.isStreaming);
	const revision = useWorkspaceRevision();
	let entry = cache.get(owner);
	if (!entry || entry.cwd !== cwd) {
		const created: GitQueryCache<T> = {
			cwd,
			revision: -1,
			request: 0,
			snapshot: { data: null, loading: false, error: null },
			listeners: new Set(),
			getSnapshot: () => created.snapshot,
			subscribe: listener => {
				created.listeners.add(listener);
				return () => {
					created.listeners.delete(listener);
				};
			},
		};
		cache.set(owner, created);
		entry = created;
	}
	const slot = entry;
	const snapshot = useSyncExternalStore(slot.subscribe, slot.getSnapshot);
	const refresh = useCallback((force = false) => {
		if (!ready || streaming || cache.get(owner) !== slot) return;
		if (slot.revision === revision && (!force || slot.snapshot.loading)) return;
		slot.revision = revision;
		const request = ++slot.request;
		const publish = (next: GitSnapshot<T>) => {
			if (slot.request !== request || cache.get(owner) !== slot) return;
			slot.snapshot = next;
			for (const listener of slot.listeners) listener();
		};
		publish({ ...slot.snapshot, loading: true, error: null });
		void Promise.resolve()
			.then(() => rpc[command]())
			.then(response => {
				if (!response.success) throw new Error(response.error ?? t("rpc.failed"));
				publish({ data: response.data as T, loading: false, error: null });
			})
			.catch(error => publish({ ...slot.snapshot, loading: false, error: describeError(error) }));
	}, [cache, command, owner, ready, revision, rpc, slot, streaming, t]);

	useEffect(() => {
		refresh();
		const onFocus = () => refresh(true);
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, [refresh]);

	return { ...snapshot, refresh: () => refresh(true) };
}
