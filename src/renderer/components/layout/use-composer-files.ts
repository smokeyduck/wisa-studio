import { useT } from "../../lib/i18n";
import { type ComposerFile, useComposerStore } from "../../stores/composer";
import { useSessionStore } from "../../stores/session";
import { toast } from "../../stores/toast";
import { droppedFileMention, fileToImage, isInlineImage } from "./input-area-utils";

/** Stage local paths and inline images in the surrounding session's draft. */
export function useComposerFiles() {
	const t = useT();
	const cwd = useSessionStore(state => state.cwd);
	const readOnly = useSessionStore(state => state.collab?.readOnly === true);
	const addFiles = useComposerStore(state => state.addFiles);
	const readImages = useComposerStore(state => state.readImages);
	const readingImages = useComposerStore(state => state.pendingImageReads > 0);
	const reportFailure = () => toast({ variant: "warning", message: t("input.attachmentFailed") });

	const attachImages = (files: File[]) => {
		if (readOnly || files.length === 0) return;
		// The store registers this batch before FileReader starts, and owns its
		// completion even if focus moves to another pane while the files load.
		void readImages(async () => {
			const results = await Promise.allSettled(files.map(fileToImage));
			const added = results.flatMap(result => (result.status === "fulfilled" ? [result.value] : []));
			if (added.length < results.length) reportFailure();
			return added;
		}).catch(reportFailure);
	};

	const attachFiles = (incoming: File[]) => {
		if (readOnly) return;
		const localFiles: ComposerFile[] = [];
		const imageFiles: File[] = [];
		let unavailable = false;
		for (const file of incoming) {
			if (isInlineImage(file)) {
				imageFiles.push(file);
				continue;
			}
			const path = window.omp.app.pathForFile(file);
			if (path) localFiles.push({ name: file.name, path, mention: droppedFileMention(path, cwd) });
			else unavailable = true;
		}
		if (localFiles.length > 0) addFiles(localFiles);
		if (unavailable) reportFailure();
		attachImages(imageFiles);
	};

	return { attachFiles, attachImages, readingImages, readOnly };
}
