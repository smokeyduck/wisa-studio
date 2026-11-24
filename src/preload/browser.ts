import { ipcRenderer } from "electron";

window.addEventListener("DOMContentLoaded", () => {
	const address = document.querySelector<HTMLInputElement>("#address");
	const status = document.querySelector("#status");
	const back = document.querySelector<HTMLButtonElement>("#back");
	const forward = document.querySelector<HTMLButtonElement>("#forward");
	if (!address || !status || !back || !forward) return;
	const focusAddress = () => {
		address.focus();
		address.select();
	};
	ipcRenderer.on("browser:address", focusAddress);
	ipcRenderer.on(
		"browser:state",
		(_event, state: { url: string; status: string; back: boolean; forward: boolean }) => {
			if (document.activeElement !== address || !state.status) address.value = state.url;
			status.textContent = state.status;
			back.disabled = !state.back;
			forward.disabled = !state.forward;
		},
	);
	document.querySelector("form")?.addEventListener("submit", event => {
		event.preventDefault();
		ipcRenderer.send("browser:chrome", "navigate", address.value);
	});
	for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
		button.addEventListener("click", () => ipcRenderer.send("browser:chrome", button.dataset.action));
	}
	focusAddress();
});
