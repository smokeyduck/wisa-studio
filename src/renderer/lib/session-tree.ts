/**
 * Sidebar session forest. A session header records `parentSession` (a session
 * id or a session file path). Subagent transcripts also live in the artifact
 * directory beside the parent file; the session index points those at the
 * parent path. Either link nests the child under that session. A link that
 * does not name a session in this list, or that would cycle, leaves the
 * session at the root so it stays reachable. {@link listedSessions} decides
 * which files get a row and what they hang under.
 */

import type { SessionInfo } from "../../shared/ipc-types";

export interface SessionNode {
	session: SessionInfo;
	children: SessionNode[];
}

function pathKey(value: string): string {
	return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

/** Looks up the session a header link names: a session file path, or a session id. */
function sessionLinks(sessions: readonly SessionInfo[]): (link: string | undefined) => SessionInfo | undefined {
	const byPath = new Map<string, SessionInfo>();
	const byId = new Map<string, SessionInfo>();
	for (const session of sessions) {
		byPath.set(pathKey(session.path), session);
		if (session.id && !byId.has(session.id)) byId.set(session.id, session);
	}
	return link => {
		const raw = link?.trim();
		return raw ? (byPath.get(pathKey(raw)) ?? byId.get(raw)) : undefined;
	};
}

/**
 * Each session's parent within `sessions`, keyed by session path. A link that
 * would close a cycle is dropped at the session the loop comes back to, which
 * becomes a root with the rest of the loop under it; a session that only
 * leads into the loop keeps its parent.
 */
export function sessionParents(sessions: readonly SessionInfo[]): Map<string, SessionInfo> {
	const linked = sessionLinks(sessions);
	const parentOf = new Map<string, SessionInfo>();
	for (const session of sessions) {
		const parent = linked(session.parentSessionPath);
		if (parent && parent.path !== session.path) parentOf.set(session.path, parent);
	}
	for (const session of sessions) {
		const seen = new Set<string>([session.path]);
		let cursor = parentOf.get(session.path);
		while (cursor) {
			if (seen.has(cursor.path)) {
				parentOf.delete(cursor.path);
				break;
			}
			seen.add(cursor.path);
			cursor = parentOf.get(cursor.path);
		}
	}
	return parentOf;
}

/** Roots in input order; each parent's children in the order they were given. */
export function buildSessionTree(sessions: readonly SessionInfo[]): SessionNode[] {
	const parentOf = sessionParents(sessions);

	const childrenOf = new Map<string, SessionInfo[]>();
	const roots: SessionInfo[] = [];
	for (const session of sessions) {
		const parent = parentOf.get(session.path);
		if (!parent) {
			roots.push(session);
			continue;
		}
		const children = childrenOf.get(parent.path);
		if (children) children.push(session);
		else childrenOf.set(parent.path, [session]);
	}

	const nodeFor = (session: SessionInfo): SessionNode => ({
		session,
		children: (childrenOf.get(session.path) ?? []).map(nodeFor),
	});
	return roots.map(nodeFor);
}

/**
 * Lists of sessions to browse (the resume picker, recent projects) leave
 * subagent transcripts out: the sidebar shows them under their session.
 */
export function isSubagentSession(session: SessionInfo): boolean {
	return session.subagent === true;
}

/**
 * How long a session file may still change after its continuation began: its
 * writer closes in the background and flushes what it had queued.
 */
const CONTINUATION_SETTLE_MS = 2_000;

export interface ListedSessions {
	/** The rows, in input order, with each parent link naming the row to draw it under. */
	sessions: SessionInfo[];
	/** A session file left out → the listed session that carries its conversation on. */
	heirs: Map<string, string>;
}

/**
 * What a list of sessions shows, as opposed to what is on disk.
 *
 * When the agent finds its session file taken, it moves to a sibling file whose
 * header points back with `continuationOf`. That is one conversation in two
 * files, so the old file gets no row once nothing happened in it after the move.
 * It keeps one while `keep` says so (it is open in a tab) or if it kept changing
 * (another process stayed on it), and the continuation is then a child like a fork.
 *
 * Forks and branches of any generation sit directly under their family's root:
 * a chain of them is a list of alternatives, not a staircase. Subagent
 * transcripts stay under the session that ran them. A left-out file's move to
 * its heir, because the session index keeps the original of two copies.
 */
export function listedSessions(
	all: readonly SessionInfo[],
	keep: (session: SessionInfo) => boolean = () => false,
): ListedSessions {
	const linked = sessionLinks(all);
	const successors = new Map<string, SessionInfo>();
	for (const session of all) {
		const previous = linked(session.continuationOf);
		if (!previous || keep(previous)) continue;
		const began = Date.parse(session.created);
		// Strictly later, so a chain of continuations cannot loop.
		if (!(Date.parse(previous.created) < began)) continue;
		if (!(Date.parse(previous.modified) <= began + CONTINUATION_SETTLE_MS)) continue;
		const other = successors.get(previous.path);
		if (!other || Date.parse(session.modified) > Date.parse(other.modified)) successors.set(previous.path, session);
	}
	const heirOf = (session: SessionInfo): SessionInfo => {
		let heir = session;
		for (let next = successors.get(heir.path); next; next = successors.get(heir.path)) heir = next;
		return heir;
	};

	const parentOf = sessionParents(all);
	const familyRoot = (session: SessionInfo): SessionInfo => {
		let top = session;
		for (let next = parentOf.get(top.path); next; next = parentOf.get(top.path)) top = next;
		return heirOf(top);
	};

	const heirs = new Map<string, string>();
	const sessions: SessionInfo[] = [];
	for (const session of all) {
		const heir = heirOf(session);
		if (heir !== session) {
			heirs.set(session.path, heir.path);
			continue;
		}
		const parent = parentOf.get(session.path);
		if (!parent) {
			sessions.push(session);
			continue;
		}
		const shownParent = session.subagent ? heirOf(parent) : familyRoot(session);
		sessions.push({ ...session, parentSessionPath: shownParent === session ? undefined : shownParent.path });
	}
	return { sessions, heirs };
}

/** The sessions a person would pick from: listed, without subagent transcripts. */
export function browsableSessions(all: readonly SessionInfo[]): SessionInfo[] {
	return listedSessions(all).sessions.filter(session => !isSubagentSession(session));
}

interface SessionPreviewOptions {
	pinned: (session: SessionInfo) => boolean;
	recency: (session: SessionInfo) => number;
	essential: (session: SessionInfo) => boolean;
	partnerPath: (rootPath: string) => string | undefined;
	limit: number;
	expanded: boolean;
}

interface SessionFamilyRank {
	pinned: boolean;
	essential: boolean;
	lastUsed: number;
}

/**
 * Rank roots by the newest member of each family. The preview also keeps any
 * pinned or essential family and both roots of a split pair. Children remain in
 * tree order and do not consume preview slots.
 */
export function previewSessionForest(
	nodes: readonly SessionNode[],
	{ pinned, recency, essential, partnerPath, limit, expanded }: SessionPreviewOptions,
): { roots: SessionNode[]; byPath: ReadonlyMap<string, SessionNode>; hidden: number } {
	const visit = (node: SessionNode, rank: SessionFamilyRank) => {
		rank.pinned ||= pinned(node.session);
		rank.essential ||= essential(node.session);
		rank.lastUsed = Math.max(rank.lastUsed, recency(node.session));
		for (const child of node.children) visit(child, rank);
	};
	const byPath = new Map<string, SessionNode>();
	const ranked = nodes.map(node => {
		byPath.set(node.session.path, node);
		const entry = { node, pinned: false, essential: false, lastUsed: Number.NEGATIVE_INFINITY };
		visit(node, entry);
		return entry;
	});
	ranked.sort((a, b) => b.lastUsed - a.lastUsed);

	const visible = ranked.length > limit ? new Set<string>() : null;
	if (visible) {
		for (const [index, entry] of ranked.entries()) {
			if (index >= limit && !entry.pinned && !entry.essential) continue;
			const path = entry.node.session.path;
			visible.add(path);
			const partner = partnerPath(path);
			if (partner && byPath.has(partner)) visible.add(partner);
		}
	}

	const roots: SessionNode[] = [];
	for (const pinnedFirst of [true, false]) {
		for (const entry of ranked) {
			if (entry.pinned === pinnedFirst && (expanded || !visible || visible.has(entry.node.session.path))) {
				roots.push(entry.node);
			}
		}
	}
	return { roots, byPath, hidden: visible ? ranked.length - visible.size : 0 };
}
