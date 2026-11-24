import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserWindow, session, WebContentsView } from "electron";
import Store from "electron-store";
import type { BrowserWorkspaceAction, BrowserWorkspaceState } from "../shared/browser-workspace";
import { IPC_EVENTS } from "../shared/ipc-types";
import { getMainLanguage } from "./i18n";
import type { RpcClient } from "./rpc-client";

const BLANK = "about:blank";
const CHROME_HEIGHT = 88;
const TAB_LIMIT = 24;

function webUrl(address: string): string | null {
	try {
		const url = new URL(address);
		return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
			? url.href
			: null;
	} catch {
		return null;
	}
}

function restoredAddress(address: string): string {
	const href = webUrl(address);
	if (!href) return BLANK;
	const { origin, pathname } = new URL(href);
	// Avoid persisting OAuth codes, auth fragments and sensitive query parameters.
	return `${origin}${pathname}`;
}

interface Page {
	restoreUrl: string;
	id: number;
	view: WebContentsView;
	driven: boolean;
}

// The existing Core relay owns browser discovery, CDP transport and agent tools.
// This adapter implements its extension leg against Electron's page views only.
type RelayCall = { t: "rpc"; id: number } & (
	| { op: "createTab"; url: string; active?: boolean }
	| { op: "attach" | "detach" | "removeTab" | "activateTab"; tabId: number }
	| { op: "send"; tabId: number; sessionId?: string; method: string; params?: Record<string, unknown> }
	| { op: "group" | "ungroup"; tabIds: number[] }
);

interface BrowserConnection {
	client: RpcClient;
	socket?: WebSocket;
}

export class BrowserWorkspace {
	#store = new Store<{ tabs: { urls: string[]; active: number } }>({ name: "browser-workspace" });
	#win: BrowserWindow | null = null;
	#pages = new Map<number, Page>();
	#active = 0;
	#next = 0;
	#connection: BrowserConnection | null = null;
	#opening: Promise<void> | undefined;

	show(target: () => RpcClient | null): Promise<void> {
		this.#opening ??= this.#show(target).finally(() => {
			this.#opening = undefined;
		});
		return this.#opening;
	}

	async #show(target: () => RpcClient | null): Promise<void> {
		const deadline = Date.now() + 15_000;
		let client = target();
		while (!client && Date.now() < deadline) {
			await delay(250);
			client = target();
		}
		if (!client) throw new Error("Agent tab is not ready");
		const win = this.#win ?? (await this.#createWindow());
		try {
			if (target() !== client) throw new Error("Agent changed while opening the browser");
			if (this.#connection?.client !== client) {
				win.hide();
				this.#detach();
				await this.#connect(client);
			}
			if (this.#win !== win || this.#connection?.socket?.readyState !== WebSocket.OPEN) {
				throw new Error("Browser relay is not ready");
			}
			win.show();
			win.focus();
		} catch (error) {
			if (!win.isDestroyed()) win.destroy();
			throw error;
		}
	}

	async #createWindow(): Promise<BrowserWindow> {
		const win = new BrowserWindow({
			width: 1120,
			height: 800,
			minWidth: 460,
			minHeight: 300,
			title: "WISA Browser",
			show: false,
			autoHideMenuBar: true,
			webPreferences: {
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
				preload: join(__dirname, "../preload/index.cjs"),
				additionalArguments: [`--wisa-initial-language=${getMainLanguage()}`],
			},
		});
		this.#win = win;
		win.removeMenu();
		win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		win.webContents.on("will-navigate", event => event.preventDefault());
		win.on("page-title-updated", event => event.preventDefault());
		win.on("resize", () => this.#layout());
		win.on("close", () => this.#save());
		win.on("closed", () => {
			this.#win = null;
			this.#detach();
			for (const page of this.#pages.values()) {
				if (!page.view.webContents.isDestroyed()) page.view.webContents.close();
			}
			this.#pages.clear();
		});
		const saved = this.#store.get("tabs", { urls: [], active: 0 });
		const restored = saved.urls.slice(0, TAB_LIMIT).map(url => this.#add(webUrl(url) ?? BLANK, false));
		this.#select((restored[saved.active] ?? restored[0] ?? this.#add(BLANK, false)).id);
		win.webContents.once("did-finish-load", () => this.#publish());
		const devUrl = process.env.ELECTRON_RENDERER_URL;
		const loaded = devUrl
			? win.loadURL(new URL("?browser-workspace=1", devUrl).href)
			: win.loadFile(join(__dirname, "../renderer/index.html"), { query: { "browser-workspace": "1" } });
		win.webContents.on("will-frame-navigate", event => event.preventDefault());
		try {
			await loaded;
			return win;
		} catch (error) {
			if (!win.isDestroyed()) win.destroy();
			throw error;
		}
	}

	owns(senderId: number): boolean {
		return this.#win?.webContents.id === senderId;
	}

	async action(action: BrowserWorkspaceAction): Promise<BrowserWorkspaceState> {
		const page = this.#pages.get(this.#active)?.view.webContents;
		const history = page?.navigationHistory;
		switch (action.type) {
			case "state":
				break;
			case "new":
				this.#add(BLANK, true);
				break;
			case "select":
				this.#select(action.id);
				break;
			case "close":
				this.#remove(action.id);
				break;
			case "back":
				if (history?.canGoBack()) history.goBack();
				break;
			case "forward":
				if (history?.canGoForward()) history.goForward();
				break;
			case "reload":
				if (page?.getURL() !== BLANK) page?.reload();
				break;
			case "navigate": {
				const address = action.address.trim();
				const url =
					webUrl(address) ?? (/^[\w.-]+(?::\d+)?(?:[/?#]|$)/.test(address) ? webUrl(`https://${address}`) : null);
				if (!page || !url) throw new Error("Invalid web address");
				await page.loadURL(url);
				break;
			}
			default:
				throw new Error("Unknown browser action");
		}
		return this.#state();
	}

	disconnect(client: RpcClient): void {
		if (this.#connection?.client === client) this.#win?.close();
	}

	#detach(): void {
		const connection = this.#connection;
		if (!connection) return;
		this.#connection = null;
		connection.socket?.close();
		connection.client.fire({ type: "browser_host_stop" });
		for (const page of this.#pages.values()) {
			page.driven = false;
			if (page.view.webContents.isDestroyed()) continue;
			const { debugger: debug } = page.view.webContents;
			if (debug.isAttached()) debug.detach();
		}
	}

	#add(url: string, select: boolean, deferNavigation = false): Page {
		const win = this.#win;
		if (!win || this.#pages.size >= TAB_LIMIT) throw new Error("Browser tab limit reached");
		const partition = session.fromPartition("persist:wisa-browser-workspace");
		partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
		partition.setPermissionCheckHandler(() => false);
		const view = new WebContentsView({
			webPreferences: {
				session: partition,
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
				navigateOnDragDrop: false,
			},
		});
		const page: Page = { id: ++this.#next, view, driven: false, restoreUrl: restoredAddress(url) };
		const wc = view.webContents;
		this.#pages.set(page.id, page);
		win.contentView.addChildView(view);
		view.setVisible(false);
		wc.on("will-frame-navigate", event => {
			if (event.isMainFrame && event.url !== BLANK && !webUrl(event.url)) event.preventDefault();
		});
		wc.on("will-redirect", event => {
			if (event.isMainFrame && !webUrl(event.url)) event.preventDefault();
		});
		wc.setWindowOpenHandler(({ url: popup }) => {
			if (this.#pages.size >= TAB_LIMIT || (popup !== BLANK && !webUrl(popup))) return { action: "deny" };
			return { action: "allow", createWindow: () => this.#add(BLANK, true, true).view.webContents };
		});
		const updated = () => {
			if (!this.#pages.has(page.id)) return;
			this.#send({ t: "tabUpdated", tab: this.#snapshot(page) });
			this.#publish();
		};
		const committed = () => {
			page.restoreUrl = restoredAddress(wc.getURL());
			updated();
			this.#save();
		};
		wc.on("did-navigate", committed);
		wc.on("did-navigate-in-page", (_event, _url, mainFrame) => {
			if (mainFrame) committed();
		});
		wc.on("page-title-updated", updated);
		wc.on("did-start-loading", updated);
		wc.on("did-stop-loading", updated);
		wc.on("destroyed", () => {
			if (this.#win && this.#pages.has(page.id)) this.#remove(page.id);
		});
		wc.debugger.on("message", (_event, method, params, sessionId) =>
			this.#send({ t: "cdpEvent", tabId: page.id, method, params, sessionId }),
		);
		wc.debugger.on("detach", (_event, reason) => this.#send({ t: "detached", tabId: page.id, reason }));
		this.#send({ t: "tabCreated", tab: this.#snapshot(page) });
		if (select) this.#select(page.id);
		else this.#publish();
		if (!deferNavigation) void wc.loadURL(url).catch(() => {});
		return page;
	}

	#layout(): void {
		if (!this.#win) return;
		const [width, height] = this.#win.getContentSize();
		for (const page of this.#pages.values()) {
			const active = page.id === this.#active;
			if (active)
				page.view.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: Math.max(0, height - CHROME_HEIGHT) });
			page.view.setVisible(active);
		}
	}

	#select(id: number): void {
		const current = this.#pages.get(id);
		if (!current) return;
		const previous = this.#pages.get(this.#active);
		this.#active = id;
		this.#layout();
		if (previous && previous !== current) this.#send({ t: "tabUpdated", tab: this.#snapshot(previous) });
		this.#send({ t: "tabUpdated", tab: this.#snapshot(current) });
		this.#publish();
		this.#save();
	}

	#remove(id: number): void {
		const page = this.#pages.get(id);
		if (!page) return;
		this.#pages.delete(id);
		this.#win?.contentView.removeChildView(page.view);
		if (!page.view.webContents.isDestroyed()) page.view.webContents.close();
		this.#send({ t: "tabRemoved", tabId: id });
		if (this.#active === id) this.#select((this.#pages.values().next().value ?? this.#add(BLANK, false)).id);
		this.#publish();
		this.#save();
	}

	#state(): BrowserWorkspaceState {
		const page = this.#pages.get(this.#active)?.view.webContents;
		return {
			pages: [...this.#pages.values()].map(({ id, view, driven }) => ({
				id,
				url: view.webContents.getURL(),
				title: view.webContents.getTitle(),
				driven,
			})),
			activeId: this.#active,
			back: page?.navigationHistory.canGoBack() ?? false,
			forward: page?.navigationHistory.canGoForward() ?? false,
			loading: page?.isLoading() ?? false,
		};
	}

	#publish(): void {
		this.#win?.webContents.send(IPC_EVENTS.BROWSER_STATE, this.#state());
	}

	#save(): void {
		if (!this.#win) return;
		const pages = [...this.#pages.values()];
		this.#store.set("tabs", {
			urls: pages.map(page => page.restoreUrl),
			active: pages.findIndex(page => page.id === this.#active),
		});
	}

	#snapshot(page: Page) {
		const wc = page.view.webContents;
		return {
			tabId: page.id,
			url: wc.getURL() || BLANK,
			title: wc.getTitle(),
			active: this.#active === page.id,
			discarded: false,
			windowId: 1,
			pinned: false,
			groupId: page.driven ? 1 : -1,
		};
	}

	#send(message: object): void {
		const socket = this.#connection?.socket;
		if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
	}

	async #connect(client: RpcClient): Promise<void> {
		const connection: BrowserConnection = { client };
		this.#connection = connection;
		try {
			const response = await client.command({ type: "browser_host_start" });
			if (this.#connection !== connection) return;
			const endpoint = response.success
				? (response.data as { extensionUrl?: string } | undefined)?.extensionUrl
				: undefined;
			if (!endpoint) throw new Error("Core did not provide its browser relay");
			const url = new URL(endpoint);
			if (
				url.protocol !== "ws:" ||
				url.hostname !== "127.0.0.1" ||
				url.pathname !== "/ext" ||
				!url.searchParams.get("token")
			)
				throw new Error("Invalid browser relay endpoint");
			const socket = new WebSocket(url);
			connection.socket = socket;
			const open = Promise.withResolvers<void>();
			const timer = setTimeout(() => open.reject(new Error("Browser relay timed out")), 5000);
			socket.onopen = () => {
				if (this.#connection !== connection) return;
				this.#send({
					t: "hello",
					instanceId: "wisa",
					userAgent: `Chrome/${process.versions.chrome}`,
					browserVersion: `Chrome/${process.versions.chrome}`,
					tabs: [...this.#pages.values()].map(page => this.#snapshot(page)),
					attachedTabIds: [],
					discardedTabsProtocol: 1,
				});
				open.resolve();
				this.#publish();
			};
			socket.onerror = () => open.reject(new Error("Browser relay connection failed"));
			socket.onclose = () => {
				open.reject(new Error("Browser relay closed"));
				if (this.#connection === connection) this.disconnect(client);
			};
			socket.onmessage = event => {
				if (this.#connection !== connection) return;
				const call = JSON.parse(String(event.data)) as RelayCall;
				if (call.t !== "rpc") return;
				void this.#relay(call).then(
					result => {
						if (this.#connection === connection) this.#send({ t: "rpcResult", id: call.id, ok: true, result });
					},
					error => {
						if (this.#connection === connection)
							this.#send({ t: "rpcResult", id: call.id, ok: false, error: String(error) });
					},
				);
			};
			try {
				await open.promise;
			} finally {
				clearTimeout(timer);
			}
		} catch (error) {
			if (this.#connection === connection) this.#detach();
			throw error;
		}
	}

	async #relay(call: RelayCall): Promise<unknown> {
		if (call.op === "createTab") {
			const url = call.url === BLANK ? BLANK : webUrl(call.url);
			if (!url) throw new Error("Only HTTP(S) pages can be opened");
			return { tab: this.#snapshot(this.#add(url, call.active !== false)) };
		}
		if (call.op === "group" || call.op === "ungroup") {
			const grouped: Record<number, number> = {};
			for (const id of call.tabIds) {
				const page = this.#pages.get(id);
				if (!page) continue;
				page.driven = call.op === "group";
				if (page.driven) grouped[id] = 1;
			}
			this.#publish();
			return { grouped };
		}
		if (!("tabId" in call)) throw new Error("Unsupported browser relay operation");
		const page = this.#pages.get(call.tabId);
		if (!page) throw new Error("Browser tab is closed");
		const debug = page.view.webContents.debugger;
		switch (call.op) {
			case "activateTab":
				this.#select(page.id);
				break;
			case "removeTab":
				this.#remove(page.id);
				break;
			case "attach":
				if (!debug.isAttached()) debug.attach("1.3");
				break;
			case "detach":
				if (debug.isAttached()) debug.detach();
				break;
			case "send":
				if (
					call.method === "Page.navigate" &&
					call.params?.url !== BLANK &&
					(typeof call.params?.url !== "string" || !webUrl(call.params.url))
				)
					throw new Error("Only HTTP(S) pages can be opened");
				return debug.sendCommand(call.method, call.params, call.sessionId);
		}
		return {};
	}
}
