/**
 * Contract test for the settings store's display-settings sync: every path in
 * DISPLAY_BOOL_MAP must land on its store field (dotted agent paths onto
 * camelCase fields), and non-boolean/absent values must be ignored so stale
 * defaults never clobber live state.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpcResponse } from "../../shared/rpc-types";
import { useSettingsStore } from "./settings";

const getSettings = vi.fn<(paths?: string[]) => Promise<RpcResponse>>();
const setSetting = vi.fn<(command: { type: string; path?: string; value?: unknown }) => Promise<RpcResponse>>(
	async () => ({ type: "response", command: "set_setting", success: true, data: { value: null } }),
);
/** The store routes every RPC through one `command`; only writes are recorded separately. */
const command = vi.fn((cmd: { type: string; paths?: string[]; path?: string; value?: unknown }) =>
	cmd.type === "set_setting" ? setSetting(cmd) : getSettings(cmd.paths),
);

// linkedom-less store test: install a minimal omp bridge on the global scope
// (node env has no `window`; the store resolves it via globalThis).
const ompGlobal = globalThis as unknown as {
	window: { omp: { rpc: { getSettings: typeof getSettings; command: typeof command } } };
};
ompGlobal.window = { omp: { rpc: { getSettings, command } } };

function success(values: Record<string, unknown>): Promise<RpcResponse> {
	return Promise.resolve({ type: "response", command: "get_settings", success: true, data: { values } });
}

afterEach(() => {
	getSettings.mockReset();
	setSetting.mockClear();
	useSettingsStore.getState().reset();
});

describe("settings store display sync", () => {
	it("maps display.*, tui.titleState, and goal.statusInFooter onto store fields", async () => {
		getSettings.mockResolvedValueOnce(
			await success({
				hideThinkingBlock: true,
				proseOnlyThinking: false,
				omitThinking: true,
				"display.showTokenUsage": true,
				"display.collapseCompacted": false,
				"tui.titleState": false,
				"goal.statusInFooter": false,
			}),
		);
		await useSettingsStore.getState().syncDisplaySettings();
		const state = useSettingsStore.getState();
		expect(state.showTokenUsage).toBe(true);
		expect(state.collapseCompacted).toBe(false);
		expect(state.titleState).toBe(false);
		expect(state.goalStatusInFooter).toBe(false);
		expect(state.hideThinkingBlock).toBe(true);
		expect(state.proseOnlyThinking).toBe(false);
		expect(state.omitThinking).toBe(true);
	});

	it("ignores absent and non-boolean values instead of clobbering state", async () => {
		useSettingsStore.setState({ showTokenUsage: true, titleState: false });
		getSettings.mockResolvedValueOnce(
			await success({ "display.showTokenUsage": "yes", "goal.statusInFooter": true }),
		);
		await useSettingsStore.getState().syncDisplaySettings();
		const state = useSettingsStore.getState();
		expect(state.showTokenUsage).toBe(true);
		expect(state.titleState).toBe(false);
		expect(state.goalStatusInFooter).toBe(true);
	});

	it("reads display.pinnedAgents and ignores modes the dock does not know", async () => {
		getSettings.mockResolvedValueOnce(await success({ "display.pinnedAgents": "full" }));
		await useSettingsStore.getState().syncDisplaySettings();
		expect(useSettingsStore.getState().pinnedAgents).toBe("full");

		getSettings.mockResolvedValueOnce(await success({ "display.pinnedAgents": "sideways" }));
		await useSettingsStore.getState().syncDisplaySettings();
		expect(useSettingsStore.getState().pinnedAgents).toBe("full");
	});

	it("keeps current values when the read fails", async () => {
		useSettingsStore.setState({ collapseCompacted: false });
		getSettings.mockRejectedValueOnce(new Error("sidecar down"));
		await useSettingsStore.getState().syncDisplaySettings();
		expect(useSettingsStore.getState().collapseCompacted).toBe(false);
	});

	it("keeps the latest sync when an older sidecar reply arrives last", async () => {
		const older = Promise.withResolvers<RpcResponse>();
		const newer = Promise.withResolvers<RpcResponse>();
		getSettings.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

		const firstSync = useSettingsStore.getState().syncDisplaySettings();
		const secondSync = useSettingsStore.getState().syncDisplaySettings();
		newer.resolve({
			type: "response",
			command: "get_settings",
			success: true,
			data: { values: { "tui.titleState": false } },
		});
		await secondSync;
		older.resolve({
			type: "response",
			command: "get_settings",
			success: true,
			data: { values: { "tui.titleState": true } },
		});
		await firstSync;

		expect(useSettingsStore.getState().titleState).toBe(false);
	});
});

describe("speech defaults seeding", () => {
	it("turns dictation on with Vietnamese when the settings are unset", async () => {
		// No layers = the profile never chose; the schema defaults are what it reads.
		getSettings.mockResolvedValue({
			type: "response",
			command: "get_settings",
			success: true,
			data: {
				values: { "stt.enabled": false, "stt.language": "en" },
				provenance: {
					"stt.enabled": { layers: [] },
					"stt.language": { layers: [] },
					emojiAutocomplete: { layers: [] },
					"tui.reactions": { layers: [] },
					"title.icons": { layers: [] },
				},
			},
		});
		await useSettingsStore.getState().syncDisplaySettings();
		expect(setSetting).toHaveBeenCalledWith({ type: "set_setting", path: "stt.enabled", value: true });
		expect(setSetting).toHaveBeenCalledWith({ type: "set_setting", path: "stt.language", value: "vi" });
		// The display defaults travel with the same seed pass.
		expect(setSetting).toHaveBeenCalledWith({ type: "set_setting", path: "emojiAutocomplete", value: false });
		expect(setSetting).toHaveBeenCalledWith({ type: "set_setting", path: "tui.reactions", value: false });
		expect(setSetting).toHaveBeenCalledWith({ type: "set_setting", path: "title.icons", value: "boring" });
		// The seeded values land on the store without waiting for another sync.
		expect(useSettingsStore.getState().sttEnabled).toBe(true);

		// Seeded now, so a later sync sees the layers and writes nothing.
		setSetting.mockClear();
		getSettings.mockResolvedValue({
			type: "response",
			command: "get_settings",
			success: true,
			data: {
				values: { "stt.enabled": true, "stt.language": "" },
				provenance: { "stt.enabled": { layers: ["global"] }, "stt.language": { layers: ["global"] } },
			},
		});
		await useSettingsStore.getState().syncDisplaySettings();
		expect(setSetting).not.toHaveBeenCalled();
	});

	it("leaves a profile that already chose alone, even when it chose off", async () => {
		getSettings.mockResolvedValueOnce({
			type: "response",
			command: "get_settings",
			success: true,
			data: {
				values: { "stt.enabled": false, "stt.language": "en" },
				provenance: {
					"stt.enabled": { layers: ["global"] },
					"stt.language": { layers: ["global"] },
				},
			},
		});
		await useSettingsStore.getState().syncDisplaySettings();
		expect(setSetting).not.toHaveBeenCalled();
		expect(useSettingsStore.getState().sttEnabled).toBe(false);
	});
});
