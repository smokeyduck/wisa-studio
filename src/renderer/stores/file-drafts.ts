import { create } from "zustand";
import type { FileEditFailure } from "../../shared/ipc-types";

type EditFailure = { reason: FileEditFailure; detail?: string };
interface FileDraft {
	initial: string;
	revision: string;
	content: string;
	saving?: boolean;
	failure?: EditFailure;
	cursor?: { anchor: number; head: number };
	scroll?: { top: number; left: number };
	lastLineRequest?: number;
}

// Window-local drafts survive a file switch, closing the drawer, or opening another panel.
export const useFileDrafts = create<{ drafts: ReadonlyMap<string, FileDraft> }>()(() => ({ drafts: new Map() }));

/** Keep the close guard alive without loading the editor while drawers and editor tabs are hidden. */
export function connectFileDraftGuard(): () => void {
	let previous: boolean | undefined;
	const report = () => {
		let dirty = false;
		for (const draft of useFileDrafts.getState().drafts.values()) {
			if (draft.saving || draft.content !== draft.initial) {
				dirty = true;
				break;
			}
		}
		if (dirty === previous) return;
		window.omp.app.setUnsavedFiles(dirty);
		previous = dirty;
	};
	report();
	return useFileDrafts.subscribe(report);
}

export function setFileDraft(id: string, draft: FileDraft | null): void {
	useFileDrafts.setState(state => {
		const drafts = new Map(state.drafts);
		if (draft) drafts.set(id, draft);
		else drafts.delete(id);
		return { drafts };
	});
}
