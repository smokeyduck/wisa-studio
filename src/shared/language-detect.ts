/**
 * Language detection shared by native menus and the renderer. Supported
 * non-English language preferences beat location hints. The native region or
 * time zone can disambiguate the generic English defaults shipped by Electron.
 * A manually chosen app language is handled by the caller and always wins.
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

const REGION_LANGUAGES: Record<string, Language> = { VN: "vi", TH: "th", CN: "zh", TW: "zh", RU: "ru" };

export interface LanguageDetectionInput {
	/** Primary locale, e.g. `navigator.language` or `app.getLocale()`. */
	locale?: string;
	/** Full preference list, most preferred first. Falls back to `[locale]`. */
	locales?: readonly string[];
	/** Native ISO country code; independent of the display language. */
	region?: string;
	/** IANA zone, e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
	timeZone?: string;
	/** Windows maps its shared Bangkok/Hanoi/Jakarta zone to Asia/Bangkok. */
	windows?: boolean;
}

export function detectLanguage({ locale, locales, region, timeZone, windows }: LanguageDetectionInput = {}): Language {
	const preferred = locales?.length ? locales : locale ? [locale] : [];
	let localeRegion: string | undefined;
	for (const candidate of preferred) {
		const [base, ...parts] = candidate.trim().split(/[-_]/);
		const language = base?.toLowerCase();
		if (isLanguage(language) && language !== "en") return language;
		localeRegion ??= parts.find(part => /^[A-Za-z]{2}$/.test(part))?.toUpperCase();
	}
	const zone = timeZone?.trim().toLowerCase() ?? "";
	// The shared Windows zone is not evidence of Thailand. Prefer the product's
	// Vietnamese default if no supported language or region disambiguates it.
	const zoneLanguage = windows && zone === "asia/bangkok" ? "vi" : TIME_ZONE_LANGUAGES[zone];
	return REGION_LANGUAGES[region?.trim().toUpperCase() ?? localeRegion ?? ""] ?? zoneLanguage ?? "en";
}
