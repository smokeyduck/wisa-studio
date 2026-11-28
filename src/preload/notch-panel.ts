import { contextBridge, ipcRenderer } from "electron";
import { NOTCH_PANEL_CHANNELS, type NotchPanelApi, type NotchPanelState } from "../shared/notch-panel";

const api: NotchPanelApi = {
	get() {
		const { promise, resolve } = Promise.withResolvers<NotchPanelState>();
		ipcRenderer.once(NOTCH_PANEL_CHANNELS.state, (_event, state: NotchPanelState) => resolve(state));
		ipcRenderer.send(NOTCH_PANEL_CHANNELS.get);
		return promise;
	},
	events(callback) {
		const listener = (_event: Electron.IpcRendererEvent, state: NotchPanelState): void => callback(state);
		ipcRenderer.on(NOTCH_PANEL_CHANNELS.state, listener);
		return () => ipcRenderer.removeListener(NOTCH_PANEL_CHANNELS.state, listener);
	},
	action(value) {
		ipcRenderer.send(NOTCH_PANEL_CHANNELS.action, value);
	},
};
contextBridge.exposeInMainWorld("notchPanel", api);
