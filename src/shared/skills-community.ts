/**
 * Community skills: the shapes the Skills page's Community tab renders.
 *
 * The catalog lives at skills.sh (a public, unauthenticated index of agent
 * skills published in public repositories). Main fetches it; the renderer never
 * talks to the network. Everything below is validated in main before it crosses
 * IPC, so a hostile or malformed answer can only ever produce a shorter list —
 * never a row that installs something the user did not pick.
 */

/** One search hit, as the page needs it: a name, a provenance, and a quality signal. */
export interface CommunitySkill {
	/** `owner/repo/slug` — the stable id used to download and to dedupe rows. */
	id: string;
	/** The slug inside its repository, which is also the install folder name. */
	skillId: string;
	/** Display name as published. */
	name: string;
	/** `owner/repo`, shown as the provenance line under the name. */
	source: string;
	/** Install count from skills.sh — the only quality signal the index exposes. */
	installs: number;
}

export type IpcSkillsCommunitySearchResult =
	| {
			status: "ok";
			/** The query these rows answer, so a late answer cannot overwrite a newer one. */
			query: string;
			skills: CommunitySkill[];
			/** Absolute user skills folder every install lands in — the page shows it. */
			root: string;
			/** Slug → folder, for skills already on disk (the row says "Installed"). */
			installed?: Record<string, string>;
	  }
	| { status: "error"; error: string };

export interface IpcSkillsCommunityInstallPayload {
	/** `owner/repo/slug`, exactly as a search row reported it. */
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

/** skills.sh answers HTTP 400 for anything shorter, so the page does not ask. */
export const COMMUNITY_QUERY_MIN_LENGTH = 2;

/**
 * Whether a string is the `owner/repo/slug` shape this module accepts. Every
 * segment is a plain slug: no dots, no separators, nothing that could become a
 * path once it is used as a folder name.
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
