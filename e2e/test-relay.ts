#!/usr/bin/env bun
/// <reference types="bun" />
/**
 * A relay for the phone e2e, spoken the way the real one is.
 *
 * Run as a subprocess (`bun e2e/test-relay.ts`), because Playwright's runner is
 * Node and Node has no WebSocket *server*. The project already starts its
 * sidecar fixture this way, so the pattern is not new.
 *
 * Modelled on the agent's `collab-web/scripts/local-relay.ts` rather than
 * importing it: that file lives in the upstream monorepo, which this repo does
 * not depend on. The contract it honours is small, and is the same one the
 * public relay implements:
 *
 * - `GET /r/<roomId>?role=host|guest` upgrades; a second host gets 4009 and a
 *   guest joining a missing room gets 4004.
 * - Host frames: peer id 0 broadcasts, N targets one guest; forwarded as-is.
 * - Guest frames: the first 4 bytes are rewritten to the sender's peer id, then
 *   forwarded to the host.
 * - Host disconnect closes every guest with 4001.
 *
 * The relay never reads a payload, which is the property the hub's security
 * rests on — so the e2e proves the phone works without the relay understanding
 * a single frame.
 */
const ROOM_PATH_RE = /^\/r\/([A-Za-z0-9_-]{10,64})$/;

interface HostData {
	roomId: string;
	role: "host";
}

interface GuestData {
	roomId: string;
	role: "guest";
	peerId: number;
}

/** A socket as the relay uses it: the data it carries, plus send/close. */
interface Socket<Data> {
	data: Data;
	send(message: string | Uint8Array): void;
	close(code?: number, reason?: string): void;
}

interface Room {
	host: Socket<HostData>;
	guests: Map<number, Socket<GuestData>>;
	nextPeerId: number;
}

const rooms = new Map<string, Room>();

const server = Bun.serve({
	port: 0,
	fetch(req, srv): Response | undefined {
		const url = new URL(req.url);
		// Serve the real phone page too, so the e2e opens it over http:// — a
		// `file://` page may not open a WebSocket, and the real page is always
		// served over https.
		if (url.pathname === "/" || url.pathname === "/phone/") {
			const page = Bun.file(new URL("../site/phone/index.html", import.meta.url));
			return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
		}
		const match = ROOM_PATH_RE.exec(url.pathname);
		const role = url.searchParams.get("role");
		if (!match || (role !== "host" && role !== "guest")) return new Response("not found", { status: 404 });
		const roomId = match[1] as string;
		const data: HostData | GuestData =
			role === "host" ? { roomId, role: "host" } : { roomId, role: "guest", peerId: 0 };
		// `@types/bun` in this repo is a bare shim, so `upgrade`'s options type is
		// `undefined`; the runtime accepts the data payload we pass.
		if (srv.upgrade(req, { data } as never)) return undefined;
		return new Response("websocket upgrade required", { status: 426 });
	},
	websocket: {
		open(raw): void {
			const ws = raw as unknown as Socket<HostData | GuestData>;
			const data = ws.data;
			if (data.role === "host") {
				if (rooms.has(data.roomId)) {
					ws.close(4009, "a host is already connected for this room");
					return;
				}
				rooms.set(data.roomId, { host: ws as Socket<HostData>, guests: new Map(), nextPeerId: 1 });
				return;
			}
			const room = rooms.get(data.roomId);
			if (!room) {
				ws.close(4004, "no such room");
				return;
			}
			const peerId = room.nextPeerId++;
			data.peerId = peerId;
			room.guests.set(peerId, ws as Socket<GuestData>);
			room.host.send(JSON.stringify({ t: "peer-joined", peer: peerId }));
		},
		message(raw, message): void {
			if (typeof message === "string") return;
			const ws = raw as unknown as Socket<HostData | GuestData>;
			const data = ws.data;
			const room = rooms.get(data.roomId);
			if (!room) return;
			const bytes = new Uint8Array(message);
			if (bytes.byteLength < 4) return;
			if (data.role === "host") {
				// First 4 bytes are the target peer id; 0 means broadcast.
				const target = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
				if (target === 0) {
					for (const guest of room.guests.values()) guest.send(bytes);
				} else {
					room.guests.get(target)?.send(bytes);
				}
				return;
			}
			// Stamp the sender's peer id so the hub can answer one phone.
			new DataView(bytes.buffer, bytes.byteOffset, 4).setUint32(0, data.peerId, false);
			room.host.send(bytes);
		},
		close(raw): void {
			const ws = raw as unknown as Socket<HostData | GuestData>;
			const data = ws.data;
			const room = rooms.get(data.roomId);
			if (!room) return;
			if (data.role === "host") {
				if (room.host !== (ws as Socket<HostData>)) return;
				rooms.delete(data.roomId);
				for (const guest of room.guests.values()) {
					guest.send(JSON.stringify({ t: "room-closed" }));
					guest.close(4001, "room closed");
				}
				room.guests.clear();
				return;
			}
			if (room.guests.delete(data.peerId)) {
				room.host.send(JSON.stringify({ t: "peer-left", peer: data.peerId }));
			}
		},
	},
});

// The e2e reads this line to learn the port it was given.
console.log(`http://localhost:${server.port}`);
