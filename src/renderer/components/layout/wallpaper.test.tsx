import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationWallpaper as Wallpaper, WallpaperApi } from "../../../shared/wallpaper";
import { I18nProvider, translate } from "../../lib/i18n";
import { useToastStore } from "../../stores/toast";
import { startWallpaperSync, useWallpaperStore } from "../../stores/wallpaper";
import { ConversationWallpaper } from "./ConversationWallpaper";
import { WallpaperControl } from "./WallpaperControl";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { document, window, Event, HTMLElement, Element, Node, IS_REACT_ACT_ENVIRONMENT: true });
const image: Wallpaper = { kind: "image", url: "omp-wallpaper://local/image", name: "image.png" };
const video: Wallpaper = { kind: "video", url: "omp-wallpaper://local/video", name: "video.mp4" };
let changed: (wallpaper: Wallpaper | null) => void;
const unsubscribe = vi.fn();
const get = vi.fn<WallpaperApi["get"]>();
const choose = vi.fn<WallpaperApi["choose"]>();
const clear = vi.fn<WallpaperApi["clear"]>();
let dispose: (() => void) | undefined;
let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
	get.mockResolvedValue(null);
	choose.mockResolvedValue(image);
	clear.mockResolvedValue(undefined);
	Object.assign(window, {
		omp: {
			initialLanguage: "en",
			wallpaper: {
				get,
				choose,
				clear,
				onChanged: (callback: typeof changed) => {
					changed = callback;
					return unsubscribe;
				},
			},
		},
	});
});

afterEach(async () => {
	dispose?.();
	dispose = undefined;
	if (root) await act(async () => root?.unmount());
	root = undefined;
	container?.remove();
	useWallpaperStore.setState({
		wallpaper: null,
		busy: false,
		error: null,
		videoPaused: false,
		playbackExplicit: false,
	});
	useToastStore.setState({ toasts: [] });
	vi.resetAllMocks();
	vi.unstubAllGlobals();
});

async function mount(): Promise<void> {
	container = document.createElement("div") as unknown as HTMLDivElement;
	document.body.appendChild(container as never);
	root = createRoot(container);
	await act(async () =>
		root?.render(
			<I18nProvider>
				<ConversationWallpaper />
				<WallpaperControl />
			</I18nProvider>,
		),
	);
}

function click(label: string): void {
	const button = [...container.querySelectorAll("button")].find(
		element => element.getAttribute("aria-label") === translate(label),
	);
	expect(button).toBeDefined();
	button?.dispatchEvent(new Event("click", { bubbles: true }));
}

describe("wallpaper synchronization", () => {
	it("does not overwrite a pushed change with an older initial snapshot", async () => {
		const pending = Promise.withResolvers<Wallpaper | null>();
		get.mockReturnValueOnce(pending.promise);
		dispose = startWallpaperSync();
		changed(video);
		pending.resolve(image);
		await pending.promise;
		expect(useWallpaperStore.getState().wallpaper).toEqual(video);
	});

	it("does not overwrite a local selection with a delayed initial snapshot", async () => {
		const pending = Promise.withResolvers<Wallpaper | null>();
		get.mockReturnValueOnce(pending.promise);
		dispose = startWallpaperSync();
		await useWallpaperStore.getState().choose();
		pending.resolve(null);
		await pending.promise;
		expect(useWallpaperStore.getState().wallpaper).toEqual(image);
	});

	it("ignores an initial snapshot after cleanup", async () => {
		const pending = Promise.withResolvers<Wallpaper | null>();
		get.mockReturnValueOnce(pending.promise);
		const stop = startWallpaperSync();
		stop();
		pending.resolve(image);
		await pending.promise;
		expect(useWallpaperStore.getState().wallpaper).toBeNull();
		expect(unsubscribe).toHaveBeenCalledOnce();
	});

	it("preserves the selection and releases busy state when the picker fails", async () => {
		useWallpaperStore.setState({ wallpaper: image });
		choose.mockRejectedValueOnce(new Error("picker failed"));
		await useWallpaperStore.getState().choose();
		expect(useWallpaperStore.getState()).toMatchObject({
			wallpaper: image,
			busy: false,
			error: "wallpaper.chooseFailed",
		});
		expect(useToastStore.getState().toasts[0].message).toBe(translate("wallpaper.chooseFailed"));
	});

	it("does not call a missing wallpaper handler an unsupported media error", async () => {
		get.mockRejectedValueOnce(new Error("No handler registered for 'wallpaper:get'"));
		dispose = startWallpaperSync();
		await Promise.resolve();
		expect(useWallpaperStore.getState().error).toBe("wallpaper.restartRequired");
		expect(useToastStore.getState().toasts[0].message).toBe(translate("wallpaper.restartRequired"));
	});

	it("keeps settings-load errors separate from media decode failures", async () => {
		get.mockRejectedValueOnce(new Error("settings unreadable"));
		dispose = startWallpaperSync();
		await Promise.resolve();
		expect(useWallpaperStore.getState().error).toBe("wallpaper.syncFailed");
		expect(useToastStore.getState().toasts[0].message).toBe(translate("wallpaper.syncFailed"));
	});

	it("respects reduced motion until the user explicitly plays the video", async () => {
		let motionChanged = () => {};
		const media = {
			matches: true,
			addEventListener: (_event: string, listener: () => void) => {
				motionChanged = listener;
			},
			removeEventListener: vi.fn(),
		};
		Object.assign(window, { matchMedia: () => media });
		get.mockResolvedValueOnce(video);
		dispose = startWallpaperSync();
		await Promise.resolve();
		expect(useWallpaperStore.getState().videoPaused).toBe(true);
		useWallpaperStore.getState().setVideoPaused(false);
		motionChanged();
		expect(useWallpaperStore.getState().videoPaused).toBe(false);
		delete (window as unknown as Record<string, unknown>).matchMedia;
	});
});

describe("wallpaper controls and media", () => {
	it("keeps reset available after a decode failure and clears the selection", async () => {
		useWallpaperStore.setState({ wallpaper: image });
		await mount();
		await act(async () => container.querySelector("img")?.dispatchEvent(new Event("error")));
		expect(container.querySelector(".omp-wallpaper-layer")).toBeNull();
		expect(useToastStore.getState().toasts[0].message).toBe(translate("wallpaper.loadFailed"));
		await act(async () => click("wallpaper.reset"));
		expect(clear).toHaveBeenCalledOnce();
		expect(useWallpaperStore.getState().wallpaper).toBeNull();
		expect(container.querySelector(".omp-wallpaper-choose")).not.toBeNull();
	});

	it("pauses hidden videos, resumes visible ones, and pauses on unmount", async () => {
		const play = vi.fn(() => Promise.resolve());
		const pause = vi.fn();
		Object.defineProperty(HTMLElement.prototype, "play", { configurable: true, value: play });
		Object.defineProperty(HTMLElement.prototype, "pause", { configurable: true, value: pause });
		Object.defineProperty(document, "hidden", { configurable: true, value: false });
		useWallpaperStore.setState({ wallpaper: video });
		await mount();
		expect(play).toHaveBeenCalledOnce();
		Object.defineProperty(document, "hidden", { configurable: true, value: true });
		document.dispatchEvent(new Event("visibilitychange"));
		expect(pause).toHaveBeenCalledOnce();
		Object.defineProperty(document, "hidden", { configurable: true, value: false });
		document.dispatchEvent(new Event("visibilitychange"));
		expect(play).toHaveBeenCalledTimes(2);
		await act(async () => root?.unmount());
		root = undefined;
		expect(pause).toHaveBeenCalledTimes(2);
		delete (HTMLElement.prototype as unknown as Record<string, unknown>).play;
		delete (HTMLElement.prototype as unknown as Record<string, unknown>).pause;
	});
});

it("pauses videos while their conversation is offscreen", async () => {
	const play = vi.fn(() => Promise.resolve());
	const pause = vi.fn();
	const disconnect = vi.fn();
	let intersectionChanged: (entries: { isIntersecting: boolean }[]) => void = () => {};
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			constructor(callback: typeof intersectionChanged) {
				intersectionChanged = callback;
			}
			observe() {}
			disconnect = disconnect;
		},
	);
	Object.defineProperty(HTMLElement.prototype, "play", { configurable: true, value: play });
	Object.defineProperty(HTMLElement.prototype, "pause", { configurable: true, value: pause });
	useWallpaperStore.setState({ wallpaper: video });
	await mount();
	intersectionChanged([{ isIntersecting: false }]);
	expect(pause).toHaveBeenCalledOnce();
	intersectionChanged([{ isIntersecting: true }]);
	expect(play).toHaveBeenCalledTimes(2);
	await act(async () => root?.unmount());
	root = undefined;
	expect(disconnect).toHaveBeenCalledOnce();
	delete (HTMLElement.prototype as unknown as Record<string, unknown>).play;
	delete (HTMLElement.prototype as unknown as Record<string, unknown>).pause;
});

it("shows an autoplay failure and lets the user explicitly retry or reset", async () => {
	const play = vi.fn<() => Promise<void>>(() => Promise.reject(new Error("autoplay denied")));
	Object.defineProperty(HTMLElement.prototype, "play", { configurable: true, value: play });
	Object.defineProperty(HTMLElement.prototype, "pause", { configurable: true, value: vi.fn() });
	useWallpaperStore.setState({ wallpaper: video });
	await mount();
	expect(useWallpaperStore.getState()).toMatchObject({ videoPaused: true, error: "wallpaper.loadFailed" });
	expect(container.querySelector(".omp-wallpaper-layer")).toBeNull();
	play.mockImplementation(() => Promise.resolve());
	await act(async () => click("wallpaper.play"));
	expect(container.querySelector("video")).not.toBeNull();
	expect(useWallpaperStore.getState().error).toBeNull();
	await act(async () => click("wallpaper.reset"));
	expect(useWallpaperStore.getState().wallpaper).toBeNull();
	delete (HTMLElement.prototype as unknown as Record<string, unknown>).play;
	delete (HTMLElement.prototype as unknown as Record<string, unknown>).pause;
});
