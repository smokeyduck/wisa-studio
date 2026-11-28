import { contextBridge, ipcRenderer } from "electron";

// Keep this sandbox preload self-contained: shared imports can emit an unsupported require(chunk).
const NOTCH_APP_BRIDGE = "notch-apps:capability"; // Must match shared/notch-apps.ts.

// Only the trusted top-level chrome gets this API. The opaque sandbox child has no preload.
if (process.isMainFrame) {
	const started = Promise.withResolvers<void>();
	ipcRenderer.once(`${NOTCH_APP_BRIDGE}:ready`, () => started.resolve());
	contextBridge.exposeInMainWorld("notchHost", {
		ready: () => started.promise,
		request: (name: string, args: Record<string, unknown> = {}) => ipcRenderer.invoke(NOTCH_APP_BRIDGE, name, args),
	});
}
