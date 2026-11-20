/**
 * The built-in browser lives in a window of its own, not in the inspector:
 * opening a page, or the agent opening one, brings that window forward.
 */
export function showBrowserWindow(tabId: string): void {
	void window.omp.browser.detach(tabId).catch(() => {});
}
