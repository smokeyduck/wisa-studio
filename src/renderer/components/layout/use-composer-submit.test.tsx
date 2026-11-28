/**
 * Pressing Enter before the agent is ready keeps the text and warns. That warning
 * must not outlive the wait, or it sits beside a Ready status saying the opposite.
 */
import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { type ComposerImage, createComposerStore, useComposerStore } from "../../stores/composer";
import { useTabsStore } from "../../stores/tabs";
import { useToastStore } from "../../stores/toast";
import { useComposerSubmit } from "./use-composer-submit";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis as Record<string, unknown>, {
	document,
	window,
	Event,
	HTMLElement,
	Element,
	Node,
	IS_REACT_ACT_ENVIRONMENT: true,
});

let send: () => void = () => {};
let root: Root | null = null;

function Harness({ status }: { status: string }) {
	const submit = useComposerSubmit({
		text: "say hi",
		sending: false,
		status,
		isStreaming: false,
		queuedMessageCount: 0,
		commands: [],
		emojiAutocomplete: false,
		routeReady: true,
		setText: () => {},
		setImages: () => {},
		setMenu: () => {},
		setSending: () => {},
	});
	send = () => void submit();
	return null;
}

const showing = () => useToastStore.getState().toasts.filter(toast => toast.exitingAt === undefined);

afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	useToastStore.setState({ toasts: [] });
	useComposerStore.getState().reset();
	useTabsStore.setState({ activeTabId: null });
});

describe("the agent-still-connecting warning", () => {
	it("goes away once the agent is ready", async () => {
		useTabsStore.setState({ activeTabId: "tab-1" });
		const host = document.createElement("div");
		root = createRoot(host as unknown as globalThis.Element);
		const render = (status: string) =>
			act(async () => {
				root?.render(
					<I18nProvider>
						<Harness status={status} />
					</I18nProvider>,
				);
			});

		await render("starting");
		await act(async () => send());
		expect(showing().map(toast => toast.message)).toEqual(["The agent is still connecting."]);

		await render("ready");
		expect(showing()).toEqual([]);
	});
});

describe("pending draft images", () => {
	const image: ComposerImage = {
		content: { type: "image", data: "AQID", mimeType: "image/png" },
		preview: "data:image/png;base64,AQID",
	};

	it("does not attach a cancelled session's image or unlock a newer read after reset", async () => {
		const store = createComposerStore();
		const oldRead = Promise.withResolvers<ComposerImage[]>();
		const oldCompletion = store.getState().readImages(() => oldRead.promise);
		store.getState().reset();
		const nextRead = Promise.withResolvers<ComposerImage[]>();
		const nextCompletion = store.getState().readImages(() => nextRead.promise);
		oldRead.resolve([image]);
		await oldCompletion;
		expect(store.getState().images).toEqual([]);
		expect(store.getState().pendingImageReads).toBe(1);
		nextRead.resolve([image]);
		await nextCompletion;
		expect(store.getState().images).toEqual([image]);
		expect(store.getState().pendingImageReads).toBe(0);
	});

	it("unlocks the draft after a failed read without removing existing attachments", async () => {
		const store = createComposerStore();
		store.getState().setImages([image]);
		await expect(
			store.getState().readImages(async () => {
				throw new Error("unreadable image");
			}),
		).rejects.toThrow("unreadable image");
		expect(store.getState().images).toEqual([image]);
		expect(store.getState().pendingImageReads).toBe(0);
	});
});
