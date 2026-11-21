/**
 * Phone hub wire shapes: one room for every session, instead of one per tab.
 *
 * The agent's own collab room is bound to a single `AgentSession`, so a phone
 * could only ever see the tab whose link it held. The GUI therefore hosts its
 * own room on the same relay and speaks its own protocol inside it — the relay
 * only forwards sealed bytes and never learns what they mean, so no relay or
 * agent change is needed and nothing has to listen on a port.
 *
 * Division of labour:
 * - the **hub** (this app's main process) lists every session, creates new
 *   ones, and hands out a per-session collab link;
 * - the **phone page** (site/phone/) renders that list and embeds the agent's
 *   own PWA (`my.omp.sh`) for the session being watched, so transcript, tool
 *   cards, approvals and prompts are the ones already shipping.
 *
 * Everything below is shared by main, the page and the tests. The page cannot
 * import this file (it is a standalone HTML file on Pages), so `site/phone/`
 * repeats the constants and a unit test pins the two copies together.
 */

/** Bumped when a change would make an older page misread a newer hub. */
export const PHONE_HUB_PROTO = 1;

/**
 * Relay path prefix for a room. The public relay only routes `/r/<roomId>`, so
 * the hub uses the same prefix as the agent's own rooms; a hub room is told
 * apart by its random id and by the protocol inside, never by the path.
 */
export const PHONE_HUB_ROOM_PREFIX = "/r/";

/**
 * Hub room ids start with this marker. The relay path cannot tell a hub room
 * from an agent's collab room (both are `/r/<id>`), so the id itself carries
 * the difference: the phone page then knows to speak this protocol instead of
 * treating the link as a single-session collab link, and an id collision with
 * an agent room is impossible.
 */
export const PHONE_HUB_ROOM_MARKER = "hub-";

/** AES-256-GCM key length, matching the agent's collab rooms. */
export const PHONE_HUB_KEY_BYTES = 32;
/** Sealed layout is `[12B IV][ciphertext+tag]`, matching the agent's collab rooms. */
export const PHONE_HUB_IV_BYTES = 12;
/** How often an idle phone page pings, so a slept laptop is noticed quickly. */
export const PHONE_HUB_PING_MS = 15_000;
/** A hub that hears nothing for this long drops the socket and reconnects. */
export const PHONE_HUB_SILENCE_LIMIT_MS = 45_000;

/** What the phone may do with a session. */
export interface PhoneHubSession {
	tabId: string;
	/** Window the tab belongs to, so a phone never mixes two windows' sessions. */
	winId: number;
	cwd: string;
	kind: "agent" | "chat";
	/** Best available name: the session title, else the folder's basename. */
	title: string;
	/** `ready` and friends — what the GUI's own tab strip shows. */
	status: string;
	/** A run is in flight right now. */
	running: boolean;
	/**
	 * The session's browser link, ready to embed: the agent's own `webLink`
	 * (`https://my.omp.sh/#<room>.<key>`), present once the session is hosting.
	 * The page puts this in an iframe, so it is an http(s) URL, not `wss://`.
	 */
	webLink?: string;
	/** The read-only variant, for a phone that should watch but not type. */
	webViewLink?: string;
	/** How many people are in that session's room, the phone included. */
	participants: number;
}

/** Frames the phone sends to the hub. */
export type PhoneHubRequest =
	/** Ask for the current list; also the first frame after connecting. */
	| { t: "list" }
	/**
	 * Open a session. `tabId` picks an existing tab; `create` spawns a new one
	 * in `cwd` (the hub's default when omitted). The reply is a `session` frame
	 * carrying the collab link to embed.
	 */
	| { t: "open"; tabId: string }
	| { t: "create"; cwd?: string }
	/** Host (or re-host) a session's collab room so it has a link to embed. */
	| { t: "host"; tabId: string }
	/** Keepalive; answered with `pong`. */
	| { t: "ping" };

/** Frames the hub sends to the phone. */
export type PhoneHubReply =
	/** Sent on connect: protocol, this hub's name, and every session it can see. */
	| { t: "welcome"; proto: number; name: string; sessions: PhoneHubSession[] }
	| { t: "sessions"; sessions: PhoneHubSession[] }
	/** One session, with the link the page should embed (`link` present when hosted). */
	| { t: "session"; session: PhoneHubSession; error?: string }
	/** A request failed; `message` is user-facing and already localised by the hub. */
	| { t: "error"; message: string }
	| { t: "pong" };

/** Room id and key, as carried in the link fragment. */
export interface PhoneHubLink {
	roomId: string;
	key: string;
}

const ROOM_ID_RE = /^[A-Za-z0-9_-]{10,64}$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

/** True when `value` is a well-formed hub room id (marker included). */
export function isPhoneHubRoomId(value: string): boolean {
	return ROOM_ID_RE.test(value) && value.startsWith(PHONE_HUB_ROOM_MARKER);
}

/**
 * Build the link a phone scans: `wss://<relay>/r/<roomId>#<base64url key>`.
 *
 * The key rides in the fragment, never the query, so the relay · and anything
 * logging request lines · never sees it. This mirrors the agent's own links.
 */
export function formatPhoneHubLink(relayUrl: string, link: PhoneHubLink): string {
	const base = relayUrl.replace(/\/+$/, "").replace(/^ws(s?):\/\//, (_, tls: string) => `ws${tls}://`);
	return `${base}${PHONE_HUB_ROOM_PREFIX}${link.roomId}#${link.key}`;
}

/**
 * Parse a link back into its room and key. Returns null for anything that is
 * not a hub link, so the page can tell a hub link from a plain collab one.
 */
export function parsePhoneHubLink(text: string): { relayUrl: string; link: PhoneHubLink } | null {
	const trimmed = text.trim();
	if (!trimmed) return null;
	// The key is what follows the LAST "#". A link is often pasted with the hub
	// page URL in front of it, and that URL has a fragment of its own
	// (`…/phone/#wss://relay/r/room#key`), so the first "#" is the page's.
	const hashAt = trimmed.lastIndexOf("#");
	if (hashAt < 0) return null;
	const key = trimmed.slice(hashAt + 1).trim();
	const beforeHash = trimmed.slice(0, hashAt);
	const roomAt = beforeHash.indexOf(PHONE_HUB_ROOM_PREFIX);
	if (roomAt < 0) return null;
	const roomId = beforeHash.slice(roomAt + PHONE_HUB_ROOM_PREFIX.length).replace(/\/+$/, "");
	if (!isPhoneHubRoomId(roomId) || !B64URL_RE.test(key)) return null;
	const relayUrl = beforeHash.slice(0, roomAt) || "wss://my.omp.sh";
	return { relayUrl, link: { roomId, key } };
}

/** The relay WebSocket URL for a hub room. The key stays out of the URL. */
export function phoneHubSocketUrl(relayUrl: string, roomId: string, role: "host" | "guest"): string {
	const base = relayUrl.replace(/\/+$/, "");
	return `${base}${PHONE_HUB_ROOM_PREFIX}${roomId}?role=${role}`;
}
