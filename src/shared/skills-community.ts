/**
 * Community skills: the shapes the Skills page's Community tab renders.
 *
 * The catalogue lives at skills.sh (a public, unauthenticated index of agent
 * skills published in public repositories). Main fetches it, keeps it on disk,
 * and streams the rest of each board in the background; the renderer never
 * talks to the network. Everything below is validated in main before it crosses
 * IPC, so a hostile or malformed answer can only ever produce a shorter list -
 * never a row that installs something the user did not pick.
 */

/** The three boards skills.sh ranks skills by. */
export const COMMUNITY_BOARDS = ["all-time", "trending", "hot"] as const;
export type CommunityBoard = (typeof COMMUNITY_BOARDS)[number];

/** One catalogue row: a name, a provenance, and the quality signals the index exposes. */
export interface CommunitySkill {
	/** `owner/repo/slug` - the stable id used to download and to dedupe rows. */
	id: string;
	/** The slug inside its repository, which is also the install folder name. */
	skillId: string;
	/** Display name as published. */
	name: string;
	/** `owner/repo`, shown as the provenance line under the name. */
	source: string;
	/** Install count from skills.sh - the only quality signal the index exposes. */
	installs: number;
	/** skills.sh's own "official" mark, when the index sets one. */
	official?: boolean;
}

/** One board as the page needs it: rows in rank order, plus how much is loaded. */
export interface CommunityBoardState {
	skills: CommunitySkill[];
	/** The index's own row count for this board, so the page can say "of N". */
	total: number;
	/** Whether every page has been fetched. */
	complete: boolean;
}

export type IpcSkillsCommunityCatalogResult =
	| {
			status: "ok";
			boards: Record<CommunityBoard, CommunityBoardState>;
			/** Absolute user skills folder every install lands in - the page shows it. */
			root: string;
			/** Slug -> folder, for skills already on disk (the row says "Installed"). */
			installed: Record<string, string>;
			/** When the cached catalogue was last refreshed, ISO 8601. */
			fetchedAt: string;
	  }
	| { status: "error"; error: string };

/** One board's answer after the background pager fetched another page. */
export interface IpcSkillsCommunityCatalogUpdate {
	board: CommunityBoard;
	state: CommunityBoardState;
}

export interface IpcSkillsCommunityPreviewPayload {
	/** `owner/repo/slug`, exactly as a catalogue row reported it. */
	id: string;
}

export type IpcSkillsCommunityPreviewResult =
	| {
			status: "ok";
			id: string;
			/** Every file the skill ships, relative to its folder. */
			files: string[];
			/** The skill's instructions, which is what a reader is previewing. */
			skillMd: string;
	  }
	| { status: "error"; error: string };

export interface IpcSkillsCommunityInstallPayload {
	/** `owner/repo/slug`, exactly as a catalogue row reported it. */
	id: string;
}

export type IpcSkillsCommunityInstallResult =
	| {
			status: "ok";
			/** The id that was installed, echoed back so the row can lock itself. */
			id: string;
			/** Display name: the published slug (the page already shows its own label). */
			name: string;
			/** `owner/repo` the files came from. */
			source: string;
			/** Absolute folder the files were written into. */
			dir: string;
			/** Absolute path of the user skills root the install went into. */
			root: string;
			/** How many files landed on disk. */
			files: number;
	  }
	| { status: "error"; error: string };

/**
 * Whether a string is the `owner/repo/slug` shape this module accepts. Every
 * segment is a plain slug: no dots, no separators, nothing that could become a
 * path once it is used as a folder name. The catalogue carries rows that do not
 * fit (`site.tld/slug`, `owner/repo/a:b`); those are browsable and previewable
 * but never installed.
 */
export function isCommunitySkillId(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const parts = value.split("/");
	if (parts.length !== 3) return false;
	return parts.every(part => /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(part) && part !== "." && part !== "..");
}

/** The folder name an id installs into: its slug segment. */
export function communitySkillSlug(id: string): string | null {
	if (!isCommunitySkillId(id)) return null;
	const slug = id.split("/")[2];
	// A leading dot would make the folder hidden; `..`/`.` are already excluded.
	return slug && !slug.startsWith(".") ? slug : null;
}
