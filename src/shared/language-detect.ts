/**
 * Language detection used by both processes. The renderer passes
 * `navigator.languages` + the resolved IANA time zone; the main process passes
 * `app.getLocale()` + the same `Intl` zone. Kept dependency-free (no Electron,
 * no `navigator`) so both callers and the tests can run it anywhere.
 *
 * Order: the first preferred locale the UI ships → time zone → English. The
 * zone fallback exists because a Vietnamese or Thai user's browser is often set
 * to `en-US`, and an unsupported preference list says nothing about what they
 * read. Only the principal zones per shipped language are listed; everything
 * else falls through to English.
 */
import { isLanguage, type Language } from "./languages";

const TIME_ZONE_LANGUAGES: Record<string, Language> = {
	"asia/ho_chi_minh": "vi",
	"asia/saigon": "vi",
	"asia/bangkok": "th",
	"asia/shanghai": "zh",
	"asia/chongqing": "zh",
	"asia/hong_kong": "zh",
	"asia/taipei": "zh",
	"asia/singapore": "zh",
	"europe/moscow": "ru",
	"asia/yekaterinburg": "ru",
	"asia/novosibirsk": "ru",
	"asia/vladivostok": "ru",
};

export interface LanguageDetectionInput {
	/** Primary locale, e.g. `navigator.language` or `app.getLocale()`. */
	locale?: string;
	/** Full preference list, most preferred first. Falls back to `[locale]`. */
	locales?: readonly string[];
	/** IANA zone, e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
	timeZone?: string;
}

export function detectLanguage({ locale, locales, timeZone }: LanguageDetectionInput = {}): Language {
	const preferred = locales?.length ? locales : locale ? [locale] : [];
	for (const candidate of preferred) {
		const base = candidate.toLowerCase().split(/[-_]/)[0];
		if (isLanguage(base)) return base;
	}
	const byZone = TIME_ZONE_LANGUAGES[timeZone?.trim().toLowerCase() ?? ""];
	if (byZone && isLanguage(byZone)) return byZone;
	return "en";
}
