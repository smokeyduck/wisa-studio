/**
 * The phone hub: one relay room that carries every session, hosted by this app.
 *
 * Why it exists: an agent collab room is bound to one `AgentSession`, so a phone
 * could watch exactly the tab whose link it held — it could not see the other
 * tabs, could not start a new one, and had to be handed a fresh link per tab.
 * This module hosts a room of its own on the same relay and speaks the protocol
 * in `shared/phone-hub.ts` inside it. The relay forwards sealed bytes without
 * understanding them, so this needs no relay change, no agent change, no open
 * port and no extra binary — the same properties that already let `/collab`
 * work from a phone against a laptop on a VPS.
 *
 * What it is not: a second agent protocol. Sessions come from the sidecar pool,
 * new ones are spawned through the same call the renderer's "New Tab" uses, and
 * links come from the agent's own `collab_start` via {@link CollabPhoneHost}.
 * The phone page embeds the agent's shipped PWA (`webLink`) for the session it
 * is watching, so transcript, tool cards, approvals and prompts are the real
 * ones. This module only ever answers "which sessions exist, and what is each
 * one's link".
 *
 * Security posture: one link grants every session the app can see, which is the
 * point ("manage everything from the phone") and also the risk. So the key
 * rides only in the link fragment, {@link PhoneHub.revoke} rotates the room and
 * kills every copy of the old link, and the hub stays off until turned on.
 */
import type { BrowserWindow } from "electron";
import type { IpcTabInfo } from "../shared/ipc-types";
import {
	formatPhoneHubLink,
	PHONE_HUB_IV_BYTES,
	PHONE_HUB_KEY_BYTES,
	PHONE_HUB_PROTO,
	PHONE_HUB_ROOM_MARKER,
	PHONE_HUB_SILENCE_LIMIT_MS,
	type PhoneHubLink,
	type PhoneHubReply,
	type PhoneHubRequest,
	type PhoneHubSession,
	phoneHubSocketUrl,
} from "../shared/phone-hub";
import type { CollabPhoneHost } from "./collab-phone";
import type { SidecarPool } from "./sidecar-pool";

/** The relay's default, matching the agent's own `collab.relayUrl` default. */
const DEFAULT_RELAY_URL = "wss://my.omp.sh";
/** Backoff for reconnects after a transient drop. */
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/** Frames queued while the socket is down; the newest state wins, so bound it. */
const PENDING_LIMIT = 32;

function base64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64url");
}

/** A random room key — the only secret in the link. */
function randomKey(): string {
	const bytes = new Uint8Array(PHONE_HUB_KEY_BYTES);
	crypto.getRandomValues(bytes);
	return base64Url(bytes);
}

/** A random room id, marked so a hub room is never mistaken for a collab room. */
function randomRoomId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return `${PHONE_HUB_ROOM_MARKER}${base64Url(bytes)}`;
}

/** `[12B IV][ciphertext+tag]`, the agent's own sealed layout. */
async function seal(key: CryptoKey, value: unknown): Promise<Uint8Array> {
	const iv = new Uint8Array(PHONE_HUB_IV_BYTES);
	crypto.getRandomValues(iv);
	const plaintext = new TextEncoder().encode(JSON.stringify(value));
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
	const out = new Uint8Array(iv.byteLength + ciphertext.byteLength);
	out.set(iv, 0);
	out.set(ciphertext, iv.byteLength);
	return out;
}

async function openSealed(key: CryptoKey, data: Uint8Array): Promise<unknown> {
	if (data.byteLength <= PHONE_HUB_IV_BYTES) throw new Error("sealed frame too short");
	// Copy into plain `ArrayBuffer`-backed views: a WebSocket may hand back a
	// SharedArrayBuffer-backed view, which WebCrypto's BufferSource rejects.
	const iv = new Uint8Array(data.slice(0, PHONE_HUB_IV_BYTES));
	const ciphertext = new Uint8Array(data.slice(PHONE_HUB_IV_BYTES));
	const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
	return JSON.parse(new TextDecoder().decode(plaintext));
}

/** Normalise whatever a WebSocket delivered into plain bytes. */
async function toBytes(data: unknown): Promise<Uint8Array | null> {
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	if (ArrayBuffer.isView(data))
		return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
	if (typeof Blob !== "undefined" && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
	return null;
}

/** What the hub needs from the app, injected so tests drive it without Electron. */
export interface PhoneHubDeps {
	pool: Pick<SidecarPool, "allTabs">;
	/** The agent's own hosting call, so this module never speaks `collab_start` itself. */
	collabPhone: Pick<CollabPhoneHost, "start">;
	/** Spawn a tab the way the renderer's "New Tab" does; null when refused. */
	spawn: (win: BrowserWindow, cwd: string | undefined) => Promise<string | null>;
	/** The relay to host on; the agent's `collab.relayUrl` when unset. */
	relayUrl: () => string;
	/** A display name for the hub, shown on the phone. */
	hubName: () => string;
	/**
	 * How to reach the relay. Electron's global `WebSocket` in production; tests
	 * inject a socket wired to an in-process relay, so the whole protocol can be
	 * exercised without a network or a live relay binary.
	 */
	socket?: (url: string) => WebSocket;
}

/** The live hub, or nothing when the user has not turned phone access on. */
export class PhoneHub {
	#deps: PhoneHubDeps;
	#socket: WebSocket | null = null;
	#key: CryptoKey | null = null;
	#link: PhoneHubLink | null = null;
	/** Guests by the peer id the relay assigned them, with the last frame they sent. */
	#peers = new Map<number, number>();
	#retryTimer: NodeJS.Timeout | null = null;
	#retryMs = RETRY_MIN_MS;
	#closed = false;
	/** Frames queued while the socket is not open yet. */
	#pending: Uint8Array[] = [];

	constructor(deps: PhoneHubDeps) {
		this.#deps = deps;
	}

	/** The link a phone scans, or null while the hub is not running. */
	get link(): string | null {
		if (!this.#link) return null;
		return formatPhoneHubLink(this.#deps.relayUrl() || DEFAULT_RELAY_URL, this.#link);
	}

	/** Whether the relay socket is up right now (the dialog shows this as "live"). */
	get live(): boolean {
		return this.#socket?.readyState === WebSocket.OPEN;
	}

	/** How many phones are attached. */
	get listeners(): number {
		return this.#peers.size;
	}

	/**
	 * Start hosting, or reuse the running room. Idempotent: the dialog calls this
	 * on every open, and minting a new room each time would invalidate a link the
	 * user is already using.
	 */
	async start(): Promise<string> {
		if (this.#socket && this.#link) return this.link ?? "";
		this.#closed = false;
		await this.#connect();
		return this.link ?? "";
	}

	/**
	 * Stop hosting and forget the room. Every phone loses its link; the next
	 * `start()` mints a new room and key.
	 */
	stop(): void {
		this.#closed = true;
		clearTimeout(this.#retryTimer ?? undefined);
		this.#retryTimer = null;
		this.#socket?.close(1000, "hub stopped");
		this.#socket = null;
		this.#peers.clear();
		this.#pending = [];
		this.#link = null;
		this.#key = null;
	}

	/**
	 * Rotate the room: a new id and key, so every link already handed out is
	 * dead. This is the revoke that a one-link-grants-everything design needs.
	 */
	async revoke(): Promise<string> {
		this.stop();
		return await this.start();
	}

	async #connect(): Promise<void> {
		const rawKey = randomKey();
		const raw = new Uint8Array(Buffer.from(rawKey, "base64url"));
		this.#key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
		this.#link = { roomId: randomRoomId(), key: rawKey };
		await this.#dial(this.#socketUrl());
	}

	#socketUrl(): string {
		const link = this.#link;
		if (!link) throw new Error("hub has no room");
		return phoneHubSocketUrl(this.#deps.relayUrl() || DEFAULT_RELAY_URL, link.roomId, "host");
	}

	/** Open the socket and resolve once it is up, or once the first dial failed. */
	#dial(url: string): Promise<void> {
		const { promise, resolve } = Promise.withResolvers<void>();
		let settled = false;
		const settle = () => {
			if (settled) return;
			settled = true;
			resolve();
		};
		let socket: WebSocket;
		try {
			socket = (this.#deps.socket ?? (target => new WebSocket(target)))(url);
		} catch {
			// A malformed relay URL never opens, so a retry cannot help either.
			settle();
			return promise;
		}
		this.#socket = socket;
		socket.addEventListener("open", () => {
			this.#retryMs = RETRY_MIN_MS;
			this.#flushPending();
			settle();
		});
		socket.addEventListener("message", event => {
			void this.#onFrame(event.data);
		});
		socket.addEventListener("close", () => {
			if (this.#socket === socket) this.#socket = null;
			settle();
			if (!this.#closed) this.#scheduleRetry();
		});
		socket.addEventListener("error", () => {
			// `close` always follows an error; settling here only stops a failed
			// first dial from leaving the dialog spinning forever.
			settle();
		});
		return promise;
	}

	#scheduleRetry(): void {
		if (this.#closed || this.#retryTimer) return;
		const delay = this.#retryMs;
		this.#retryMs = Math.min(this.#retryMs * 2, RETRY_MAX_MS);
		this.#retryTimer = setTimeout(() => {
			this.#retryTimer = null;
			if (this.#closed || !this.#link) return;
			void this.#dial(this.#socketUrl());
		}, delay);
	}

	async #onFrame(data: unknown): Promise<void> {
		const key = this.#key;
		const bytes = await toBytes(data);
		if (!key || !bytes || bytes.byteLength < 4) return;
		// Guest frames carry a 4-byte peer id that the relay rewrote to the sender.
		const peerId = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
		let request: PhoneHubRequest;
		try {
			request = (await openSealed(key, bytes.subarray(4))) as PhoneHubRequest;
		} catch {
			// Not ours: an id collision, or a stale key after a rotate. Answering a
			// peer that cannot read us would only leak that the room exists.
			return;
		}
		if (!request || typeof request !== "object") return;
		// Prune peers that went quiet for a whole silence window: their socket is
		// gone even if the relay has not said so yet.
		const cutoff = Date.now() - PHONE_HUB_SILENCE_LIMIT_MS;
		for (const [peer, lastSeen] of this.#peers) {
			if (lastSeen < cutoff) this.#peers.delete(peer);
		}
		this.#peers.set(peerId, Date.now());
		await this.#handle(request, peerId);
	}

	async #handle(request: PhoneHubRequest, peerId: number): Promise<void> {
		switch (request.t) {
			case "ping":
				await this.#send({ t: "pong" }, peerId);
				return;
			case "list":
				await this.#send(
					{
						t: "welcome",
						proto: PHONE_HUB_PROTO,
						name: this.#deps.hubName(),
						sessions: await this.#sessions(),
					},
					peerId,
				);
				return;
			case "host":
			case "open":
				await this.#replySession(peerId, request.tabId);
				return;
			case "create":
				await this.#createSession(peerId, request.cwd);
				return;
		}
	}

	/** Answer with one session, hosting its room first so the page has a link. */
	async #replySession(peerId: number, tabId: string): Promise<void> {
		const found = this.#deps.pool.allTabs().find(entry => entry.tab.tabId === tabId);
		if (!found) {
			await this.#send({ t: "error", message: "That session is gone." }, peerId);
			return;
		}
		// `collab_start` reuses a live room, so this cannot rotate a link the
		// phone is already on — that is why opening is also hosting.
		const entry = await this.#deps.collabPhone.start(found.win, tabId);
		const session = sessionFrom(found.win.webContents.id, found.tab, entry);
		await this.#send({ t: "session", session, ...(entry.error ? { error: entry.error } : {}) }, peerId);
	}

	/** Spawn a tab, then hand the phone its link — "start a new session" from a phone. */
	async #createSession(peerId: number, cwd: string | undefined): Promise<void> {
		// A phone has no window, so create in the window that already owns
		// sessions: that is the window the user is working in.
		const win = this.#deps.pool.allTabs()[0]?.win;
		if (!win) {
			await this.#send({ t: "error", message: "No window is open to start a session in." }, peerId);
			return;
		}
		const tabId = await this.#deps.spawn(win, cwd);
		if (!tabId) {
			await this.#send({ t: "error", message: "The session could not be created." }, peerId);
			return;
		}
		await this.#replySession(peerId, tabId);
	}

	/** Every tab, with whatever collab state it already has (hosting nothing here). */
	async #sessions(): Promise<PhoneHubSession[]> {
		// `CollabPhoneHost.start` is the only collab read it exposes and it hosts,
		// so a list must not call it: hosting every tab to answer a read would
		// open rooms the user never asked for. A session therefore shows its
		// link only after the phone opens it (which hosts it, once).
		const sessions = this.#deps.pool.allTabs().map(({ win, tab }) => sessionFrom(win.webContents.id, tab, null));
		// Running sessions first (they are what a phone is opened to watch), then
		// newest tab first — the pool lists tabs in acquisition order, so the
		// newest is last and reversing puts the session just opened on top.
		return sessions.reverse().sort((a, b) => Number(b.running) - Number(a.running));
	}

	/** Seal and send to one peer. */
	async #send(reply: PhoneHubReply, peerId: number): Promise<void> {
		const key = this.#key;
		if (!key) return;
		const sealed = await seal(key, reply);
		const frame = new Uint8Array(4 + sealed.byteLength);
		new DataView(frame.buffer).setUint32(0, peerId, false);
		frame.set(sealed, 4);
		const socket = this.#socket;
		if (socket?.readyState === WebSocket.OPEN) {
			socket.send(frame);
			return;
		}
		if (this.#pending.length >= PENDING_LIMIT) this.#pending.shift();
		this.#pending.push(frame);
	}

	#flushPending(): void {
		const socket = this.#socket;
		if (socket?.readyState !== WebSocket.OPEN) return;
		for (const frame of this.#pending) socket.send(frame);
		this.#pending = [];
	}
}

/** A session entry from a tab and its collab entry (absent when merely listed). */
function sessionFrom(
	winId: number,
	tab: IpcTabInfo,
	entry: { webLink?: string; webViewLink?: string; participants?: number } | null,
): PhoneHubSession {
	const session: PhoneHubSession = {
		tabId: tab.tabId,
		winId,
		cwd: tab.cwd,
		kind: tab.kind,
		title: tab.title?.trim() || basename(tab.cwd) || "Session",
		status: tab.status,
		running: tab.status === "running",
		participants: entry?.participants ?? 0,
	};
	if (entry?.webLink) session.webLink = entry.webLink;
	if (entry?.webViewLink) session.webViewLink = entry.webViewLink;
	return session;
}

function basename(path: string): string {
	const trimmed = path.replace(/[\\/]+$/, "");
	const at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	return at >= 0 ? trimmed.slice(at + 1) : trimmed;
}
