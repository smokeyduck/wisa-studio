/**
 * Composer content. Lives in a store (not InputArea-local state) so session
 * tabs can keep text and attachments together.
 *
 * Writes still flow through the same call sites as the old useState: every
 * producer (typing, paste markers, mentions, history recall, dequeue
 * restore, the `omp:fill-composer` window event) calls setDraft with a value
 * or an updater.
 */
import { createStore } from "zustand/vanilla";
import type { ImageContent } from "../../shared/rpc-types";
import { createScopedStoreApi, useScopedStore } from "./session-runtime-context";

export interface ComposerImage {
	content: ImageContent;
	preview: string;
}

export interface ComposerFile {
	name: string;
	mention: string;
	path?: string;
}

export const composerFileKey = (file: ComposerFile): string => file.path ?? file.mention;

export function mergeComposerFiles(first: ComposerFile[], second: ComposerFile[]): ComposerFile[] {
	return [...new Map([...first, ...second].map(file => [composerFileKey(file), file])).values()];
}

export interface ComposerStore {
	draft: string;
	sending: boolean;
	submissionUncertain: boolean;
	setSending: (value: boolean) => void;
	setSubmissionUncertain: (value: boolean) => void;
	images: ComposerImage[];
	pendingImageReads: number;
	imageReadEpoch: number;
	readImages: (read: () => Promise<ComposerImage[]>) => Promise<void>;
	files: ComposerFile[];
	/** Replace the draft, or compute the next value from the current one
	 * (React setState parity — InputArea's updater-form call sites unchanged). */
	setDraft: (next: string | ((current: string) => string)) => void;
	setImages: (next: ComposerImage[] | ((current: ComposerImage[]) => ComposerImage[])) => void;
	addFiles: (files: ComposerFile[]) => void;
	removeFile: (key: string) => void;
	reset: () => void;
}

export const createComposerStore = () =>
	createStore<ComposerStore>()((set, get) => ({
		draft: "",
		sending: false,
		submissionUncertain: false,
		setSending: sending => set({ sending }),
		setSubmissionUncertain: submissionUncertain => set({ submissionUncertain }),
		images: [],
		pendingImageReads: 0,
		imageReadEpoch: 0,
		readImages: async read => {
			const epoch = get().imageReadEpoch;
			set(state => ({ pendingImageReads: state.pendingImageReads + 1 }));
			let images: ComposerImage[] = [];
			try {
				images = await read();
			} finally {
				set(state =>
					state.imageReadEpoch === epoch
						? {
								images: images.length > 0 ? [...state.images, ...images] : state.images,
								pendingImageReads: state.pendingImageReads - 1,
							}
						: state,
				);
			}
		},
		files: [],
		setDraft: next => set(state => ({ draft: typeof next === "function" ? next(state.draft) : next })),
		setImages: next => set(state => ({ images: typeof next === "function" ? next(state.images) : next })),
		addFiles: files => set(state => ({ files: mergeComposerFiles(state.files, files) })),
		removeFile: key => set(state => ({ files: state.files.filter(file => composerFileKey(file) !== key) })),
		reset: () =>
			set(state => ({
				draft: "",
				images: [],
				files: [],
				sending: false,
				submissionUncertain: false,
				pendingImageReads: 0,
				imageReadEpoch: state.imageReadEpoch + 1,
			})),
	}));

const defaultComposerStore = createComposerStore();
function useComposer(): ComposerStore;
function useComposer<U>(selector: (state: ComposerStore) => U): U;
function useComposer<U = ComposerStore>(selector?: (state: ComposerStore) => U): U {
	return useScopedStore("composer", defaultComposerStore, selector);
}
export const useComposerStore = Object.assign(useComposer, createScopedStoreApi("composer", defaultComposerStore));
