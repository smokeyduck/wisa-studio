/**
 * Turning a catalog thumbnail path into something the renderer can load.
 *
 * The catalog publishes screenshots as `/templates/<id>.webp` — a path on the
 * worker's own origin. The renderer ships the same files from `public/templates`
 * (the page has to work offline, and the CSP pins `img-src` to 'self'), so the
 * path is rewritten to a document-relative one: a root-absolute path would
 * resolve outside the app in a packaged build, where the page is a `file://` URL.
 *
 * Only the basename survives. A thumbnail string is remote input; keeping a
 * `../` from it would let an outside catalog point the renderer at the local
 * filesystem.
 */
export function templateThumbnailSrc(thumbnail: string | undefined): string | null {
	if (!thumbnail) return null;
	const name = thumbnail.slice(thumbnail.lastIndexOf("/") + 1).trim();
	if (!name || name === "." || name === "..") return null;
	return `./templates/${name}`;
}
