import * as os from "node:os";
import * as path from "node:path";

let directory = path.join(os.homedir(), ".wisa-studio", "agent");

/** Selected by the application before any profile consumer starts. */
export function configureAgentProfile(agentDirectory: string): void {
	directory = agentDirectory;
}

/** Desktop configuration never inherits an enclosing omp session's profile. */
export function agentDir(): string {
	return directory;
}
