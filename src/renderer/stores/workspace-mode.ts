/**
 * The GUI-owned "Work" workspace, shared by every surface that has to tell a
 * work session from a project one: the sidebar lane, the empty canvas, and the
 * composer placeholder. Main owns the path (it creates `~/.omp/work` on
 * demand), so the renderer reads it once per window instead of keeping a
 * second copy of the rule.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { useTabsStore } from "./tabs";

interface WorkspaceModeStore {
	defaultWorkspace: string | null;
	/** Read the path from main once; later calls are no-ops. */
	load: () => Promise<void>;
}

export const useWorkspaceMode = create<WorkspaceModeStore>((set, get) => ({
	defaultWorkspace: null,
	load: async () => {
		if (get().defaultWorkspace) return;
		try {
			const path = await window.omp.sidecar.defaultWorkspace();
			set({ defaultWorkspace: path || null });
		} catch {
			// The lane falls back to Code; the next mount retries.
		}
	},
}));

/**
 * Whether `cwd` is the Work workspace. `false` while the path is still
 * unknown: every caller treats Code as the safe default, so an unresolved
 * read can never label a project session as work.
 */
export function isWorkCwd(cwd: string | null | undefined, defaultWorkspace: string | null): boolean {
	if (!cwd || !defaultWorkspace) return false;
	if (cwd === defaultWorkspace) return true;
	// Match Windows path spelling differences that main's node:path.relative ignores.
	if (!/^(?:[a-z]:[/\\]|[/\\]{2}[^/\\])/i.test(defaultWorkspace)) return false;
	const windowsKey = (value: string) => value.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
	return windowsKey(cwd) === windowsKey(defaultWorkspace);
}

/** Subscribe to the Work workspace path, loading it on first use. */
export function useDefaultWorkspace(): string | null {
	const path = useWorkspaceMode(state => state.defaultWorkspace);
	useEffect(() => {
		void useWorkspaceMode.getState().load();
	}, []);
	return path;
}

/**
 * Whether the tab on screen is a Work session. Read from the tab's own folder
 * rather than the sidebar lane: the lane is a filter the user can flip by hand,
 * while the tab is what is actually on screen — and a split pane can show a
 * work session beside a project one.
 */
export function useTabIsWork(tabId: string | null): boolean {
	const defaultWorkspace = useDefaultWorkspace();
	const cwd = useTabsStore(state => state.tabs.find(tab => tab.id === tabId)?.cwd ?? null);
	const kind = useTabsStore(state => state.tabs.find(tab => tab.id === tabId)?.kind ?? "agent");
	return kind !== "chat" && isWorkCwd(cwd, defaultWorkspace);
}
