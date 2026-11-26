import { useSyncExternalStore } from "react";
import type { AgentSessionEvent, SynthesizeSpeechResult } from "../../shared/rpc-types";
import {
	detectSpeechLanguage,
	type VietnameseVoice,
	vietnameseVoicePreference,
	VIETNAMESE_VOICE_PREF,
} from "../../shared/speech-language";
import { useSessionStore } from "../stores/session";
import { type SettingsStore, useSettingsStore } from "../stores/settings";
import { useTabsStore } from "../stores/tabs";
import { toast } from "../stores/toast";
import { translate } from "./i18n";
import { messageText } from "./messages";
import { focusedTabRpc, type TabRpc } from "./tab-rpc";

interface Utterance {
	text: string;
	rpc?: Pick<TabRpc, "synthesizeSpeech">;
	voice?: VietnameseVoice;
	speed?: number;
}

interface Playback {
	tabId: string | null;
	controller: AbortController;
	queue: Utterance[];
	osPlaying: boolean;
}

let playback: Playback | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useSpeechPlaying(tabId: string | null): boolean {
	return useSyncExternalStore(subscribe, () => playback !== null && playback.tabId === tabId);
}

function announcePlayback(): void {
	for (const listener of listeners) listener();
}

function stopPlayback(tabId: string | null): void {
	const active = playback;
	if (!active || active.tabId !== tabId) return;
	playback = null;
	active.controller.abort();
	active.queue.length = 0;
	if (active.osPlaying) void window.omp.system.stopSpeech().catch(() => undefined);
	announcePlayback();
}

function enqueue(tabId: string | null, utterance: Utterance): void {
	if (playback && playback.tabId === tabId) {
		playback.queue.push(utterance);
		return;
	}
	if (playback) stopPlayback(playback.tabId);
	const active: Playback = { tabId, controller: new AbortController(), queue: [utterance], osPlaying: false };
	playback = active;
	announcePlayback();
	void drain(active);
}

async function drain(active: Playback): Promise<void> {
	const { signal } = active.controller;
	while (!signal.aborted) {
		const next = active.queue.shift();
		if (!next) break;
		const { text, rpc } = next;
		const language = next.voice !== undefined ? "vi" : detectSpeechLanguage(text);
		try {
			if (language === "en" && rpc && (await speakLocally(rpc, text, next.speed ?? 1, signal))) continue;
			if (signal.aborted) break;
			const voice =
				language === "vi"
					? (next.voice ?? vietnameseVoicePreference(await window.omp.prefs.get(VIETNAMESE_VOICE_PREF)))
					: undefined;
			if (signal.aborted) break;
			active.osPlaying = true;
			const result = await window.omp.system.speak(text, language, voice);
			if (!signal.aborted && !result.ok) {
				toast({
					variant: "error",
					title: translate("voice.speak.failed"),
					message: result.missingVoice ? translate("voice.speak.missingVoice", { language }) : result.error ?? "",
				});
			}
		} catch (cause) {
			if (!signal.aborted) toast({ variant: "error", title: translate("voice.speak.failed"), message: String(cause) });
		} finally {
			active.osPlaying = false;
		}
	}
	if (playback === active) {
		playback = null;
		announcePlayback();
	}
}

async function speakLocally(
	rpc: Pick<TabRpc, "synthesizeSpeech">,
	text: string,
	speed: number,
	signal: AbortSignal,
): Promise<boolean> {
	const response = await rpc.synthesizeSpeech(text).catch(() => undefined);
	if (!response?.success || signal.aborted) return false;
	const data = response.data as SynthesizeSpeechResult | undefined;
	if (!data?.audioBase64) return false;
	const url = URL.createObjectURL(new Blob([base64ToBytes(data.audioBase64)], { type: data.mimeType || "audio/wav" }));
	const audio = new Audio(url);
	audio.playbackRate = Math.max(0.8, Math.min(1.3, speed));
	const done = Promise.withResolvers<boolean>();
	const stop = () => {
		audio.pause();
		done.resolve(false);
	};
	audio.onended = () => done.resolve(true);
	audio.onerror = () => done.resolve(false);
	signal.addEventListener("abort", stop, { once: true });
	try {
		void audio.play().catch(() => done.resolve(false));
		return await done.promise;
	} finally {
		signal.removeEventListener("abort", stop);
		URL.revokeObjectURL(url);
	}
}

interface SpeechRun {
	tabId: string;
	mode: SettingsStore["speechMode"];
	last: string;
	muted: boolean;
}

let run: SpeechRun | null = null;

export function stopTabSpeech(tabId: string | null = useTabsStore.getState().activeTabId): void {
	if (tabId === null) return;
	if (run?.tabId === tabId) run.muted = true;
	stopPlayback(tabId);
}

export function previewVietnameseVoice(voice: VietnameseVoice): void {
	enqueue(null, { text: "Xin chào! Tôi là trợ lý WISA. Đây là bản nghe thử giọng tiếng Việt.", voice });
}

export function stopVoicePreview(): void {
	stopPlayback(null);
}

/** Only live RPC events for the focused tab reach the speech queue; hydration never does. */
export function handleVoiceEvent(tabId: string, event: AgentSessionEvent): void {
	if (tabId !== (useTabsStore.getState().activeTabId ?? "")) return;
	const { speechEnabled, speechMode, speechSpeed } = useSettingsStore.getState();
	if (event.type === "agent_start") {
		if (speechEnabled) run ??= { tabId, mode: speechMode, last: "", muted: false };
		return;
	}
	if (run?.tabId !== tabId) return;
	if (event.type === "message_end") {
		const { message } = event;
		if (message.stopReason === "aborted") {
			stopTabSpeech(tabId);
			return;
		}
		if (!speechEnabled || run.muted || (message.role !== "assistant" && message.role !== "toolResult")) return;
		const text = messageText(message);
		if (!text) return;
		if (run.mode === "yield" && message.role === "assistant") run.last = text;
		if (run.mode === "all" || (run.mode === "assistant" && message.role === "assistant")) {
			enqueue(tabId, { text, rpc: focusedTabRpc(), speed: speechSpeed });
		}
	} else if (event.type === "agent_end" && event.isTerminal !== false) {
		const finished = run;
		run = null;
		const aborted = event.messages?.findLast(message => message.role === "assistant")?.stopReason === "aborted";
		if (aborted) stopPlayback(tabId);
		else if (speechEnabled && finished.mode === "yield" && !finished.muted && finished.last) {
			enqueue(tabId, { text: finished.last, rpc: focusedTabRpc(), speed: speechSpeed });
		}
	}
}

export function startVoiceAutoSpeak(): () => void {
	const unsubscribeTabs = useTabsStore.subscribe((state, previous) => {
		if (state.activeTabId === previous.activeTabId) return;
		stopPlayback(previous.activeTabId ?? "");
		run = null;
	});
	const unsubscribeSession = useSessionStore.subscribe((state, previous) => {
		if (
			state.sessionId !== previous.sessionId ||
			state.switchPending ||
			(state.status !== previous.status && state.status !== "ready")
		) {
			stopPlayback(useTabsStore.getState().activeTabId ?? "");
			run = null;
		}
	});
	const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
		if (!state.speechEnabled && previous.speechEnabled) stopTabSpeech();
	});
	return () => {
		unsubscribeTabs();
		unsubscribeSession();
		unsubscribeSettings();
		if (playback) stopPlayback(playback.tabId);
		run = null;
	};
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
	const binary = atob(base64);
	// A fresh ArrayBuffer keeps the type BlobPart-compatible
	// (Uint8Array<ArrayBufferLike> is rejected under TS's generic ArrayBuffer).
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
