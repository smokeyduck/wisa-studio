import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BrowserPanel } from "./components/panels/BrowserPanel";
import { RootErrorBoundary } from "./components/common/RootErrorBoundary";
import { I18nProvider } from "./lib/i18n";
import { startKeyboardLayoutSync } from "./lib/keyboard-layout";
import { applyBrowserState } from "./stores/browser";
import { installGlobalRuntimeErrorHandlers, reportRuntimeError } from "./lib/runtime-errors";
import { startWindowChrome } from "./lib/window-chrome";
import "./styles/global.css";
import "./styles/theme-dark.css";
import "./styles/theme-light.css";
import "./styles/components.css";

installGlobalRuntimeErrorHandlers();
startWindowChrome();
startKeyboardLayoutSync();

/** Keeps the detached window's mirror of the tab's pages current. */
function DetachedBrowser({ tabId }: { tabId: string }): React.ReactElement {
	useEffect(() => window.omp.events.onBrowserState(state => applyBrowserState(state, { reveal: false })), []);
	return (
		<div className="h-screen w-screen overflow-hidden bg-[var(--omp-bg)]">
			<BrowserPanel tabId={tabId} />
		</div>
	);
}

/**
 * A detached browser window loads this same bundle with `?browser=<tabId>`:
 * it draws that tab's browser and nothing else, so it needs no session, no
 * sidecar and no tab store of its own.
 */
const detachedBrowserTab = new URLSearchParams(window.location.search).get("browser");

const container = document.getElementById("root");
if (!container) {
	const error = new Error("Root container #root not found");
	reportRuntimeError("react-uncaught", error, { url: window.location.href });
	throw error;
}

createRoot(container, {
	onCaughtError: (error, info) => {
		reportRuntimeError("react-render", error, { componentStack: info.componentStack });
	},
	onUncaughtError: (error, info) => {
		reportRuntimeError("react-uncaught", error, { componentStack: info.componentStack });
	},
	onRecoverableError: (error, info) => {
		reportRuntimeError("react-recoverable", error, { componentStack: info.componentStack });
	},
}).render(
	<RootErrorBoundary>
		<I18nProvider>
			{detachedBrowserTab ? (
				<DetachedBrowser tabId={detachedBrowserTab} />
			) : (
				<App />
			)}
		</I18nProvider>
	</RootErrorBoundary>,
);
