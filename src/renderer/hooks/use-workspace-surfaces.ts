import { useEffect } from "react";
import { useTabsStore } from "../stores/tabs";
import {
	applyTerminalTheme,
	forgetTabTerminals,
	handleTerminalFrame,
	setActiveTerminal,
	useTerminalsStore,
} from "../stores/terminals";
import { useUiStore } from "../stores/ui";

/**
 * Feeds the Terminal drawer for every tab. The active tab can reveal a terminal
 * that needs the user, such as a `pty: true` command waiting for input.
 */
export function useWorkspaceSurfaces(): void {
	useEffect(() => {
		const events = window.omp?.events;
		if (typeof events?.onTerminalFrame !== "function") return;
		return events.onTerminalFrame(({ tabId, frame }) => handleTerminalFrame(tabId, frame));
	}, []);

	// Reveals only follow the tab the user is looking at.
	useEffect(() => {
		return useTerminalsStore.subscribe((state, previous) => {
			const reveal = state.reveal;
			if (!reveal || reveal === previous.reveal || reveal.tabId !== useTabsStore.getState().activeTabId) return;
			setActiveTerminal(reveal.tabId, reveal.terminalId);
			useUiStore.getState().setPanelTab("terminal");
		});
	}, []);

	// A closed tab took its sidecar and terminals with it.
	useEffect(
		() =>
			useTabsStore.subscribe((state, previous) => {
				if (state.tabs === previous.tabs) return;
				const open = new Set(state.tabs.map(tab => tab.id));
				for (const tab of previous.tabs) {
					if (open.has(tab.id)) continue;
					forgetTabTerminals(tab.id);
				}
			}),
		[],
	);

	// Terminals draw with resolved colors, so a theme switch re-themes them.
	useEffect(() => {
		const observer = new MutationObserver(() => applyTerminalTheme());
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
		return () => observer.disconnect();
	}, []);
}
