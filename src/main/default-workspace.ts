import * as fs from "node:fs";
import * as path from "node:path";
import { agentDir } from "./agent-paths";

/**
 * The instruction file the GUI seeds into the Work workspace. Work sessions run
 * the same agent as project sessions; what makes them different is the folder
 * they run in, and the agent can only tell the difference if something says so.
 * Without it the agent guesses: it looks for a repo, a build, tests — and
 * explains that none exist, in a workspace whose whole point is that there is
 * nothing to check out.
 *
 * Seeded once, and only when missing: a user who edits or deletes it keeps the
 * last word.
 */
const WORK_AGENTS_MD = `# Work workspace

This folder is WISA STUDIO's own workspace for Work sessions, not a project.

- There is no repository here and nothing to clone: do not look for git history,
  a build, tests or a lint setup, and do not try to create them.
- Do the task itself - drafting, planning, research, writing, analysis - and
  write the files the task needs into this folder.
- A request that needs a codebase (reading, changing or running someone's
  project) belongs in a Code session with that project's folder open. Say so
  instead of working around it.

Files you create here persist; the folder is yours.
`;

/** GUI-owned workspace for Work mode. It runs the full agent, never --chat. */
export function ensureDefaultWorkspace(): string {
	const cwd = path.resolve(agentDir(), "..", "work");
	fs.mkdirSync(cwd, { recursive: true });
	const agentsMd = path.join(cwd, "AGENTS.md");
	try {
		fs.writeFileSync(agentsMd, WORK_AGENTS_MD, { flag: "wx" });
	} catch {
		// Already there (EEXIST) or unwritable: an existing file wins, and a
		// workspace the user cannot write to still runs.
	}
	return cwd;
}
