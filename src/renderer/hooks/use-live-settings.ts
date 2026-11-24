import { useCallback, useEffect, useRef, useState } from "react";
import { useTabRpc } from "../lib/tab-rpc";
import { useSessionStore } from "../stores/session";
import { useRuntimeTabId } from "../stores/session-runtime-context";
import { toast } from "../stores/toast";

export interface LiveSettingsHandle<T> {
	/** `null` until the first read lands (or while the sidecar is not ready). */
	config: T | null;
	/** True while a write is in flight. */
	saving: boolean;
	/** Apply a patch atomically to the current session. */
	write: (patch: Array<{ path: string; value: unknown }>) => Promise<boolean>;
}

/**
 * Live agent settings for the focused task, read from `paths` through `parse`
 * (both module constants). Re-read on sidecar ready, session change and every
 * `config_update` push, so an edit made in Settings, the TUI or another window
 * shows up here without a reload. A failed write toasts `saveFailedTitle`.
 */
export function useLiveSettings<T>(
	paths: string[],
	parse: (values: Record<string, unknown> | undefined) => T,
	saveFailedTitle: string,
): LiveSettingsHandle<T> {
	const rpc = useTabRpc();
	const ready = useSessionStore(state => state.status) === "ready";
	const sessionId = useSessionStore(state => state.sessionId);
	const tabId = useRuntimeTabId();
	const [snapshot, setSnapshot] = useState<{ sessionId: string; config: T } | null>(null);
	const [saving, setSaving] = useState(false);
	const version = useRef(0);
	const refresh = useRef<(() => Promise<void>) | undefined>(undefined);

	const read = useCallback(async () => {
		if (!ready || !sessionId) return;
		const mine = ++version.current;
		try {
			const response = await rpc.getSettings(paths);
			// A newer read, or a write that landed meanwhile, supersedes this one.
			if (mine !== version.current || !response.success) return;
			const values = (response.data as { values?: Record<string, unknown> } | undefined)?.values;
			setSnapshot({ sessionId, config: parse(values) });
		} catch {
			// Unreadable settings leave the last known config in place.
		}
	}, [ready, rpc, sessionId, paths, parse]);

	useEffect(() => {
		refresh.current = read;
		void read();
		const events = window.omp.events;
		const unsubscribe =
			tabId && events.onTabConfigUpdate
				? events.onTabConfigUpdate((_, origin) => {
						if (origin === tabId) void read();
					})
				: events.onConfigUpdate(() => void read());
		return () => {
			++version.current;
			refresh.current = undefined;
			unsubscribe();
		};
	}, [read, tabId]);

	const write = useCallback(
		async (patch: Array<{ path: string; value: unknown }>) => {
			if (!ready || !sessionId) return false;
			setSaving(true);
			try {
				const response = await rpc.command({
					type: "set_session_compaction",
					sessionId,
					values: Object.fromEntries(patch.map(({ path, value }) => [path, value])),
				});
				if (!response.success) throw new Error(response.error);
				return true;
			} catch (cause) {
				toast({ variant: "error", title: saveFailedTitle, message: String(cause) });
				return false;
			} finally {
				setSaving(false);
				await refresh.current?.();
			}
		},
		[ready, rpc, sessionId, saveFailedTitle],
	);

	return { config: ready && snapshot && snapshot.sessionId === sessionId ? snapshot.config : null, saving, write };
}
