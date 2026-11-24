import { create } from "zustand";

interface TurnNotice {
	id: number;
	tabId: string;
	sessionId?: string;
	title?: string;
	tone: "done" | "failed";
	detail?: string;
	createdAt: number;
	read: boolean;
}

interface TurnNoticesStore {
	notices: TurnNotice[];
	push: (notice: Omit<TurnNotice, "id" | "createdAt" | "read">) => void;
	markRead: (id?: number) => void;
}

let nextId = 0;

/** Interactive turns belong to this window, unlike main-owned scheduled task notices. */
export const useTurnNoticesStore = create<TurnNoticesStore>()(set => ({
	notices: [],
	push: notice =>
		set(state => ({
			notices: [{ ...notice, id: ++nextId, createdAt: Date.now(), read: false }, ...state.notices].slice(0, 100),
		})),
	markRead: id =>
		set(state => ({
			notices: state.notices.map(notice =>
				!notice.read && (id === undefined || id === notice.id) ? { ...notice, read: true } : notice,
			),
		})),
}));
