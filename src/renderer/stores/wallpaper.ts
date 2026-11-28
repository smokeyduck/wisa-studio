import { create } from "zustand";
import type { ConversationWallpaper } from "../../shared/wallpaper";
import { translate } from "../lib/i18n";
import { reportRuntimeError } from "../lib/runtime-errors";
import { toast } from "./toast";

type WallpaperError =
	| "wallpaper.chooseFailed"
	| "wallpaper.loadFailed"
	| "wallpaper.syncFailed"
	| "wallpaper.restartRequired";

interface WallpaperStore {
	wallpaper: ConversationWallpaper | null;
	busy: boolean;
	error: WallpaperError | null;
	videoPaused: boolean;
	playbackExplicit: boolean;
	choose: () => Promise<void>;
	clear: () => Promise<void>;
	setVideoPaused: (paused: boolean) => void;
	reportLoadError: (url: string) => void;
}

let revision = 0;

function reducedMotion(): boolean {
	return typeof window !== "undefined" && typeof window.matchMedia === "function"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;
}

function acceptWallpaper(wallpaper: ConversationWallpaper | null): void {
	const previous = useWallpaperStore.getState().wallpaper;
	const changed = previous?.url !== wallpaper?.url || previous?.kind !== wallpaper?.kind;
	useWallpaperStore.setState({
		wallpaper,
		error: null,
		...(changed ? { videoPaused: reducedMotion(), playbackExplicit: false } : {}),
	});
}

function reportError(error: WallpaperError): void {
	useWallpaperStore.setState({ error });
	toast({ variant: "error", message: translate(error) });
}

export const useWallpaperStore = create<WallpaperStore>()((set, get) => ({
	wallpaper: null,
	busy: false,
	error: null,
	videoPaused: reducedMotion(),
	playbackExplicit: false,
	choose: async () => {
		if (get().busy) return;
		const request = ++revision;
		set({ busy: true, error: null });
		try {
			const wallpaper = await window.omp.wallpaper.choose();
			if (request === revision) acceptWallpaper(wallpaper);
		} catch {
			if (request === revision) reportError("wallpaper.chooseFailed");
		} finally {
			set({ busy: false });
		}
	},
	clear: async () => {
		if (get().busy) return;
		const request = ++revision;
		set({ busy: true, error: null });
		try {
			await window.omp.wallpaper.clear();
			if (request === revision) acceptWallpaper(null);
		} catch {
			if (request === revision) reportError("wallpaper.chooseFailed");
		} finally {
			set({ busy: false });
		}
	},
	setVideoPaused: videoPaused =>
		set({ videoPaused, playbackExplicit: true, ...(!videoPaused ? { error: null } : {}) }),
	reportLoadError: url => {
		if (get().wallpaper?.url !== url || get().error === "wallpaper.loadFailed") return;
		if (get().wallpaper?.kind === "video") set({ videoPaused: true });
		reportError("wallpaper.loadFailed");
	},
}));

/** Subscribe before reading the snapshot so an older reply cannot undo a local or remote edit. */
export function startWallpaperSync(): () => void {
	let disposed = false;
	const api = window.omp?.wallpaper;
	if (!api) {
		reportError("wallpaper.restartRequired");
		return () => {};
	}
	const unsubscribe = api.onChanged(wallpaper => {
		++revision;
		acceptWallpaper(wallpaper);
	});
	const request = revision;
	void api.get().then(
		wallpaper => {
			if (!disposed && request === revision) acceptWallpaper(wallpaper);
		},
		cause => {
			if (disposed || request !== revision) return;
			reportRuntimeError("preload", cause, { details: { feature: "wallpaper", operation: "get" } });
			reportError(
				/No handler registered for ['"]wallpaper:get['"]/.test(String(cause))
					? "wallpaper.restartRequired"
					: "wallpaper.syncFailed",
			);
		},
	);
	const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
	const syncMotion = () => {
		if (!useWallpaperStore.getState().playbackExplicit) {
			useWallpaperStore.setState({ videoPaused: media?.matches ?? false });
		}
	};
	syncMotion();
	media?.addEventListener("change", syncMotion);
	return () => {
		disposed = true;
		unsubscribe();
		media?.removeEventListener("change", syncMotion);
	};
}
