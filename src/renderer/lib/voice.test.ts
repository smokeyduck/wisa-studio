import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../../shared/rpc-types";
import { useSettingsStore } from "../stores/settings";
import { useTabsStore } from "../stores/tabs";
import { handleVoiceEvent, previewVietnameseVoice, startVoiceAutoSpeak, stopTabSpeech, stopVoicePreview } from "./voice";

const speak = vi.fn(async (_text: string, _language: string, _voice?: string) => ({ ok: true }));
const stopSpeech = vi.fn(async () => undefined);
const synthesizeSpeech = vi.fn();
let cleanup: () => void;

beforeEach(() => {
	speak.mockClear();
	stopSpeech.mockClear();
	synthesizeSpeech.mockClear();
	vi.stubGlobal("window", {
		omp: {
			prefs: { get: async () => undefined },
			rpc: { synthesizeSpeech },
			system: { speak, stopSpeech },
		},
	});
	useTabsStore.setState({ activeTabId: "tab-a" });
	useSettingsStore.setState({ speechEnabled: true, speechMode: "assistant" });
	cleanup = startVoiceAutoSpeak();
});

afterEach(() => {
	cleanup();
	useSettingsStore.getState().reset();
	useTabsStore.setState({ activeTabId: null });
	vi.unstubAllGlobals();
});

function message(content: string, role: AgentMessage["role"] = "assistant", tabId = "tab-a"): void {
	handleVoiceEvent(tabId, { type: "message_end", message: { role, content } });
}

describe("live speech queue", () => {
	it("preserves assistant and tool result order while local playback is busy", async () => {
		useSettingsStore.setState({ speechMode: "all" });
		const first = Promise.withResolvers<{ ok: boolean }>();
		speak.mockImplementationOnce(() => first.promise);
		handleVoiceEvent("tab-a", { type: "agent_start" });
		message("Xin chào");
		message("Đã chạy công cụ", "toolResult");
		message("Đã xong");
		await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
		first.resolve({ ok: true });
		await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(3));
		expect(speak.mock.calls.map(([text]) => text)).toEqual(["Xin chào", "Đã chạy công cụ", "Đã xong"]);
		expect(synthesizeSpeech).not.toHaveBeenCalled();
	});

	it("in yield mode reads only the last live assistant message after a terminal end", async () => {
		useSettingsStore.setState({ speechMode: "yield" });
		message("Tin nhắn cũ");
		handleVoiceEvent("tab-a", { type: "agent_start" });
		message("Xin chào");
		handleVoiceEvent("tab-a", { type: "agent_end", isTerminal: false });
		message("Đã xong");
		message("Không phát từ tab khác", "assistant", "tab-b");
		expect(speak).not.toHaveBeenCalled();
		handleVoiceEvent("tab-a", { type: "agent_end", isTerminal: true });
		await vi.waitFor(() => expect(speak).toHaveBeenCalledExactlyOnceWith("Đã xong", "vi", "auto"));
	});

	it("cancels playback and queued text only for its originating tab", async () => {
		const first = Promise.withResolvers<{ ok: boolean }>();
		speak.mockImplementationOnce(() => first.promise);
		handleVoiceEvent("tab-a", { type: "agent_start" });
		message("Xin chào");
		message("Không đọc câu này");
		await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
		stopTabSpeech("tab-b");
		expect(stopSpeech).not.toHaveBeenCalled();
		useTabsStore.setState({ activeTabId: "tab-b" });
		expect(stopSpeech).toHaveBeenCalledTimes(1);
		first.resolve({ ok: true });
		handleVoiceEvent("tab-b", { type: "agent_start" });
		message("Đã mở tab mới", "assistant", "tab-b");
		await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
		expect(speak.mock.calls.map(([text]) => text)).toEqual(["Xin chào", "Đã mở tab mới"]);
	});

	it("previews only the selected Vietnamese voice and supports cancellation", async () => {
		const pending = Promise.withResolvers<{ ok: boolean }>();
		speak.mockImplementationOnce(() => pending.promise);
		previewVietnameseVoice("vais1000");
		expect(speak).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Xin chào"), "vi", "vais1000");
		stopVoicePreview();
		expect(stopSpeech).toHaveBeenCalledTimes(1);
		pending.resolve({ ok: true });
	});
});
