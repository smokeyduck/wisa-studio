/**
 * The web-template catalog: what the Templates page lists and installs.
 *
 * The catalog itself is maintained outside this repository and served by a
 * Cloudflare worker (`koda-templates-catalog`). Main fetches it, caches it, and
 * falls back to the copy bundled at build time, so the page works on a plane
 * and on the day the worker is down. The renderer only ever sees the parsed
 * shape below — every entry is validated in main before it crosses IPC.
 */

export type TemplateStack = "astro" | "nextjs" | "vite-react" | "html-tailwind" | string;

export interface TemplateEntry {
	id: string;
	name: string;
	/** Vietnamese name when the catalog gives one; the page prefers it in `vi`. */
	nameVi?: string;
	description: { en: string; vi?: string };
	category: string;
	tags: string[];
	stack: TemplateStack;
	source: {
		provider: "github";
		/** `owner/repo`. */
		repo: string;
		/** Commit sha the tarball is pinned to. */
		ref: string;
		license: string;
		licenseUrl?: string;
		attribution?: string;
	};
	demoUrl?: string;
	thumbnail?: string;
	featured?: boolean;
	install: {
		type: "tarball";
		url: string;
		/** The single folder codeload wraps the repository in. */
		stripPrefix?: string;
	};
}

export interface TemplateCatalog {
	version: number;
	updatedAt?: string;
	templates: TemplateEntry[];
}

/** Where a catalog came from — the page says so when it is not the live one. */
export type TemplateCatalogOrigin = "remote" | "cache" | "bundled";

export type IpcTemplatesCatalogResult =
	| {
			status: "ok";
			catalog: TemplateCatalog;
			origin: TemplateCatalogOrigin;
			fetchedAt?: string;
			/** Template id → folder already unpacked on disk, so a reopen still offers "Open". */
			installed?: Record<string, string>;
	  }
	| { status: "unavailable"; error: string };

export interface IpcTemplateInstallPayload {
	/** Catalog entry id. */
	id: string;
}

export type IpcTemplateInstallResult =
	| {
			status: "ok";
			/** Absolute folder the template was unpacked into. */
			dir: string;
			entry: TemplateEntry;
	  }
	| { status: "error"; error: string };

/** Categories the catalog uses, in the order the page lists them. */
export const TEMPLATE_CATEGORIES: readonly string[] = [
	"saas-landing",
	"landing-generic",
	"agency-studio",
	"portfolio",
	"blog-magazine",
	"ecommerce",
	"real-estate",
	"restaurant-cafe",
	"hotel-travel",
	"clinic-health",
	"beauty-salon",
	"spa-wellness",
	"fitness",
	"education",
	"nonprofit",
	"wedding-event",
	"legal-finance",
	"construction",
	"photography",
];

/** The text a search box matches against: name, description, tags, stack, category. */
export function templateSearchText(entry: TemplateEntry): string {
	return [
		entry.name,
		entry.nameVi ?? "",
		entry.description.en,
		entry.description.vi ?? "",
		entry.stack,
		entry.category,
		...entry.tags,
	]
		.join(" ")
		.toLowerCase();
}
