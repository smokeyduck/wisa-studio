/** Profile-owned, locally selected media; the URL never accepts arbitrary file paths. */
export interface ConversationWallpaper {
	kind: "image" | "video";
	url: string;
	name: string;
}

export interface WallpaperApi {
	get: () => Promise<ConversationWallpaper | null>;
	/** Cancelling the native picker keeps and returns the existing selection. */
	choose: () => Promise<ConversationWallpaper | null>;
	clear: () => Promise<void>;
	onChanged: (callback: (wallpaper: ConversationWallpaper | null) => void) => () => void;
}
