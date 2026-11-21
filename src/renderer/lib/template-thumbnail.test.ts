/**
 * The Templates page ships its own screenshots, so the catalog's thumbnail
 * path has to be mapped onto a document-relative URL — and only onto one that
 * stays inside the bundle. The catalog is remote input: a `../` in it must not
 * be able to point the renderer at a file outside `public/templates`.
 */
import { describe, expect, it } from "vitest";
import { templateThumbnailSrc } from "./template-thumbnail";

describe("templateThumbnailSrc", () => {
	it("rewrites the catalog's origin-absolute path to a document-relative one", () => {
		// A packaged build serves the page from file://, where `/templates/...`
		// would resolve to the filesystem root instead of the app.
		expect(templateThumbnailSrc("/templates/houses-boutique.webp")).toBe("./templates/houses-boutique.webp");
	});

	it("accepts a bare filename and an absolute URL alike, keeping only the basename", () => {
		expect(templateThumbnailSrc("astropie.webp")).toBe("./templates/astropie.webp");
		expect(templateThumbnailSrc("https://example.com/shots/astropie.webp")).toBe("./templates/astropie.webp");
	});

	it("drops traversal instead of forwarding it", () => {
		expect(templateThumbnailSrc("../../../etc/passwd")).toBe("./templates/passwd");
		expect(templateThumbnailSrc("/templates/../../secrets.webp")).toBe("./templates/secrets.webp");
	});

	it("has nothing to show for a missing or empty thumbnail", () => {
		expect(templateThumbnailSrc(undefined)).toBeNull();
		expect(templateThumbnailSrc("")).toBeNull();
		expect(templateThumbnailSrc("/templates/")).toBeNull();
		expect(templateThumbnailSrc("..")).toBeNull();
	});
});
