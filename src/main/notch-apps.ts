import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import {
	BrowserWindow,
	clipboard,
	dialog,
	type IpcMainInvokeEvent,
	ipcMain,
	Notification,
	screen,
	session,
	shell,
} from "electron";
import { NOTCH_APP_BRIDGE, NOTCH_APP_SDK, type NotchAppsSnapshot, type NotchAppTarget } from "../shared/notch-apps";
import { mainT } from "./i18n";
import { notchAppDocument } from "./notch-app-document";
import { appId, boundedText, NotchAppStore, type NotchRevision } from "./notch-app-store";

const runFile = promisify(execFile);
interface RunningApp {
	window: BrowserWindow;
	target: NotchAppTarget;
	url: string;
	pending: boolean;
	requests: number;
	requestEpoch: number;
	abort: AbortController;
}
interface NotchAppsOptions {
	directory: string;
	onActiveChange?: (active: boolean) => void;
	onChanged?: (snapshot: NotchAppsSnapshot) => void;
	sessions?: () => unknown[];
}

/** Only this host owns windows, persistent source, approvals and the privileged IPC boundary. */
export class NotchApps {
	#storage: NotchAppStore | null = null;
	#failure: string | null = null;
	#options: NotchAppsOptions;
	#running: RunningApp | null = null;
	#preview: NotchAppTarget | null = null;
	#queue: Promise<unknown> = Promise.resolve();
	#disposed = false;
	#epoch = new AbortController();
	#activeListener?: (active: boolean) => void;
	#bridge: (event: IpcMainInvokeEvent, name: unknown, args: unknown) => Promise<unknown>;
	#layout: () => void;

	constructor(options: NotchAppsOptions) {
		this.#options = options;
		this.#activeListener = options.onActiveChange;
		try {
			this.#storage = new NotchAppStore(options.directory);
		} catch (error) {
			this.#failure = mainT("notchApp.storeError", undefined, {
				detail: error instanceof Error ? error.message : String(error),
			});
		}
		this.#bridge = (event, name, args) => this.#capability(event, name, args);
		ipcMain.handle(NOTCH_APP_BRIDGE, this.#bridge);
		this.#layout = () => {
			const running = this.#running;
			if (!running || running.window.isDestroyed()) return;
			const display = screen.getPrimaryDisplay();
			const bounds = running.window.getBounds();
			running.window.setPosition(
				Math.round(display.bounds.x + (display.bounds.width - bounds.width) / 2),
				display.bounds.y,
			);
		};
		screen.on("display-metrics-changed", this.#layout);
		screen.on("display-removed", this.#layout);
		const active = this.#storage?.data.active;
		this.#activeListener?.(Boolean(active));
		if (active) {
			this.#queue = this.#show(active, false, this.#epoch.signal).catch((error: unknown) => {
				console.error("[notch-apps] restore failed", error);
				// Keep the source and persisted target available for explicit retry, but reveal the native notch.
				this.#closeWindow();
				this.#publish();
			});
		}
	}

	setActiveListener(listener: (active: boolean) => void): void {
		this.#activeListener = listener;
		listener(Boolean(this.#running));
	}
	get #store(): NotchAppStore {
		if (!this.#storage) throw new Error(this.#failure ?? "Mini-app storage is unavailable");
		return this.#storage;
	}

	snapshot(): NotchAppsSnapshot {
		if (!this.#storage) return { apps: [], active: null, preview: null, error: this.#failure ?? undefined };
		return {
			apps: this.#store.data.apps.map(app => ({
				id: app.id,
				name: app.revisions.find(revision => revision.id === app.currentRevision)?.name ?? app.id,
				currentRevision: app.currentRevision,
				revisions: app.revisions.map(({ id, createdAt }) => ({ id, createdAt })),
			})),
			active: this.#store.data.active ? { ...this.#store.data.active } : null,
			preview: this.#preview ? { ...this.#preview } : null,
		};
	}

	execute(args: Record<string, unknown>, owner?: BrowserWindow, signal?: AbortSignal): Promise<unknown> {
		if (args.action === "stop") {
			if (this.#disposed) return Promise.reject(new Error("Mini-app host is closed"));
			signal?.throwIfAborted();
			this.#epoch.abort();
			this.#epoch = new AbortController();
			return this.#execute(args, owner, this.#epoch.signal);
		}
		const authorization = signal ? AbortSignal.any([signal, this.#epoch.signal]) : this.#epoch.signal;
		const result = this.#queue.then(() => {
			if (this.#disposed) throw new Error("Mini-app host is closed");
			authorization.throwIfAborted();
			return this.#execute(args, owner, authorization);
		});
		this.#queue = result.catch(() => {});
		return result;
	}

	async #execute(
		args: Record<string, unknown>,
		owner: BrowserWindow | undefined,
		signal: AbortSignal,
	): Promise<unknown> {
		signal.throwIfAborted();
		if (!this.#storage) {
			if (args.action === "stop") {
				this.#preview = null;
				this.#closeWindow();
				this.#publish();
			} else if (args.action !== "list") throw new Error(this.#failure ?? "Mini-app storage is unavailable");
			return this.snapshot();
		}
		switch (args.action) {
			case "list":
				return this.snapshot();
			case "read": {
				const { app, revision } = this.#store.resolve(args);
				return {
					id: app.id,
					name: revision.name,
					revisionId: revision.id,
					createdAt: revision.createdAt,
					html: revision.html,
					width: revision.width,
					height: revision.height,
					sdk: NOTCH_APP_SDK,
				};
			}
			case "save":
				this.#store.save(args);
				break;
			case "preview": {
				const { target } = this.#store.resolve(args);
				await this.#show(target, true, signal);
				this.#preview = target;
				break;
			}
			case "apply":
			case "rollback": {
				const { app, revision, target } = this.#store.resolve(args);
				if (args.action === "rollback" && args.revisionId === undefined)
					throw new Error("rollback requires an explicit revisionId");
				const approval = {
					type: "question" as const,
					title: mainT("notchApp.confirmTitle"),
					message: mainT("notchApp.applyMessage", undefined, { name: revision.name }),
					detail: mainT("notchApp.applyDetail", undefined, { id: app.id, revision: revision.id }),
					buttons: [mainT("notchApp.cancel"), mainT("notchApp.apply")],
					defaultId: 0,
					cancelId: 0,
					noLink: true,
				};
				const result =
					owner && !owner.isDestroyed()
						? await dialog.showMessageBox(owner, approval)
						: await dialog.showMessageBox(approval);
				signal.throwIfAborted();
				if (result.response !== 1) throw new Error("Mini-app activation denied");
				if (this.#disposed) throw new Error("Mini-app host is closed");
				await this.#show(target, false, signal);
				try {
					this.#store.commit({
						...this.#store.data,
						active: target,
						apps: this.#store.data.apps.map(entry =>
							entry.id === app.id ? { ...entry, currentRevision: revision.id } : entry,
						),
					});
				} catch (error) {
					await this.#restore();
					throw error;
				}
				this.#preview = null;
				break;
			}
			case "stop": {
				this.#preview = null;
				this.#closeWindow();
				try {
					this.#store.commit({ ...this.#store.data, active: null });
				} finally {
					this.#publish();
				}
				break;
			}
			case "delete": {
				const id = appId(args.id);
				if (!this.#store.data.apps.some(entry => entry.id === id)) throw new Error("Unknown app");
				const active = this.#store.data.active?.appId === id ? null : this.#store.data.active;
				this.#store.commit({
					...this.#store.data,
					active,
					apps: this.#store.data.apps.filter(entry => entry.id !== id),
				});
				if (this.#running?.target.appId === id) await this.#restore(signal);
				break;
			}
			default:
				throw new Error("Unknown mini-app action");
		}
		this.#publish();
		return this.snapshot();
	}

	async #restore(signal: AbortSignal = this.#epoch.signal): Promise<void> {
		this.#preview = null;
		if (this.#store.data.active) await this.#show(this.#store.data.active, false, signal);
		else this.#closeWindow();
	}

	#publish(): void {
		if (this.#disposed) return;
		this.#activeListener?.(Boolean(this.#running));
		this.#options.onChanged?.(this.snapshot());
	}

	#closeWindow(): void {
		const previous = this.#running;
		this.#running = null;
		if (previous) {
			previous.abort.abort();
			if (!previous.window.isDestroyed()) previous.window.destroy();
		}
	}

	async #show(target: NotchAppTarget, preview: boolean, signal: AbortSignal): Promise<void> {
		signal.throwIfAborted();
		const { revision } = this.#store.resolve({ id: target.appId, revisionId: target.revisionId });
		const partition = session.fromPartition(`notch-mini-app-${randomUUID()}`, { cache: false });
		partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
		partition.setPermissionCheckHandler(() => false);
		partition.webRequest.onBeforeRequest((details, callback) => {
			callback({
				cancel: !details.url.startsWith("data:") && details.url !== "about:blank" && details.url !== "about:srcdoc",
			});
		});
		partition.on("will-download", event => event.preventDefault());
		const display = screen.getPrimaryDisplay();
		const width = Math.min(revision.width, display.bounds.width);
		const height = Math.min(revision.height + 36, display.workArea.height);
		const window = new BrowserWindow({
			width,
			height,
			x: Math.round(display.bounds.x + (display.bounds.width - width) / 2),
			y: display.bounds.y,
			show: false,
			frame: false,
			transparent: true,
			alwaysOnTop: true,
			resizable: false,
			maximizable: false,
			minimizable: false,
			fullscreenable: false,
			skipTaskbar: true,
			title: `WISA STUDIO — ${revision.name}`,
			webPreferences: {
				preload: join(__dirname, "../preload/notch-app.cjs"),
				session: partition,
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
				nodeIntegrationInSubFrames: false,
				webSecurity: true,
				allowRunningInsecureContent: false,
				webviewTag: false,
				devTools: false,
				navigateOnDragDrop: false,
				safeDialogs: true,
				additionalArguments: [],
			},
		});
		window.setAlwaysOnTop(true, "screen-saver");
		if (process.platform === "darwin") window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		window.webContents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
		window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		window.webContents.on("will-navigate", event => event.preventDefault());
		window.webContents.on("will-frame-navigate", event => {
			if (event.url !== "about:srcdoc") event.preventDefault();
		});
		window.webContents.on("will-attach-webview", event => event.preventDefault());
		const document = notchAppDocument({
			html: revision.html,
			title: `WISA STUDIO · ${preview ? `${mainT("notchApp.preview")} · ` : ""}${revision.name}`,
			close: mainT(preview ? "notchApp.revert" : "notchApp.stop"),
			preview,
		});
		const url = `data:text/html;charset=utf-8,${encodeURIComponent(document)}`;
		const running: RunningApp = {
			window,
			target,
			url,
			pending: false,
			requests: 0,
			requestEpoch: Date.now(),
			abort: new AbortController(),
		};
		// The child starts only after trusted host load and exact-sender bridge registration.
		const cancelLoad = () => {
			if (!window.isDestroyed()) window.destroy();
		};
		const timeout = setTimeout(cancelLoad, 10_000);
		signal.addEventListener("abort", cancelLoad, { once: true });
		try {
			await window.loadURL(url);
			if (!(await window.webContents.executeJavaScript("typeof window.notchHost?.request === 'function'")))
				throw new Error("Mini-app preload failed to load");
			signal.throwIfAborted();
			if (this.#disposed) throw new Error("Mini-app host is closed");
		} catch (error) {
			if (!window.isDestroyed()) window.destroy();
			throw error;
		} finally {
			clearTimeout(timeout);
			signal.removeEventListener("abort", cancelLoad);
		}
		this.#closeWindow();
		this.#running = running;
		window.on("closed", () => {
			running.abort.abort();
			if (this.#running !== running) return;
			this.#running = null;
			this.#preview = null;
			this.#publish();
		});
		window.webContents.on("render-process-gone", () => {
			if (this.#running !== running) return;
			this.#closeWindow();
			this.#preview = null;
			this.#publish();
		});
		window.webContents.send(`${NOTCH_APP_BRIDGE}:ready`);
		window.showInactive();
		this.#activeListener?.(true);
	}

	async #capability(event: IpcMainInvokeEvent, name: unknown, value: unknown): Promise<unknown> {
		const running = this.#running;
		if (
			!running ||
			event.sender !== running.window.webContents ||
			event.senderFrame !== event.sender.mainFrame ||
			event.senderFrame.url !== running.url
		)
			throw new Error("Untrusted mini-app sender");
		if (typeof name !== "string" || !value || typeof value !== "object" || Array.isArray(value))
			throw new Error("Invalid capability request");
		const args = value as Record<string, unknown>;
		if (Buffer.byteLength(JSON.stringify(args)) > 128 * 1024) throw new Error("Request too large");
		if (Date.now() - running.requestEpoch > 1000) {
			running.requestEpoch = Date.now();
			running.requests = 0;
		}
		if (++running.requests > 100) throw new Error("Too many capability requests");
		if (name === "host.stop") return this.execute({ action: "stop" });
		if (name === "host.revert") {
			const operation = this.#queue.then(async () => {
				if (!this.#disposed) {
					await this.#restore();
					this.#publish();
				}
			});
			this.#queue = operation.catch(() => {});
			return operation;
		}
		const { app, revision } = this.#store.resolve({
			id: running.target.appId,
			revisionId: running.target.revisionId,
		});
		if (name === "storage.get") return app.state;
		if (name === "storage.set") {
			this.#store.validateState(args.value);
			this.#store.commit({
				...this.#store.data,
				apps: this.#store.data.apps.map(entry => (entry.id === app.id ? { ...entry, state: args.value } : entry)),
			});
			this.#publish();
			return null;
		}
		const request = this.#validatedCapability(name, args);
		if (running.pending) throw new Error("A permission request is already pending");
		running.pending = true;
		try {
			await this.#approve(running, revision, name, request);
			if (this.#running !== running || this.#disposed) throw new Error("Mini-app was closed");
			switch (name) {
				case "clipboard.read":
					return clipboard.readText();
				case "clipboard.write":
					clipboard.writeText(request.text as string);
					return null;
				case "notification": {
					if (!Notification.isSupported()) throw new Error("Notifications are not supported");
					new Notification({
						title: `WISA STUDIO · ${revision.name} · ${request.title}`,
						body: request.body as string,
					}).show();
					return null;
				}
				case "openUrl":
					await shell.openExternal(request.url as string);
					return null;
				case "sessions":
					return this.#options.sessions?.() ?? [];
				case "command":
					return await runFile(request.executable as string, request.args as string[], {
						cwd: this.#options.directory,
						env: process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {},
						shell: false,
						timeout: 10_000,
						maxBuffer: 1024 * 1024,
						encoding: "utf8",
						windowsHide: true,
						signal: running.abort.signal,
					});
				default:
					throw new Error("Unknown capability");
			}
		} finally {
			running.pending = false;
		}
	}

	#validatedCapability(name: string, args: Record<string, unknown>): Record<string, unknown> {
		switch (name) {
			case "clipboard.read":
			case "sessions":
				return {};
			case "clipboard.write": {
				if (typeof args.text !== "string" || args.text.length > 64 * 1024)
					throw new Error("Invalid clipboard text");
				return { text: args.text };
			}
			case "notification":
				return {
					title: boundedText(args.title, "notification title", 160),
					body: boundedText(args.body, "notification body", 2000),
				};
			case "openUrl": {
				const url = new URL(boundedText(args.url, "URL", 4096));
				if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
					throw new Error("Only HTTP(S) URLs without credentials are allowed");
				return { url: url.href };
			}
			case "command": {
				const executable = boundedText(args.executable, "absolute executable path", 4096);
				if (!isAbsolute(executable) || executable.includes("\0"))
					throw new Error("Executable must be an absolute path");
				if (
					!Array.isArray(args.args) ||
					args.args.length > 64 ||
					args.args.some(arg => typeof arg !== "string" || arg.length > 4096 || arg.includes("\0"))
				)
					throw new Error("Invalid command arguments");
				const environment = process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {};
				return {
					executable,
					args: args.args,
					cwd: this.#options.directory,
					env: environment,
					shell: false,
					timeoutMs: 10_000,
				};
			}
			default:
				throw new Error("Unknown capability");
		}
	}

	async #approve(
		running: RunningApp,
		revision: NotchRevision,
		name: string,
		request: Record<string, unknown>,
	): Promise<void> {
		const result = await dialog.showMessageBox(running.window, {
			type: "warning",
			title: mainT("notchApp.confirmTitle"),
			message: mainT("notchApp.capabilityMessage", undefined, { name: revision.name, capability: name }),
			detail: mainT("notchApp.capabilityDetail", undefined, {
				id: running.target.appId,
				revision: revision.id,
				request: JSON.stringify(request, null, 2),
			}),
			buttons: [mainT("notchApp.cancel"), mainT("notchApp.allow")],
			defaultId: 0,
			cancelId: 0,
			noLink: true,
		});
		if (result.response !== 1) throw new Error("Capability denied");
	}

	dispose(): void {
		this.#epoch.abort();
		if (this.#disposed) return;
		this.#disposed = true;
		this.#closeWindow();
		this.#activeListener?.(false);
		ipcMain.removeHandler(NOTCH_APP_BRIDGE);
		screen.removeListener("display-metrics-changed", this.#layout);
		screen.removeListener("display-removed", this.#layout);
	}
}
