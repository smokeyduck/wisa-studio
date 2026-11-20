/**
 * Links the user clicks in a conversation (replies, tool output) open in the
 * app's own browser window, beside the work. ⌘/Ctrl-click, chat tabs (which
 * have no browser), and anything that is not a web page go to the system
 * browser.
 *
 * Settings → Appearance & Display picks which of the two a plain left-click
 * gets (#65); the modifier always picks the other one.
 */
import { useTabsStore } from "../stores/tabs";
import { type LinkOpenMode, useUiStore } from "../stores/ui";
import { showBrowserWindow } from "./browser-window";

/**
 * Where a link should open. `panel` is the app's browser window — the
 * identifier predates the move out of the side drawer, and `LinkMenu`/`Links`
 * compare against it, so it is not renamed.
 */
export type LinkDestination = "panel" | "external";

export function linkDestination(
	href: string,
	options: { modifier: boolean; panel: boolean; defaultMode?: LinkOpenMode },
): LinkDestination {
	if (!options.panel || !/^https?:\/\//i.test(href)) return "external";
	const defaultMode = options.defaultMode ?? "panel";
	if (defaultMode === "external") return options.modifier ? "panel" : "external";
	return options.modifier ? "external" : "panel";
}

/** Whether the active tab can show a browser at all; chat tabs show only files. */
export function browserPanelAvailable(): boolean {
	const { tabs, activeTabId } = useTabsStore.getState();
	const tab = tabs.find(entry => entry.id === activeTabId);
	return tab !== undefined && tab.kind !== "chat";
}

export function openLink(
	href: string,
	event?: { metaKey: boolean; ctrlKey: boolean },
	options?: { destination?: LinkDestination },
): void {
	const { tabs, activeTabId } = useTabsStore.getState();
	const tab = tabs.find(entry => entry.id === activeTabId);
	const panel = browserPanelAvailable();
	// An explicit destination comes from a menu item the user picked, so it
	// ignores both the modifier and the saved default.
	const destination =
		options?.destination !== undefined
			? options.destination === "panel" && panel && /^https?:\/\//i.test(href)
				? "panel"
				: "external"
			: linkDestination(href, {
					modifier: event?.metaKey === true || event?.ctrlKey === true,
					panel,
					defaultMode: useUiStore.getState().linkOpenMode,
				});
	if (destination === "external" || !tab) {
		void window.omp.system.openExternal(href);
		return;
	}
	showBrowserWindow(tab.id);
	window.omp.browser.open(tab.id, href).then(
		state => {
			if (!state) void window.omp.system.openExternal(href);
		},
		() => void window.omp.system.openExternal(href),
	);
}
