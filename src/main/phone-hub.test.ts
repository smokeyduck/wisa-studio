/**
 * The phone hub: link grammar, sealed frames, and the room protocol end to end.
 *
 * The relay is faked in-process — a socket factory wires the hub to a guest the
 * test controls, and the fake relay rewrites the peer id the way the real one
 * does. That keeps the test deterministic and offline while still exercising
 * the real paths: AES-GCM sealing, frame parsing, command routing, and the
 * spawn-and-hand-back-a-link flow.
 */

import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";
import type { CollabPhoneEntry } from "../shared/collab-phone";
import type { IpcTabInfo } from "../shared/ipc-types";
import { formatPhoneHubLink, PHONE_HUB_ROOM_MARKER, parsePhoneHubLink } from "../shared/phone-hub";
import type { PhoneHubDeps } from "./phone-hub";
import { PhoneHub } from "./phone-hub";

/** A tab fixture; the hub only reads `IpcTabInfo` fields. */
function tab(overrides: Partial<IpcTabInfo> = {}): IpcTabInfo {
	return {
		tabId: "tab-1",
		cwd: "/home/me/project",
		status: "ready",
		kind: "agent",
		title: "Fix the parser",
		...overrides,
	} as IpcTabInfo;
}

/** A stand-in for `BrowserWindow`, carrying only the fields the hub reads. */
function fakeWindow(id = 42): BrowserWindow {
	return { webContents: { id }, isDestroyed: () => false } as unknown as BrowserWindow;
}

/**
 * A relay that forwards sealed frames between the hub and one guest.
 *
 * It mirrors the real relay's one visible behaviour: the 4-byte peer id at the
 * head of a guest frame is rewritten to the sender's index, which is how the
 * hub addresses a single phone. Everything else is pass-through — the relay
 * never reads the payload, and neither does this.
 */
class FakeRelay {
	#host: ((data: Uint8Array) => void) | null = null;
	#guest: ((data: Uint8Array) => void) | null = null;
	/** Frames the hub sent, in order, as the guest received them. */
	received: Uint8Array[] = [];

	/** The socket factory handed to the hub. */
	factory = (url: string): WebSocket => {
		expect(url).toContain(PHONE_HUB_ROOM_MARKER);
		expect(url).toContain("role=host");
		const socket = {
			readyState: 1,
			send: (frame: Uint8Array) => {
				this.received.push(frame);
				// Deliver to the guest after the microtask that produced it.
				queueMicrotask(() => this.#guest?.(frame));
			},
			close: () => {},
			addEventListener: (type: string, handler: (event: { data?: unknown }) => void) => {
				if (type === "open") queueMicrotask(() => handler({}));
				if (type === "message") this.#host = (data: Uint8Array) => handler({ data });
			},
		};
		return socket as unknown as WebSocket;
	};

	/** Send a sealed frame from the guest to the hub, with a peer id prepended. */
	fromGuest(frame: Uint8Array, peerId = 1): void {
		const out = new Uint8Array(4 + frame.byteLength);
		new DataView(out.buffer).setUint32(0, peerId, false);
		out.set(frame, 4);
		this.#host?.(out);
	}

	/** Register what the guest receives. */
	onHubFrame(handler: (data: Uint8Array) => void): void {
		this.#guest = handler;
	}
}

/** Seal a value exactly as the phone page does, for a given room key. */
async function sealAs(keyText: string, value: unknown): Promise<Uint8Array> {
	const raw = new Uint8Array(Buffer.from(keyText, "base64url"));
	const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
	const iv = new Uint8Array(12);
	crypto.getRandomValues(iv);
	const plaintext = new TextEncoder().encode(JSON.stringify(value));
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
	const out = new Uint8Array(iv.byteLength + ciphertext.byteLength);
	out.set(iv, 0);
	out.set(ciphertext, iv.byteLength);
	return out;
}

/** Open a frame the hub sent, using the room key from the hub's own link. */
async function openFromHub(keyText: string, frame: Uint8Array): Promise<unknown> {
	const raw = new Uint8Array(Buffer.from(keyText, "base64url"));
	const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
	// Drop the 4-byte peer id, then split IV from ciphertext.
	const body = frame.subarray(4);
	const iv = new Uint8Array(body.slice(0, 12));
	const ciphertext = new Uint8Array(body.slice(12));
	const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
	return JSON.parse(new TextDecoder().decode(plaintext));
}

/**
 * What the phone received, with a way to await the next arrivals.
 *
 * The hub answers asynchronously — it awaits AES-GCM, and `open` also awaits the
 * agent's hosting call — so there is no promise to await from outside. Waiting
 * on a resolver that fires when a frame lands waits on the real condition, and
 * needs no guessed delay.
 */
class Inbox {
	readonly replies: unknown[] = [];
	#waiters: { count: number; resolve: () => void }[] = [];

	push(reply: unknown): void {
		this.replies.push(reply);
		for (const waiter of this.#waiters.filter(candidate => this.replies.length >= candidate.count)) {
			waiter.resolve();
		}
		this.#waiters = this.#waiters.filter(candidate => this.replies.length < candidate.count);
	}

	/** Resolve once `count` frames have arrived (immediately when they already have). */
	async atLeast(count: number): Promise<void> {
		if (this.replies.length >= count) return;
		const { promise, resolve } = Promise.withResolvers<void>();
		this.#waiters.push({ count, resolve });
		return await promise;
	}

	/** Resolve once nothing more arrives within one event-loop turn. */
	async quiet(): Promise<void> {
		const seen = this.replies.length;
		await new Promise(resolve => queueMicrotask(() => resolve(null)));
		if (this.replies.length !== seen) return await this.quiet();
	}
}

describe("hub link grammar", () => {
	const link = { roomId: `${PHONE_HUB_ROOM_MARKER}abc123XYZ`, key: "a".repeat(43) };

	it("puts the key in the fragment, never the query", () => {
		const url = formatPhoneHubLink("wss://my.omp.sh", link);
		expect(url).toBe(`wss://my.omp.sh/r/${link.roomId}#${link.key}`);
		// The relay logs the request line, not the fragment, so the key stays out.
		expect(url.split("#")[0]).not.toContain(link.key);
	});

	it("round-trips, and parses a link pasted behind the page URL", () => {
		const bare = formatPhoneHubLink("wss://my.omp.sh", link);
		expect(parsePhoneHubLink(bare)).toEqual({ relayUrl: "wss://my.omp.sh", link });
		// A QR may carry the hub page URL, which has a fragment of its own. The key
		// is everything after the FIRST "#", so this still parses.
		const pasted = `https://smokeyduck.github.io/wisa-studio/phone/#${bare}`;
		expect(parsePhoneHubLink(pasted)?.link).toEqual(link);
	});

	it("rejects links that are not hub rooms", () => {
		// An agent collab room has no marker; the page must not treat it as a hub.
		expect(parsePhoneHubLink("wss://my.omp.sh/r/plainRoomId123#key")).toBeNull();
		expect(parsePhoneHubLink("https://example.com/nothing")).toBeNull();
		expect(parsePhoneHubLink("")).toBeNull();
	});
});

describe("hub protocol", () => {
	/** Hub + relay + guest, with the hub already started. */
	async function startedHub(overrides: Partial<PhoneHubDeps> = {}) {
		const relay = new FakeRelay();
		const win = fakeWindow();
		// The pool is live, not a snapshot: a spawned tab must show up in it, the
		// way `spawnTabForWindow` registers the tab before it returns.
		const tabs: IpcTabInfo[] = [tab()];
		// A spawned tab must join the pool, because the hub looks it up by id
		// afterwards — the real `spawnTabForWindow` registers before returning.
		const spawn = vi.fn(async (_win: BrowserWindow, _cwd: string | undefined) => {
			tabs.push(tab({ tabId: "tab-9" }));
			return "tab-9";
		});
		const hub = new PhoneHub({
			pool: { allTabs: () => tabs.map(tabInfo => ({ win, tab: tabInfo })) },
			collabPhone: {
				start: async () =>
					({
						tabId: "tab-1",
						ready: true,
						role: "host",
						readOnly: false,
						participants: 1,
						webLink: "https://my.omp.sh/#room.key",
					}) as CollabPhoneEntry,
			},
			spawn,
			relayUrl: () => "wss://my.omp.sh",
			hubName: () => "My laptop",
			socket: relay.factory,
			...overrides,
		});

		const link = await hub.start();
		const parsed = parsePhoneHubLink(link);
		expect(parsed).not.toBeNull();
		const inbox = new Inbox();
		relay.onHubFrame(frame => {
			void openFromHub(parsed?.link.key ?? "", frame).then(
				reply => inbox.push(reply),
				() => {},
			);
		});
		return { hub, relay, key: parsed?.link.key ?? "", inbox, spawn };
	}

	it("answers a list with a welcome listing every session", async () => {
		const { relay, key, inbox } = await startedHub();
		relay.fromGuest(await sealAs(key, { t: "list" }));
		await inbox.atLeast(1);
		const welcome = inbox.replies.find(reply => (reply as { t: string }).t === "welcome") as {
			proto: number;
			name: string;
			sessions: { tabId: string; title: string; webLink?: string }[];
		};
		expect(welcome.name).toBe("My laptop");
		expect(welcome.proto).toBe(1);
		expect(welcome.sessions.map(session => session.tabId)).toEqual(["tab-1"]);
		expect(welcome.sessions[0]?.title).toBe("Fix the parser");
		// Listing is a read: it must not host, so no link yet.
		expect(welcome.sessions[0]?.webLink).toBeUndefined();
	});

	it("hosts a session on open and returns its embeddable web link", async () => {
		const start = vi.fn(
			async () =>
				({
					tabId: "tab-1",
					ready: true,
					role: "host" as const,
					readOnly: false,
					participants: 1,
					webLink: "https://my.omp.sh/#room.key",
				}) as CollabPhoneEntry,
		);
		const { relay, key, inbox } = await startedHub({ collabPhone: { start } });
		relay.fromGuest(await sealAs(key, { t: "open", tabId: "tab-1" }));
		await inbox.atLeast(1);
		const session = inbox.replies.find(reply => (reply as { t: string }).t === "session") as {
			session: { tabId: string; webLink?: string };
			error?: string;
		};
		expect(start).toHaveBeenCalledOnce();
		expect(session.error).toBeUndefined();
		expect(session.session.webLink).toBe("https://my.omp.sh/#room.key");
	});

	it("creates a session in a window, then hands back its link", async () => {
		const { relay, key, inbox, spawn } = await startedHub();
		relay.fromGuest(await sealAs(key, { t: "create" }));
		await inbox.atLeast(1);
		expect(spawn).toHaveBeenCalledOnce();
		expect(spawn.mock.calls[0]?.[1]).toBeUndefined();
		const session = inbox.replies.find(reply => (reply as { t: string }).t === "session") as {
			session: { tabId: string };
		};
		expect(session.session.tabId).toBe("tab-9");
	});

	it("reports an unknown session instead of failing silently", async () => {
		const { relay, key, inbox } = await startedHub();
		relay.fromGuest(await sealAs(key, { t: "open", tabId: "nope" }));
		await inbox.atLeast(1);
		const error = inbox.replies.find(reply => (reply as { t: string }).t === "error") as { message: string };
		expect(error.message).toContain("gone");
	});

	it("ignores frames sealed with a key it does not hold", async () => {
		const { relay, inbox } = await startedHub();
		// A phone from before a rotate, or a stranger who guessed the room id.
		relay.fromGuest(await sealAs(Buffer.alloc(32, 9).toString("base64url"), { t: "list" }));
		// Nothing to wait for: let the hub's handlers run out, then assert none answered.
		await inbox.quiet();
		expect(inbox.replies).toEqual([]);
	});

	it("rotates the room so an old link stops working", async () => {
		const { hub, relay, key: oldKey } = await startedHub();
		const before = hub.link;
		const rotated = await hub.revoke();
		expect(rotated).not.toBe(before);
		// The old key no longer opens anything the hub sends.
		const inbox = new Inbox();
		relay.onHubFrame(frame => {
			void openFromHub(oldKey, frame).then(
				reply => inbox.push(reply),
				() => {},
			);
		});
		relay.fromGuest(await sealAs(oldKey, { t: "list" }));
		await inbox.quiet();
		expect(inbox.replies).toEqual([]);
	});
});
