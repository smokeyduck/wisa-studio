import { describe, expect, it } from "vitest";
import { detectLanguage } from "./language-detect";

describe("language detection", () => {
	it("matches a preferred locale the UI ships", () => {
		expect(detectLanguage({ locale: "vi-VN" })).toBe("vi");
		expect(detectLanguage({ locale: "en-US" })).toBe("en");
		expect(detectLanguage({ locale: "zh-CN" })).toBe("zh");
		expect(detectLanguage({ locale: "ru-RU" })).toBe("ru");
		expect(detectLanguage({ locale: "th-TH" })).toBe("th");
	});

	it("takes the first supported entry of a preference list", () => {
		// en-US leads, but the UI ships no `fr`, so `vi` is the first real match.
		expect(detectLanguage({ locales: ["en-US", "fr-FR", "vi-VN"], locale: "en-US" })).toBe("en");
		expect(detectLanguage({ locales: ["fr-FR", "vi-VN"] })).toBe("vi");
	});

	it("falls back to the time zone when no preference is supported", () => {
		expect(detectLanguage({ locale: "fr-FR", timeZone: "Asia/Ho_Chi_Minh" })).toBe("vi");
		expect(detectLanguage({ timeZone: "Asia/Bangkok" })).toBe("th");
		expect(detectLanguage({ timeZone: "Europe/Moscow" })).toBe("ru");
		expect(detectLanguage({ timeZone: "Asia/Shanghai" })).toBe("zh");
	});

	it("prefers an explicit preference over the zone", () => {
		expect(detectLanguage({ locale: "th-TH", timeZone: "Asia/Ho_Chi_Minh" })).toBe("th");
	});

	it("lands on English for an empty or unrecognized environment", () => {
		expect(detectLanguage({})).toBe("en");
		expect(detectLanguage({ locale: "", locales: [], timeZone: "UTC" })).toBe("en");
		expect(detectLanguage({ locale: "de-DE", timeZone: "Europe/Berlin" })).toBe("en");
	});
});
