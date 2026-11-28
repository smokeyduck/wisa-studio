import { isDeepStrictEqual } from "node:util";
import type { AgentNotchSettings } from "../shared/agent-notch";
import { normalizeAgentNotchSettings } from "./agent-notch-state";

export function encodeNotchSetup(settings: AgentNotchSettings): string {
	return `${JSON.stringify({ format: "wisa-notch", version: 1, settings: normalizeAgentNotchSettings(settings) }, null, 2)}\n`;
}

/** A preset is data, never commands, credentials or permission grants. */
export function decodeNotchSetup(text: string): AgentNotchSettings {
	if (Buffer.byteLength(text, "utf8") > 65_536) throw new Error("Notch setup exceeds 64 KiB");
	const value: unknown = JSON.parse(text);
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Notch setup");
	const setup = value as Record<string, unknown>;
	if (setup.format !== "wisa-notch" || setup.version !== 1)
		throw new Error("Unsupported Notch setup format or version");
	const settings = normalizeAgentNotchSettings(setup.settings);
	if (!isDeepStrictEqual(settings, setup.settings)) throw new Error("Invalid Notch setup settings");
	return settings;
}
