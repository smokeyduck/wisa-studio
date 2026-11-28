import {
	ArrowUp,
	Check,
	ChevronDown,
	ClipboardList,
	History,
	ListEnd,
	Loader2,
	Mic,
	Paperclip,
	Plus,
	SlidersHorizontal,
	Square,
	SquarePen,
	VolumeX,
	X,
	Zap,
} from "lucide-react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type AvailableCommand, type ImageContent, isThinkingLevel } from "../../../shared/rpc-types";
import { useFollowUpModifierHeld } from "../../hooks/use-follow-up-modifier";
import { useOverlayPresence } from "../../hooks/use-overlay-presence";
import { splitAttachmentMentions } from "../../lib/attachment-mentions";
import { buildCurrentCommandMenu, runSessionCommand, withGuiNativeCommands } from "../../lib/command-registry";
import { isDevOverlayEvent } from "../../lib/dev-overlay";
import { useDisplayPreference } from "../../lib/display-preferences";
import { tryEmojiInlineReplace } from "../../lib/emoji";
import { describeError } from "../../lib/errors";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { isImeKeyEvent } from "../../lib/ime";
import { parseComposerMode } from "../../lib/input-modes";
import { effectiveOverrides, FOLLOW_UP_CHORD, isComposerShortcut, isFollowUpSend, onEscape } from "../../lib/keymap";
import { abortActiveTurn } from "../../lib/messages";
import { modelLabel } from "../../lib/model-label";
import { manufacturerLabel } from "../../lib/model-manufacturer";
import {
	dropReferencedPastes,
	expandPasteMarkers,
	isMarkerSized,
	pasteMarkerText,
	shouldOfferPasteMenu,
	storePaste,
	wrapPasteInAttachmentBlock,
} from "../../lib/paste-blobs";
import { manufacturerIcon } from "../../lib/provider-brand";
import { parseQueueShorthand, splitQueuedMessages } from "../../lib/queue-input";
import { insertQuote } from "../../lib/quote-selection";
import { supportsFastMode, supportsPriorityMode, supportsUltrafastMode } from "../../lib/service-tier";
import { useTabRpc } from "../../lib/tab-rpc";
import { stopTabSpeech, useSpeechPlaying } from "../../lib/voice";
import { composerFileKey, useComposerStore } from "../../stores/composer";
import { useInputHistoryStore } from "../../stores/input-history";
import { type ModelSpeed, useModelStore } from "../../stores/model";
import { type SessionStore, useSessionStore } from "../../stores/session";
import { sessionRuntimeStore, useRuntimeTabId } from "../../stores/session-runtime-context";
import { useSettingsStore } from "../../stores/settings";
import { useActiveTabKind, useTabsStore } from "../../stores/tabs";
import { toast } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";
import { useTabIsWork } from "../../stores/workspace-mode";
import { ContextMenu, type ContextMenuAnchor } from "../common/ContextMenu";
import { FileAttachmentCard } from "../common/FileAttachmentCard";
import { ZoomableImage } from "../common/ImageViewer";
import { AdvisorBadge } from "./AdvisorBadge";
import { ApprovalControl } from "./ApprovalControl";
import { ChatContextBar } from "./ChatContextBar";
import { CompletionMenuList } from "./CompletionMenuList";
import { ComposerModes } from "./ComposerModes";
import { ContextStrategyBar } from "./ContextStrategyBar";
import { DictationStrip } from "./DictationStrip";
import { HistorySearchOverlay } from "./HistorySearchOverlay";
import { listMentionFiles, mentionFileCache } from "./input-area-utils";
import { ThinkingControl } from "./ThinkingControl";
import { type CompletionItem, type CompletionMenu, useCompletionMenu } from "./use-completion-menu";
import { useComposerFiles } from "./use-composer-files";
import { useComposerMenuPosition } from "./use-composer-menu-position";
import { useComposerSubmit } from "./use-composer-submit";
import { useDictation } from "./use-dictation";
import { WallpaperControl } from "./WallpaperControl";
import "./composer-model-material.css";

const MENTION_FS_DEBOUNCE_MS = 150;

/** Local brand tints, keyed by the same manufacturer aliases as the bundled marks. */
const COMPOSER_MODEL_COLORS: Readonly<Record<string, string>> = {
	openai: "#10a37f",
	openaicodex: "#10a37f",
	gpt: "#10a37f",
	chatgpt: "#10a37f",
	codex: "#10a37f",
	anthropic: "#d97757",
	claude: "#d97757",
	google: "#4285f4",
	googleai: "#4285f4",
	googlevertex: "#4285f4",
	gemini: "#4285f4",
	xai: "#8899a6",
	grok: "#8899a6",
	meta: "#0866ff",
	metallama: "#0866ff",
	metaai: "#0866ff",
	llama: "#0866ff",
	mistral: "#f5a623",
	mistralai: "#f5a623",
	mixtral: "#f5a623",
	codestral: "#f5a623",
	deepseek: "#4d6bfe",
	deepseekai: "#4d6bfe",
	qwen: "#615ced",
	qwenai: "#615ced",
	alibaba: "#615ced",
	dashscope: "#615ced",
	tongyi: "#615ced",
	minimax: "#ed4e68",
	minimaxi: "#ed4e68",
	moonshot: "#7884e8",
	moonshotai: "#7884e8",
	kimi: "#7884e8",
	kimicode: "#7884e8",
	zai: "#5378f6",
	zhipu: "#5378f6",
	zhipuai: "#5378f6",
	glm: "#5378f6",
	nvidia: "#76b900",
	stepfun: "#2878ff",
	capcut: "#25a9b8",
};

/**
 * Composer: auto-growing textarea, Enter to send / Shift+Enter for newline,
 * image paste, @file mentions, /command completion, and an abort button while
 * the agent streams. While it streams Enter steers the turn and ⌘Enter (⌃Enter
 * off macOS) queues a follow-up, which holding the modifier previews.
 */
export function InputArea() {
	const { attachFiles, attachImages, readingImages, readOnly: collabReadOnly } = useComposerFiles();
	const isStreaming = useSessionStore(s => s.isStreaming);
	const t = useT();
	const rpc = useTabRpc();
	const contextTabId = useRuntimeTabId();
	const activeTabId = useTabsStore(state => state.activeTabId);
	const runtimeTabId = contextTabId ?? activeTabId;
	const routeReady = runtimeTabId !== null;
	const speechPlaying = useSpeechPlaying(runtimeTabId);
	/** Chat tabs are tool-free: approval/mode chrome is meaningless there. */
	const tabKind = useActiveTabKind();
	const isChat = tabKind === "chat";
	// Work sessions run in the GUI's own folder, so "build / explain / fix" (and
	// the `/` command menu) describe a project that is not there.
	const isWork = useTabIsWork(runtimeTabId);
	const status = useSessionStore(s => s.status);
	const sessionId = useSessionStore(s => s.sessionId);
	const placeholder =
		status !== "ready"
			? t("input.placeholder.connecting")
			: isStreaming
				? t("input.placeholder.streaming", { chord: FOLLOW_UP_CHORD })
				: isChat
					? t("input.placeholder.chat")
					: isWork
						? t("input.placeholder.work")
						: t("input.placeholder.idle");
	const queuedMessageCount = useSessionStore(s => s.queuedMessageCount);
	const cwd = useSessionStore(s => s.cwd);
	const model = useModelStore(s => s.model);
	/** Display name for the model trigger: catalog name, else a prettified id. */
	const modelName = modelLabel(model);
	// A recognizable family wins over a gateway namespace (e.g. openrouter/claude-sonnet-4).
	const modelFamilyManufacturer = model
		? manufacturerLabel({ id: model.id.slice(model.id.lastIndexOf("/") + 1) })
		: "";
	const modelManufacturer = modelFamilyManufacturer || (model ? manufacturerLabel(model) : "");
	const ModelBrand = manufacturerIcon(modelManufacturer);
	const manufacturerKey = modelManufacturer.toLowerCase().replace(/[^a-z0-9]+/g, "");
	const modelMaterialColor = Object.hasOwn(COMPOSER_MODEL_COLORS, manufacturerKey)
		? COMPOSER_MODEL_COLORS[manufacturerKey]
		: undefined;
	const fastModeActive = useModelStore(s => s.fastModeActive && supportsFastMode(s.model));
	const modelPickerOpen = useUiStore(s => s.modelPickerOpen) && runtimeTabId === activeTabId;
	/** Agent `stt.enabled` setting: microphone dictation button in the composer. */
	const sttEnabled = useSettingsStore(s => s.sttEnabled);
	/** Agent `paste.largeMenuThreshold` setting: line count that triggers the paste menu. */
	const pasteMenuThreshold = useDisplayPreference("pasteMenuThreshold");
	const collapseLargePastes = useUiStore(s => s.collapseLargePastes);
	/** Agent `emojiAutocomplete` setting: emoji popup/inline/submit expansion. */
	const emojiAutocomplete = useDisplayPreference("emojiAutocomplete");

	// Draft lives in the composer store (not local state) so session-tab
	// switches snapshot/restore it per tab. Value + updater-form setter are
	// drop-in for the old useState pair.
	const text = useComposerStore(s => s.draft);
	const setText = useComposerStore(s => s.setDraft);
	const images = useComposerStore(s => s.images);
	const setImages = useComposerStore(s => s.setImages);
	const attachedFiles = useComposerStore(s => s.files);
	const removeFile = useComposerStore(s => s.removeFile);
	const [menu, setMenu] = useState<CompletionMenu | null>(null);
	const [availableCommands, setCommands] = useState<AvailableCommand[]>(() => withGuiNativeCommands([]));
	const priorityAvailable = supportsPriorityMode(model);
	const commands = useMemo(
		() => (priorityAvailable ? availableCommands : availableCommands.filter(command => command.name !== "fast")),
		[availableCommands, priorityAvailable],
	);
	const sending = useComposerStore(state => state.sending);
	const setSending = useComposerStore(state => state.setSending);
	const submissionUncertain = useComposerStore(state => state.submissionUncertain);
	const setSubmissionUncertain = useComposerStore(state => state.setSubmissionUncertain);
	const [filePaths, setFilePaths] = useState<string[]>([]);
	const [historySearchOpen, setHistorySearchOpen] = useState(false);
	const [addMenu, setAddMenu] = useState<ContextMenuAnchor | null>(null);
	/** Pending large-paste choice: the paste already happened, this picks the form. */
	const [pasteMenu, setPasteMenu] = useState<{ content: string; lineCount: number } | null>(null);
	const pasteMenuRef = useRef<HTMLDivElement>(null);
	const [runSettingsOpen, setRunSettingsOpen] = useState(false);
	const ownedRunSettingsClick = useRef<MouseEvent>(null);
	const runSettingsTriggerRef = useRef<HTMLButtonElement>(null);
	const runSettingsMenuRef = useRef<HTMLDivElement>(null);
	const { mounted: runSettingsMounted, closing: runSettingsClosing } = useOverlayPresence(
		runSettingsOpen,
		runSettingsMenuRef,
		"popover",
	);
	const runSettingsStyle = useComposerMenuPosition(runSettingsOpen, runSettingsTriggerRef, runSettingsMenuRef, 248);
	const runSettingsReady = runSettingsStyle.visibility !== "hidden";
	const composerToolbarRef = useRef<HTMLDivElement>(null);
	const [compactRunSettings, setCompactRunSettings] = useState(false);
	const approvalMode = useSettingsStore(s => s.approvalMode);
	const planModeEnabled = useSessionStore(s => s.planModeEnabled);
	const runSettingsActive = fastModeActive || planModeEnabled || approvalMode !== "yolo";
	const sessionControlsOpen = useUiStore(state => state.modesOpen);
	useEffect(() => {
		if (sessionControlsOpen) setRunSettingsOpen(false);
	}, [sessionControlsOpen]);

	useLayoutEffect(() => {
		const toolbar = composerToolbarRef.current;
		if (!toolbar) return;
		// Measure each pane independently to choose inline controls or overflow.
		// Model names, queue indicators and translated labels never decide the layout.
		const inlineMinWidth = isChat ? 420 : 560;
		const measure = () => {
			const measured = toolbar.clientWidth;
			const width = Number.isFinite(measured) && measured > 0 ? measured : window.innerWidth;
			const compact = width < inlineMinWidth;
			setCompactRunSettings(compact);
			if (!compact) setRunSettingsOpen(false);
		};
		measure();
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
		observer?.observe(toolbar);
		if (!observer) window.addEventListener("resize", measure);
		return () => {
			observer?.disconnect();
			if (!observer) window.removeEventListener("resize", measure);
		};
	}, [isChat]);

	useEffect(() => {
		if (!runSettingsOpen || !runSettingsReady) return;
		runSettingsMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
	}, [runSettingsOpen, runSettingsReady]);

	useEffect(() => {
		if (!runSettingsOpen) return;
		const onClick = (event: MouseEvent) => {
			// React bubbles portalled children through their logical parent. Don't
			// dismiss settings when a nested menu or confirmation handles a click.
			if (ownedRunSettingsClick.current === event || isDevOverlayEvent(event)) return;
			if (runSettingsTriggerRef.current?.contains(event.target as Node)) return;
			setRunSettingsOpen(false);
		};
		const onKey = (event: globalThis.KeyboardEvent) => {
			if (event.defaultPrevented) return;
			onEscape(event, () => {
				setRunSettingsOpen(false);
				runSettingsTriggerRef.current?.focus();
			});
		};
		document.addEventListener("click", onClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("click", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [runSettingsOpen]);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// A large-paste choice stays reversible until the user explicitly chooses a
	// representation. Outside click cancels it instead of silently inserting
	// the default form.
	useEffect(() => {
		if (!pasteMenu) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (target instanceof Node && pasteMenuRef.current?.contains(target)) return;
			setPasteMenu(null);
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [pasteMenu]);

	// Load persisted prompt history once (prefs IPC).
	useEffect(() => {
		void useInputHistoryStore.getState().hydrate();
	}, []);

	// `!` → bash / `$` → python / `?` → side-question composer mode (TUI parity): drives the border badge
	// and reroutes sending. Detected from the prefix alone so the badge appears
	// while the user is still typing.
	const composerMode = useMemo(() => parseComposerMode(text), [text]);
	const modeColor =
		composerMode?.mode === "bash"
			? "var(--omp-info)"
			: composerMode?.mode === "python"
				? "var(--omp-warning)"
				: composerMode?.mode === "btw"
					? "var(--omp-accent)"
					: undefined;

	// `->` / `=>` yield-queue shorthand (TUI queue-input.ts parity). The badge
	// preview and the send-path dispatch share this one parser so the "splits
	// into N" promise always matches what actually gets queued.
	const queueBody = useMemo(() => parseQueueShorthand(text), [text]);
	const queueSplitCount = useMemo(() => {
		if (queueBody === undefined || queueBody.length === 0) return 0;
		const items = splitQueuedMessages(queueBody);
		return items.length > 1 ? items.length : 0;
	}, [queueBody]);

	// Contextual argument hint (TUI ghost-text parity): the command's usage
	// hint, or the unique-matching subcommand's remainder + usage. Rendered as
	// a dim row under the textarea — an inline-after-cursor ghost needs
	// pixel-aligned overlay metrics that break with auto-grow/IME (same
	// tradeoff as the queue highlight).
	const argHint = useMemo(() => {
		if (menu || !text.startsWith("/")) return "";
		const cursor = textareaRef.current?.selectionStart ?? text.length;
		if (cursor !== text.length) return "";
		const match = /^\/([a-z-]+)(?:\s(\S*))?$/i.exec(text);
		if (!match) return "";
		const name = (match[1] ?? "").toLowerCase();
		const command = commands.find(
			candidate =>
				candidate.name.toLowerCase() === name || candidate.aliases?.some(alias => alias.toLowerCase() === name),
		);
		if (!command) return "";
		const argPrefix = match[2] ?? "";
		if (argPrefix === "") return command.input?.hint ?? "";
		if (command.subcommands?.length) {
			const lower = argPrefix.toLowerCase();
			const sub = command.subcommands.find(candidate => candidate.name.startsWith(lower));
			if (sub) return [sub.name.slice(lower.length), sub.usage].filter(Boolean).join(" ");
		}
		return "";
	}, [text, menu, commands]);

	// Keep slash commands current across sidecar startup and extension reloads.
	useEffect(() => {
		let cancelled = false;
		const applyCommands = (next: AvailableCommand[], tabId: string | null) => {
			if (!cancelled && tabId === runtimeTabId) setCommands(withGuiNativeCommands(next));
		};
		const unsubscribe =
			typeof window.omp.events.onTabCommandsUpdate === "function"
				? window.omp.events.onTabCommandsUpdate(applyCommands)
				: window.omp.events.onCommandsUpdate(next => applyCommands(next, runtimeTabId));
		const load = () => {
			if (status !== "ready" || !runtimeTabId) return;
			void rpc.getAvailableCommands().then(res => {
				if (
					cancelled ||
					sessionRuntimeStore<SessionStore>(runtimeTabId, "session")?.getState().sessionId !== sessionId ||
					!res.success
				)
					return;
				const data = res.data as { commands?: AvailableCommand[] } | undefined;
				setCommands(withGuiNativeCommands(data?.commands ?? []));
			});
		};
		load();
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [status, sessionId, runtimeTabId, rpc]);

	// Grow wrapped drafts and placeholders with the pane, capped at 40% of its height.
	// biome-ignore lint/correctness/useExhaustiveDependencies: An empty textarea's scrollHeight depends on its rendered placeholder.
	useLayoutEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		const pane = el.closest<HTMLElement>(".omp-session-pane");
		let width = -1;
		let height = -1;
		const resize = () => {
			const nextWidth = el.clientWidth;
			const nextHeight = pane?.clientHeight ?? window.innerHeight;
			if (width === nextWidth && height === nextHeight) return;
			width = nextWidth;
			height = nextHeight;
			el.style.height = "0px";
			el.style.height = `${Math.min(el.scrollHeight, height * 0.4)}px`;
			el.style.overflowY = text.length === 0 ? "hidden" : "";
		};
		resize();
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
		observer?.observe(el);
		if (pane) observer?.observe(pane);
		if (!observer) window.addEventListener("resize", resize);
		return () => {
			observer?.disconnect();
			if (!observer) window.removeEventListener("resize", resize);
		};
	}, [text, placeholder]);

	useCompletionMenu({
		text,
		filePaths,
		commands,
		emojiAutocomplete,
		tabKind,
		textareaRef,
		setMenu,
	});

	// Reset the mention file list when the session cwd changes (cache is per-cwd).
	useEffect(() => {
		setFilePaths(mentionFileCache.get(cwd) ?? []);
	}, [cwd]);

	// Lazy-load workspace files for @mention completion: debounced so a fleeting
	// "@" doesn't trigger the walk, then cached per cwd for instant filtering.
	useEffect(() => {
		if (!routeReady) return;
		if (mentionFileCache.has(cwd)) return;
		const el = textareaRef.current;
		const before = text.slice(0, el?.selectionStart ?? text.length);
		if (!/(^|\s)@[\w./-]*$/.test(before)) return;
		const key = cwd;
		const timer = setTimeout(() => {
			void listMentionFiles(key, runtimeTabId).then(paths => {
				if (sessionRuntimeStore<SessionStore>(runtimeTabId, "session")?.getState().cwd === key) setFilePaths(paths);
			});
		}, MENTION_FS_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [text, cwd, routeReady, runtimeTabId]);

	useEffect(() => {
		const onInsertMention = (event: Event) => {
			const detail = (event as CustomEvent<{ path?: string; tabId?: string }>).detail;
			if ((detail?.tabId ?? useTabsStore.getState().activeTabId) !== runtimeTabId) return;
			const path = detail?.path;
			if (!path) return;
			setText(current => `${current}${current && !current.endsWith(" ") ? " " : ""}@${path} `);
			requestAnimationFrame(() => textareaRef.current?.focus());
		};
		window.addEventListener("omp:insert-mention", onInsertMention);
		return () => window.removeEventListener("omp:insert-mention", onInsertMention);
	}, [setText, runtimeTabId]);

	useEffect(() => {
		const fillComposer = (event: Event) => {
			const detail = (
				event as CustomEvent<{
					text?: string;
					images?: ImageContent[];
					prepend?: boolean;
					clearPastes?: boolean;
					tabId?: string;
				}>
			).detail;
			if ((detail?.tabId ?? useTabsStore.getState().activeTabId) !== runtimeTabId) return;
			const next = detail?.text;
			const restoredImages = detail?.images ?? [];
			if (!next && restoredImages.length === 0) return;
			// The editor dialog writes back fully-inline text — consume the blobs.
			if (detail?.clearPastes) dropReferencedPastes(useComposerStore.getState().draft);
			// prepend (dequeue restore): queued text goes ahead of any draft, TUI-style;
			// otherwise replace (starter cards, history recall).
			setText(current => {
				if (!next) return current;
				return detail?.prepend && current.trim() ? `${next}\n\n${current}` : next;
			});
			if (restoredImages.length > 0) {
				setImages(current => [
					...current,
					...restoredImages.map(content => ({
						content,
						preview: `data:${content.mimeType};base64,${content.data}`,
					})),
				]);
			}
			requestAnimationFrame(() => {
				const el = textareaRef.current;
				if (!el) return;
				el.focus();
				if (next) el.setSelectionRange(next.length, next.length);
			});
		};
		window.addEventListener("omp:fill-composer", fillComposer);
		return () => window.removeEventListener("omp:fill-composer", fillComposer);
	}, [
		// prepend (dequeue restore): queued text goes ahead of any draft, TUI-style;
		// otherwise replace (starter cards, history recall).
		setText,
		setImages,
		runtimeTabId,
	]);

	// A transcript excerpt quoted from the selection action (#54): it goes in at
	// the caret, so a reply can quote several passages and answer each in turn.
	useEffect(() => {
		const onQuote = (event: Event) => {
			const detail = (event as CustomEvent<{ quote?: string; tabId?: string }>).detail;
			if ((detail?.tabId ?? useTabsStore.getState().activeTabId) !== runtimeTabId) return;
			const quote = detail?.quote;
			if (!quote) return;
			const el = textareaRef.current;
			const draft = useComposerStore.getState().draft;
			// Selecting the excerpt moved focus to the transcript, but a blurred
			// textarea still holds its caret: that is where the reply was going.
			const caret = el ? el.selectionStart : draft.length;
			const next = insertQuote(draft, caret, quote);
			setText(next.text);
			requestAnimationFrame(() => {
				const target = textareaRef.current;
				if (!target) return;
				target.focus();
				target.setSelectionRange(next.caret, next.caret);
			});
		};
		window.addEventListener("omp:quote-composer", onQuote);
		return () => window.removeEventListener("omp:quote-composer", onQuote);
	}, [setText, runtimeTabId]);

	const insertCompletion = useCallback(
		(item: CompletionItem) => {
			const el = textareaRef.current;
			if (!el || !menu) return;
			const pos = el.selectionStart ?? text.length;
			if (pos !== menu.rangeEnd) {
				setMenu(null);
				return;
			}
			const replaced = `${text.slice(0, menu.rangeStart)}${item.value}${text.slice(pos)}`;
			setText(replaced);
			setMenu(null);
			requestAnimationFrame(() => {
				el.focus();
				const newPos = menu.rangeStart + item.value.length;
				el.setSelectionRange(newPos, newPos);
			});
		},
		[text, menu, setText],
	);

	const insertTextAtCaret = useCallback(
		(insertion: string) => {
			const el = textareaRef.current;
			const start = el?.selectionStart ?? text.length;
			const end = el?.selectionEnd ?? start;
			setText(current => `${current.slice(0, start)}${insertion}${current.slice(end)}`);
			requestAnimationFrame(() => {
				const target = textareaRef.current;
				if (!target) return;
				target.focus();
				const caret = start + insertion.length;
				target.setSelectionRange(caret, caret);
			});
		},
		[text, setText],
	);

	// Collapse a large paste into a `[Paste #N]` marker with the blob held in
	// memory; the marker expands back to full content at submit time (TUI
	// editor.ts parity). Inserted at the caret, replacing any selection.
	const insertPasteBlob = useCallback(
		(content: string) => {
			const blob = storePaste(content);
			insertTextAtCaret(pasteMarkerText(blob.id, blob.content));
		},
		[insertTextAtCaret],
	);

	// Paste menu actions — the paste always inserts something; the menu only
	// picks the form. Keep side effects outside state updaters: React may replay
	// updater functions, which must never duplicate a paste or an RPC write.
	// With collapsing off, the same choice inserts the text verbatim instead.
	const choosePasteInline = useCallback(() => {
		if (!pasteMenu) return;
		if (collapseLargePastes) insertPasteBlob(pasteMenu.content);
		else insertTextAtCaret(pasteMenu.content);
		setPasteMenu(null);
	}, [collapseLargePastes, insertPasteBlob, insertTextAtCaret, pasteMenu]);

	const choosePasteWrapped = useCallback(() => {
		if (!pasteMenu) return;
		const wrapped = wrapPasteInAttachmentBlock(pasteMenu.content);
		if (collapseLargePastes) insertPasteBlob(wrapped);
		else insertTextAtCaret(wrapped);
		setPasteMenu(null);
	}, [collapseLargePastes, insertPasteBlob, insertTextAtCaret, pasteMenu]);

	// Save-as-file: the agent writes the blob into the session's local:// store
	// (counter allocated agent-side so two windows can never collide) and the
	// composer gets the returned literal reference. Any protocol or transport
	// failure falls back to the inline marker, so clipboard content is not lost.
	const choosePasteSaveFile = useCallback(() => {
		if (!pasteMenu) return;
		const pendingPaste = pasteMenu;
		setPasteMenu(null);
		// Capture tab AND session at click time: after the RPC resolves,
		// `setText` may belong to a different tab's draft (tab switch) or a
		// different session's draft (in-place session replace). Both success
		// and fallback paths are gated — a cross-session paste corrupts both.
		const origin = {
			tabId: runtimeTabId,
			sessionId: sessionRuntimeStore<SessionStore>(runtimeTabId, "session")?.getState().sessionId,
		};
		const stillOrigin = () =>
			origin.tabId !== null &&
			sessionRuntimeStore<SessionStore>(origin.tabId, "session")?.getState().sessionId === origin.sessionId;
		void (async () => {
			try {
				const response = await rpc.writeLocalPaste(pendingPaste.content);
				if (!stillOrigin()) return;
				if (!response.success) throw new Error(response.error);
				const data = response.data as { url?: string } | undefined;
				if (!data?.url) throw new Error("write_local_paste returned no URL");
				const el = textareaRef.current;
				const start = el?.selectionStart ?? text.length;
				const end = el?.selectionEnd ?? start;
				const insert = `${data.url} `;
				setText(currentText => `${currentText.slice(0, start)}${insert}${currentText.slice(end)}`);
				requestAnimationFrame(() => {
					const target = textareaRef.current;
					if (!target) return;
					target.focus();
					const caret = start + insert.length;
					target.setSelectionRange(caret, caret);
				});
			} catch (cause) {
				// The RPC threw (transport/permission): without the origin gate the
				// inline fallback would splice clipboard content into whichever
				// composer is now foreground.
				if (!stillOrigin()) return;
				toast({
					variant: "error",
					title: t("input.paste.saveFailed"),
					message: describeError(cause),
				});
				insertPasteBlob(pendingPaste.content);
			}
		})();
	}, [insertPasteBlob, pasteMenu, text, t, setText, runtimeTabId, rpc]);

	const send = useComposerSubmit({
		text,
		sending,
		status,
		isStreaming,
		queuedMessageCount,
		commands,
		emojiAutocomplete,
		routeReady,
		setText,
		setImages,
		setMenu,
		setSending,
	});

	// Mic dictation (stt.enabled): words appear while the user speaks and land at the
	// caret as each phrase ends. Like the TUI composer mic, sending waits until the
	// capture is over, unless stt.submitTrigger sends a spoken message itself.
	const dictation = useDictation({ rpc, tabId: runtimeTabId, textareaRef, send: draft => send(draft) });
	const dictating = dictation.view !== null;
	const dictationPhase = dictation.view?.phase;

	/**
	 * Fullscreen editor dialog (TUI app.editor.external parity, GUI-native form).
	 * Opens with the EXPANDED draft (paste markers resolved). Reached by ⌃G and
	 * by the toolbar button — the chord is genuinely undiscoverable otherwise.
	 */
	const openDraftEditor = () => {
		useUiStore.getState().openComposerEditor(expandPasteMarkers(text));
	};

	/** Types the `/` trigger at the caret so the completion menu opens on every command. */
	const openCommandMenu = () => {
		const el = textareaRef.current;
		const needsSpace = text.length > 0 && !/\s$/.test(text);
		setText(`${text}${needsSpace ? " " : ""}/`);
		requestAnimationFrame(() => {
			el?.focus();
			const end = el?.value.length ?? 0;
			el?.setSelectionRange(end, end);
		});
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		// IME composition (Chinese/Japanese/Korean input): while the candidate
		// window is open, Enter and friends belong to the IME — committing the
		// composition must never send the message.
		if (isImeKeyEvent(e)) return;
		// Pending paste choice: Esc cancels the decision without inserting text.
		if (pasteMenu) {
			if (e.key === "Escape") {
				e.preventDefault();
				setPasteMenu(null);
			}
			return;
		}
		if (menu && ["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
			setMenu(null);
			return;
		}
		if (menu) {
			const count = menu.items.length;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setMenu({ ...menu, index: (menu.index + 1) % Math.max(1, count) });
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setMenu({ ...menu, index: (menu.index - 1 + Math.max(1, count)) % Math.max(1, count) });
				return;
			}
			if (e.key === "Enter") {
				e.preventDefault();
				const item = menu.items[menu.index];
				if (item) insertCompletion(item);
				return;
			}
			if (e.key === "Tab" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				const item = menu.items[menu.index];
				if (item) insertCompletion(item);
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setMenu(null);
				return;
			}
		}
		// Plain Tab accepts the active completion when a menu is open (same as Enter);
		// otherwise it cycles reasoning. Shift+Tab toggles plan mode via the registry's `plan` command.
		if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.defaultPrevented) {
			e.preventDefault();
			if (e.shiftKey) {
				const plan = buildCurrentCommandMenu(commands).find(item => item.name === "plan");
				if (plan?.affordance.kind === "toggle") {
					void Promise.resolve(plan.affordance.set(!plan.affordance.get())).catch(cause =>
						toast({ variant: "error", title: t("palette.failed"), message: String(cause) }),
					);
				}
			} else {
				void runSessionCommand(rpc.cycleThinkingLevel(), t("palette.failed"), data => {
					if (!data || typeof data !== "object" || !("thinkingLevel" in data)) return;
					const thinkingLevel = isThinkingLevel(data.thinkingLevel) ? data.thinkingLevel : undefined;
					const configured = "thinkingConfigured" in data ? data.thinkingConfigured : undefined;
					useModelStore.setState({
						thinkingLevel,
						thinkingConfigured: configured === "auto" || isThinkingLevel(configured) ? configured : undefined,
					});
				});
			}
			return;
		}
		// ⌃R unless remapped or turned off: history search overlay (TUI `app.history.search`).
		const shortcuts = effectiveOverrides(useUiStore.getState().keymapOverrides, useUiStore.getState().keymapDisabled);
		if (isComposerShortcut("composer.history", e, shortcuts)) {
			e.preventDefault();
			setHistorySearchOpen(open => !open);
			return;
		}
		// ⌃G unless remapped or turned off: fullscreen editor dialog.
		if (isComposerShortcut("composer.editor", e, shortcuts)) {
			e.preventDefault();
			openDraftEditor();
			return;
		}
		// Up/Down prompt-history recall: Up from the first line cycles to older
		// entries, Down from the last line cycles back to the stashed draft.
		if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
			const el = textareaRef.current;
			if (el) {
				const caretStart = el.selectionStart ?? 0;
				const caretEnd = el.selectionEnd ?? caretStart;
				const history = useInputHistoryStore.getState();
				let recalled: string | undefined;
				if (e.key === "ArrowUp" && !text.slice(0, caretStart).includes("\n")) {
					recalled = history.prev(text, { cwd, owner: `${runtimeTabId}:${sessionId}` });
				} else if (e.key === "ArrowDown" && !text.slice(caretEnd).includes("\n")) {
					recalled = history.next({ cwd, owner: `${runtimeTabId}:${sessionId}` });
				}
				if (recalled !== undefined) {
					e.preventDefault();
					const recalledText = recalled;
					setText(recalledText);
					requestAnimationFrame(() => {
						el.focus();
						el.setSelectionRange(recalledText.length, recalledText.length);
					});
					return;
				}
			}
		}
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			// While dictating, Enter finishes the capture for review instead of sending; before
			// recording begins (or while finishing) there is nothing to finish yet.
			if (dictating) {
				if (dictationPhase === "recording") dictation.stop();
				return;
			}
			// Enter steers a running turn; ⌘Enter (⌃Enter off macOS) queues a follow-up
			// behind it (TUI app.message.followUp). Idle sessions start either way.
			send(undefined, isFollowUpSend(e) ? "followUp" : "steer");
		}
	};

	const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
		const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/"));
		if (files.length > 0) {
			e.preventDefault();
			attachImages(files);
			return;
		}
		// Large TEXT paste (TUI editor.ts:1996-2044 parity): sanitize, then collapse
		// to a `[Paste #N]` marker past the marker threshold; past the (separate,
		// line-count-only) menu threshold, offer the inline/wrapped choice first.
		const pasted = e.clipboardData.getData("text/plain");
		if (!pasted) return;
		const content = pasted
			.replace(/\r\n?/g, "\n")
			.normalize("NFC")
			.replace(/\t/g, "   ")
			.replace(/[\x00-\x08\x0B-\x1F]/g, "");
		const lineCount = content.split("\n").length;
		if (shouldOfferPasteMenu(lineCount, pasteMenuThreshold)) {
			// The menu opens regardless of the collapse preference: it is where the
			// user picks inline vs wrapped, and both forms honour the flag.
			e.preventDefault();
			setPasteMenu({ content, lineCount });
			return;
		}
		if (!collapseLargePastes || !isMarkerSized(content)) return; // verbatim paste: default textarea behavior
		e.preventDefault();
		insertPasteBlob(content);
	};

	const hasDraft = text.trim().length > 0 || images.length > 0 || attachedFiles.length > 0;
	/** Holding the follow-up modifier over a running turn turns the next send into a follow-up. */
	const followUpHeld = useFollowUpModifierHeld(isStreaming && hasDraft);
	const queueLabel =
		queueSplitCount > 1
			? t("input.queue.split", { count: queueSplitCount })
			: queueBody !== undefined
				? t("input.queue.badge")
				: followUpHeld
					? t("input.followUpHint")
					: null;
	const queueTitle = queueBody !== undefined && queueSplitCount <= 1 ? t("input.queue.title") : queueLabel;

	return (
		<div className="omp-composer-region relative shrink-0 bg-transparent pb-1">
			<div className="omp-composer-shell relative w-full">
				{pasteMenu && (
					<div
						ref={pasteMenuRef}
						role="dialog"
						aria-label={t("input.paste.title", { lines: pasteMenu.lineCount, chars: pasteMenu.content.length })}
						onKeyDown={event => {
							if (event.key !== "Escape") return;
							event.preventDefault();
							setPasteMenu(null);
							textareaRef.current?.focus();
						}}
						className="omp-paste-preview omp-pop-in mb-1.5 rounded-xl border border-[var(--omp-border)] bg-[var(--omp-bg-elevated)] px-2 py-1.5 shadow-[var(--omp-shadow-sm)]"
					>
						<div className="flex flex-wrap items-baseline justify-between gap-x-2">
							<span className="text-omp-xs font-medium text-[var(--omp-text)]">
								{t("input.paste.title", { lines: pasteMenu.lineCount, chars: pasteMenu.content.length })}
							</span>
							<span className="text-omp-xxs text-[var(--omp-dim)]">{t("input.paste.hint")}</span>
						</div>
						<div className="my-1 min-w-0 rounded-md bg-[var(--omp-code-bg)] px-1.5 py-0.5 font-mono text-omp-xxs leading-snug text-[var(--omp-muted)]">
							<div className="truncate">{pasteMenu.content.split("\n", 1)[0]}</div>
							{pasteMenu.lineCount > 1 && (
								<div className="flex min-w-0 gap-1.5">
									{pasteMenu.lineCount > 2 && (
										<span className="shrink-0">
											{t("input.paste.moreLines", { count: pasteMenu.lineCount - 2 })}
										</span>
									)}
									<span className="truncate">
										{pasteMenu.content.slice(pasteMenu.content.lastIndexOf("\n") + 1)}
									</span>
								</div>
							)}
						</div>
						<div className="flex flex-wrap gap-1">
							<button
								type="button"
								onClick={choosePasteInline}
								className="omp-pressable rounded-md bg-[var(--omp-btn-primary-bg)] px-2 py-1 text-omp-xs font-medium text-[var(--omp-btn-primary-text)] hover:brightness-110"
							>
								{t("input.paste.inline")}
							</button>
							<button
								type="button"
								onClick={choosePasteWrapped}
								className="omp-pressable rounded-md border border-[var(--omp-border)] px-2 py-1 text-omp-xs font-medium text-[var(--omp-muted)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)]"
							>
								{t("input.paste.wrap")}
							</button>
							<button
								type="button"
								onClick={choosePasteSaveFile}
								className="omp-pressable rounded-md border border-[var(--omp-border)] px-2 py-1 text-omp-xs font-medium text-[var(--omp-muted)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)]"
							>
								{t("input.paste.saveFile")}
							</button>
							<button
								type="button"
								onClick={() => setPasteMenu(null)}
								className="omp-pressable rounded-md border border-[var(--omp-border)] px-2 py-1 text-omp-xs font-medium text-[var(--omp-muted)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)]"
							>
								{t("input.paste.cancel")}
							</button>
						</div>
					</div>
				)}

				{/* Anchoring context for completion/history overlays: they sit directly
				    above the input box instead of the surrounding composer region. */}
				<div className="relative">
					{composerMode && modeColor && (
						<div
							className="absolute -top-2 left-5 z-10 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-omp-xs font-semibold"
							style={{ borderColor: modeColor, color: modeColor, backgroundColor: "var(--omp-bg-primary)" }}
							title={
								composerMode.mode === "btw" ? t("cmd.btw.desc") : t(`input.mode.${composerMode.mode}.title`)
							}
						>
							<span className="font-mono text-omp-sm leading-none">
								{{ bash: "!", python: "$", btw: "?" }[composerMode.mode]}
							</span>
							{composerMode.mode === "btw" ? t("btw.title") : composerMode.mode}
						</div>
					)}
					{menu && <CompletionMenuList menu={menu} onSelect={insertCompletion} />}

					{historySearchOpen && (
						<HistorySearchOverlay
							cwd={cwd}
							onSelect={prompt => {
								setHistorySearchOpen(false);
								setText(prompt);
								requestAnimationFrame(() => {
									const el = textareaRef.current;
									if (!el) return;
									el.focus();
									el.setSelectionRange(prompt.length, prompt.length);
								});
							}}
							onClose={() => {
								setHistorySearchOpen(false);
								requestAnimationFrame(() => textareaRef.current?.focus());
							}}
						/>
					)}
					<div
						className="omp-composer-box overflow-hidden"
						data-working={isStreaming}
						style={modeColor ? { borderColor: modeColor } : undefined}
					>
						{modelMaterialColor && (
							<div
								className="omp-composer-model-material"
								style={{ color: modelMaterialColor }}
								aria-hidden="true"
							>
								<ModelBrand className="omp-composer-model-watermark" focusable="false" />
							</div>
						)}
						<div className="px-4 pb-1 pt-3" data-tour="commands">
							{submissionUncertain && (
								<div
									role="alert"
									className="mb-2 flex flex-wrap items-center gap-2 rounded border border-(--omp-warning) p-2 text-omp-sm text-(--omp-warning)"
								>
									<p className="min-w-0 flex-1">{t("input.deliveryUnknown")}</p>
									<button
										type="button"
										className="rounded border border-(--omp-border-muted) px-2 py-1"
										onClick={() => setSubmissionUncertain(false)}
									>
										{t("input.allowResend")}
									</button>
								</div>
							)}
							{(images.length > 0 || attachedFiles.length > 0) && (
								<div className="mb-3 flex flex-wrap items-start gap-2" data-composer-attachments>
									{images.map((image, index) => (
										<div key={index} className="group relative max-w-full shrink-0">
											<ZoomableImage
												src={image.preview}
												alt={t("input.attachmentAlt", { index: index + 1 })}
												onOpen={() =>
													useUiStore.getState().openImagePreview(image.preview, t("chat.attachedImage"))
												}
												className="h-[6.25rem] w-28 max-w-full rounded-lg border border-(--omp-border-muted) object-cover"
											/>
											<button
												type="button"
												title={t("input.removeAttachment")}
												onClick={() =>
													setImages(previous => previous.filter((_, itemIndex) => itemIndex !== index))
												}
												className="absolute top-1 right-1 grid size-5 place-items-center rounded-full border border-(--omp-border-muted) bg-(--omp-bg-elevated) text-(--omp-muted) hover:text-(--omp-text)"
											>
												<X size={11} />
											</button>
										</div>
									))}
									{attachedFiles.map(file => (
										<FileAttachmentCard
											key={composerFileKey(file)}
											name={file.name}
											path={file.path ?? splitAttachmentMentions(file.mention).paths[0] ?? file.name}
											onRemove={() => removeFile(composerFileKey(file))}
											removeDisabled={collabReadOnly}
										/>
									))}
								</div>
							)}
							<textarea
								data-tour="compose"
								readOnly={collabReadOnly}
								ref={textareaRef}
								autoCapitalize="sentences"
								autoCorrect="on"
								spellCheck
								value={text}
								onChange={event => {
									useInputHistoryStore.getState().resetNav();
									const value = event.target.value;
									// TUI parity (custom-editor.ts:1001-1007): the moment the buffer
									// becomes exactly the queue prefix, a newline starts the list body.
									if (value === "->" || value === "=>") {
										setText(`${value}\n`);
										return;
									}
									setText(value);
									// Emoji inline replace (TUI parity): `:name:` fires on the closing
									// colon, emoticons fire on a trailing space/tab/newline.
									if (emojiAutocomplete) {
										const caret = event.target.selectionStart ?? value.length;
										const before = value.slice(0, caret);
										void tryEmojiInlineReplace(before).then(hit => {
											if (!hit) return;
											const el = textareaRef.current;
											if (!el) return;
											// Stale-check: the user typed on meanwhile.
											const currentBefore = el.value.slice(0, el.selectionStart ?? el.value.length);
											if (currentBefore !== before) return;
											const nextText =
												before.slice(0, before.length - hit.replaceLen) +
												hit.insert +
												el.value.slice(before.length);
											setText(nextText);
											requestAnimationFrame(() => {
												const target = textareaRef.current;
												if (!target) return;
												const nextCaret = before.length - hit.replaceLen + hit.insert.length;
												target.setSelectionRange(nextCaret, nextCaret);
											});
										});
									}
								}}
								onKeyDown={handleKeyDown}
								onClick={() => setMenu(null)}
								onPaste={handlePaste}
								rows={2}
								wrap="soft"
								placeholder={placeholder}
								className="omp-composer-input max-h-[40vh] min-h-[44px] w-full resize-none bg-transparent text-omp-xl leading-[1.5] text-[var(--omp-text)] outline-none placeholder:text-[var(--omp-dim)]"
							/>
						</div>

						{dictation.view && (
							<DictationStrip view={dictation.view} onDone={dictation.stop} onCancel={dictation.cancel} />
						)}

						{argHint && (
							<div className="px-3.5 pb-1 font-mono text-omp-sm text-[var(--omp-dim)]">💡 {argHint}</div>
						)}

						{collabReadOnly && (
							<div role="status" className="px-4 pb-1 text-omp-sm text-(--omp-warning)">
								{t("collab.readOnlyInput")}
							</div>
						)}
						{!isChat && planModeEnabled && (
							<div className="px-3 pt-1">
								<span
									data-composer-plan-mode
									role="status"
									title={t("titlebar.planMode")}
									className="inline-flex items-center gap-1.5 rounded-full bg-(--omp-accent-dim) px-2 py-0.5 text-omp-sm font-medium text-(--omp-text)"
								>
									<ClipboardList aria-hidden size={13} />
									{t("input.plan.label")}
								</span>
							</div>
						)}

						<div
							ref={composerToolbarRef}
							aria-busy={!routeReady}
							className="omp-composer-toolbar flex h-12 min-w-0 items-center gap-2 px-3 pb-2 pt-1"
							inert={!routeReady}
						>
							<div className="omp-composer-controls flex min-w-0 flex-1 items-center gap-2">
								<button
									type="button"
									onClick={() => {
										const ui = useUiStore.getState();
										if (modelPickerOpen) ui.closeModelPicker();
										else ui.openModelPicker();
									}}
									disabled={collabReadOnly}
									aria-controls={modelPickerOpen ? "omp-model-picker" : undefined}
									aria-expanded={modelPickerOpen}
									data-model-picker-trigger={runtimeTabId ?? ""}
									aria-label={`${t("input.model")}: ${modelName ?? t("input.chooseModel")}`}
									// The label is the human name; the raw id stays in the tooltip so
									// power users can still read the catalog key (issue: raw-id label).
									title={
										model && modelName
											? `${t("input.model")}: ${modelName} (${model.id})`
											: `${t("input.model")}: ${modelName ?? t("input.chooseModel")}`
									}
									className="omp-composer-model omp-pressable flex h-8 min-w-8 items-center gap-1.5 rounded-full px-2 text-omp-md font-medium text-[var(--omp-text-secondary)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)]"
								>
									<ModelBrand size={18} className="shrink-0" />
									<span className="omp-composer-model-label min-w-0 flex-1 truncate">
										<bdi dir="auto">{modelName ?? t("input.chooseModel")}</bdi>
									</span>
									<ChevronDown aria-hidden="true" size={13} className="shrink-0 text-[var(--omp-dim)]" />
								</button>

								{compactRunSettings ? (
									<div className="relative shrink-0">
										<button
											ref={runSettingsTriggerRef}
											type="button"
											aria-expanded={runSettingsOpen}
											aria-haspopup="menu"
											data-run-settings-overflow-trigger
											data-tour="run-settings"
											data-tour-approvals={!isChat ? "" : undefined}
											disabled={collabReadOnly}
											title={t("input.moreModes")}
											aria-label={t("input.moreModes")}
											onClick={() => setRunSettingsOpen(open => !open)}
											className="omp-pressable relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--omp-muted)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)]"
										>
											<SlidersHorizontal size={15} />
											{runSettingsActive && (
												<span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--omp-accent)]" />
											)}
										</button>
										{runSettingsMounted &&
											createPortal(
												<div
													ref={runSettingsMenuRef}
													role="menu"
													data-run-settings-menu
													onClickCapture={event => {
														ownedRunSettingsClick.current = event.nativeEvent;
													}}
													aria-hidden={runSettingsClosing || undefined}
													inert={collabReadOnly || runSettingsClosing}
													style={runSettingsStyle}
													className={cx(
														"omp-composer-menu fixed z-[100] flex flex-col items-stretch gap-1 overflow-y-auto rounded-xl border border-[var(--omp-border)] bg-[var(--omp-bg-elevated)] p-1.5 shadow-[var(--omp-shadow-md)]",
														runSettingsClosing && "pointer-events-none",
													)}
												>
													{!isChat && <AdvisorBadge />}
													<ThinkingControl />
													<FastModeControl menuItem />
													{!isChat && <ApprovalControl />}
												</div>,
												document.body,
											)}
									</div>
								) : (
									<div
										data-run-settings-inline
										inert={collabReadOnly}
										className="omp-composer-inline-settings flex min-w-0 shrink-0 items-center gap-1.5"
									>
										{!isChat && <AdvisorBadge />}
										<ThinkingControl />
										<FastModeControl />
										{!isChat && <ApprovalControl />}
									</div>
								)}
								{!isChat && (
									<div className="shrink-0" inert={collabReadOnly}>
										<ComposerModes />
									</div>
								)}
							</div>

							<div className="omp-composer-attachments flex shrink-0 items-center gap-1.5" data-tour="attachments">
								<button
									type="button"
									disabled={collabReadOnly}
									aria-label={t("input.add")}
									aria-haspopup="menu"
									aria-expanded={addMenu !== null}
									title={t("input.add")}
									onClick={event => {
										const rect = event.currentTarget.getBoundingClientRect();
										setAddMenu({
											x: Number.isFinite(rect.left) ? rect.left : 8,
											y: Number.isFinite(rect.top) ? rect.top - 4 : 8,
										});
									}}
									className={cx(
										"omp-pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--omp-muted)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)]",
										addMenu && "bg-[var(--omp-selected-bg)] text-[var(--omp-text)]",
									)}
								>
									<Plus size={17} />
								</button>
								<input
									ref={fileInputRef}
									type="file"
									multiple
									className="hidden"
									onChange={event => {
										attachFiles(Array.from(event.target.files ?? []));
										event.target.value = "";
									}}
								/>
								{addMenu && (
									<ContextMenu
										x={addMenu.x}
										y={addMenu.y}
										placement="above"
										onClose={() => setAddMenu(null)}
										items={[
											...(compactRunSettings && sttEnabled && !dictating
												? [
														{
															id: "composer-dictation",
															label: t("voice.mic.start"),
															icon: Mic,
															onSelect: () => {
																setAddMenu(null);
																dictation.toggle();
															},
														},
													]
												: []),
											{
												id: "composer-attach",
												label: t("input.attach"),
												icon: Paperclip,
												onSelect: () => {
													setAddMenu(null);
													fileInputRef.current?.click();
												},
											},
											{
												id: "composer-commands",
												label: t("input.commands"),
												hint: "/",
												onSelect: () => {
													setAddMenu(null);
													openCommandMenu();
												},
											},
											{
												id: "composer-editor",
												label: t("editor.title"),
												icon: SquarePen,
												hint: "⌃G",
												onSelect: () => {
													setAddMenu(null);
													openDraftEditor();
												},
											},
											{
												id: "composer-history",
												label: t("input.history.title"),
												icon: History,
												hint: "⌃R",
												onSelect: () => {
													setAddMenu(null);
													setHistorySearchOpen(true);
												},
											},
										]}
									/>
								)}

								{runtimeTabId && speechPlaying && (
									<button
										type="button"
										onClick={() => stopTabSpeech(runtimeTabId)}
										aria-label={t("voice.speak.stop")}
										title={t("voice.speak.stop")}
										className="omp-pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-(--omp-muted) hover:bg-(--omp-selected-bg) hover:text-(--omp-text)"
									>
										<VolumeX size={16} />
									</button>
								)}

								{((sttEnabled && !compactRunSettings) || dictating) && (
									<button
										type="button"
										onClick={dictation.toggle}
										disabled={
											dictationPhase === "transcribing" || (!dictating && (collabReadOnly || !routeReady))
										}
										aria-pressed={dictating}
										title={
											dictationPhase === "recording"
												? t("voice.mic.stop")
												: dictationPhase === "transcribing"
													? t("voice.dictation.finishing")
													: dictating
														? t("voice.mic.cancelStart")
														: t("voice.mic.start")
										}
										aria-label={dictating ? t("voice.mic.stop") : t("voice.mic.start")}
										className={cx(
											"omp-pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
											dictationPhase === "recording"
												? "bg-[var(--omp-error-dim)] text-[var(--omp-error)]"
												: dictating
													? "bg-[var(--omp-selected-bg)] text-[var(--omp-text)]"
													: "text-[var(--omp-muted)] hover:bg-[var(--omp-selected-bg)] hover:text-[var(--omp-text)]",
										)}
									>
										{dictationPhase === "recording" ? (
											<Square size={12} fill="currentColor" />
										) : dictating ? (
											<Loader2 size={15} className="animate-spin" />
										) : (
											<Mic size={16} />
										)}
									</button>
								)}
							</div>

							<div className="omp-composer-send-cluster flex shrink-0 items-center gap-1">
								{queueLabel && (
									<span
										role="status"
										aria-label={queueLabel}
										title={queueTitle ?? undefined}
										className={cx(
											"omp-composer-queue flex h-7 min-w-7 items-center justify-center gap-1 rounded-full border border-current px-1.5 text-omp-xs font-medium",
											queueBody !== undefined ? "text-[var(--omp-warning)]" : "text-[var(--omp-accent)]",
										)}
									>
										<ListEnd aria-hidden size={13} className="shrink-0" />
										<span className="omp-composer-queue-label truncate">{queueLabel}</span>
										{queueSplitCount > 1 && (
											<span className="omp-composer-queue-count max-w-7 truncate tabular-nums" aria-hidden>
												{queueSplitCount}
											</span>
										)}
									</span>
								)}
								{(!isStreaming || hasDraft) && (
									<button
										type="button"
										onClick={event => send(undefined, isFollowUpSend(event) ? "followUp" : "steer")}
										disabled={
											!routeReady ||
											collabReadOnly ||
											status !== "ready" ||
											sending ||
											readingImages ||
											submissionUncertain ||
											dictating ||
											!hasDraft
										}
										aria-label={followUpHeld ? t("input.sendFollowUp") : t("input.send")}
										title={
											readingImages
												? t("common.loading")
												: isStreaming
													? t("input.sendStreaming", { chord: FOLLOW_UP_CHORD })
													: t("input.send")
										}
										className={cx("omp-send-button", followUpHeld && "omp-send-button--follow-up")}
									>
										{readingImages ? (
											<Loader2 aria-hidden size={16} className="animate-spin" />
										) : followUpHeld ? (
											<ListEnd size={16} strokeWidth={2.2} />
										) : (
											<ArrowUp size={16} strokeWidth={2.2} />
										)}
									</button>
								)}
								{isStreaming && (
									<button
										type="button"
										disabled={!routeReady || collabReadOnly}
										onClick={() => void abortActiveTurn(rpc, runtimeTabId)}
										aria-label={t("input.abort")}
										title={t("input.abort")}
										className={cx("omp-send-button", hasDraft && "omp-send-button--secondary")}
									>
										<Square size={11} fill="currentColor" />
									</button>
								)}
							</div>
						</div>
					</div>
				</div>
				<div className="omp-composer-footer flex min-w-0 items-center gap-1">
					<WallpaperControl />
					<div className="min-w-0 flex-1">{isChat ? <ChatContextBar /> : <ContextStrategyBar />}</div>
				</div>
			</div>
		</div>
	);
}

function FastModeControl({ menuItem = false }: { menuItem?: boolean }) {
	const t = useT();
	const model = useModelStore(s => s.model);
	const enabled = useModelStore(s => s.fastModeEnabled);
	const active = useModelStore(s => s.fastModeActive);
	const ultrafast = useModelStore(s => s.fastModeUltrafast);
	const sidecarSupportsUltrafast = useModelStore(s => s.fastModeUltrafastSupported);
	const toggleFastMode = useModelStore(s => s.toggleFastMode);
	const setModelSpeed = useModelStore(s => s.setModelSpeed);
	const [menu, setMenu] = useState<ContextMenuAnchor | null>(null);
	const priority = supportsPriorityMode(model);
	const ultra = sidecarSupportsUltrafast && supportsUltrafastMode(model);
	if (!priority && !ultra) return null;
	const speedMenu = model?.provider === "openai-codex" || ultra;
	const selected: ModelSpeed = !active ? "standard" : ultrafast && ultra ? "ultrafast" : priority ? "fast" : "standard";
	const speeds: ModelSpeed[] = ["standard"];
	if (priority) speeds.push("fast");
	if (ultra) speeds.push("ultrafast");
	const options = speeds.map(id => ({
		id,
		label: t(`input.speed.${id}`),
		icon: id === selected ? Check : undefined,
		onSelect: () => {
			setMenu(null);
			void setModelSpeed(id);
		},
	}));
	const triggerTitle = speedMenu
		? t("input.speed.title")
		: `${enabled ? t("input.fast.on") : t("input.fast.off")}${active ? t("input.fast.active") : ""}`;
	if (speedMenu && menuItem) {
		return (
			<div role="group" aria-label={t("input.speed.title")} className="flex flex-wrap gap-0.5 px-1 py-0.5">
				{options.map(item => (
					<button
						key={item.id}
						type="button"
						role="menuitemradio"
						aria-checked={item.id === selected}
						onClick={item.onSelect}
						className={cx(
							"omp-pressable rounded-md px-2 py-1 text-omp-sm",
							item.id === selected && "bg-(--omp-selected-bg) text-(--omp-accent)",
						)}
					>
						{item.label}
					</button>
				))}
			</div>
		);
	}
	return (
		<>
			<button
				type="button"
				role={menuItem ? "menuitem" : undefined}
				aria-pressed={speedMenu ? undefined : enabled}
				aria-haspopup={speedMenu ? "menu" : undefined}
				aria-expanded={speedMenu ? menu !== null : undefined}
				onClick={event => {
					if (!speedMenu) {
						void toggleFastMode();
						return;
					}
					const rect = event.currentTarget.getBoundingClientRect();
					setMenu(menu ? null : { x: rect.left, y: rect.top - 6 });
				}}
				title={triggerTitle}
				aria-label={triggerTitle}
				className={cx(
					"omp-pressable flex h-8 items-center gap-1.5 rounded-full px-2.5 text-omp-md font-medium hover:bg-[var(--omp-selected-bg)]",
					menuItem && "w-full",
					enabled ? "text-[var(--omp-accent)]" : "text-[var(--omp-muted)]",
				)}
			>
				<Zap aria-hidden size={14} fill={active ? "currentColor" : "none"} />
				<span className="omp-composer-control-label">
					{speedMenu ? t(`input.speed.${selected}`) : t("input.fast.label")}
				</span>
				{speedMenu && <ChevronDown aria-hidden size={11} />}
			</button>
			{speedMenu && menu && (
				<ContextMenu x={menu.x} y={menu.y} placement="above" items={options} onClose={() => setMenu(null)} />
			)}
		</>
	);
}
