import { describe, expect, it } from "vitest";
import { detectSpeechLanguage, looksVietnamese } from "./speech-language";

describe("looksVietnamese", () => {
	it("recognizes Vietnamese-only letters", () => {
		expect(looksVietnamese("Đã kết nối")).toBe(true);
		expect(looksVietnamese("Tôi đang ở đây")).toBe(true);
	});

	it("recognizes tone marks without the base letters", () => {
		expect(looksVietnamese("máy chạy tốt")).toBe(true);
	});

	it("recognizes unaccented Vietnamese from its function words", () => {
		expect(looksVietnamese("toi khong biet cach lam viec nay")).toBe(true);
		expect(looksVietnamese("ban co the giup toi duoc khong")).toBe(true);
	});

	it("rejects plain English", () => {
		expect(looksVietnamese("The build passed and the tests are green")).toBe(false);
		// A single borrowed word is not enough.
		expect(looksVietnamese("I had to ban that user")).toBe(false);
	});

	it("rejects other scripts", () => {
		expect(looksVietnamese("Сборка прошла успешно")).toBe(false);
		expect(looksVietnamese("ビルドが完了しました")).toBe(false);
	});
});

describe("detectSpeechLanguage", () => {
	it("speaks English text in English", () => {
		expect(detectSpeechLanguage("Build finished in 3s")).toBe("en");
	});

	it("speaks Vietnamese text in Vietnamese", () => {
		expect(detectSpeechLanguage("Đã xong")).toBe("vi");
		expect(detectSpeechLanguage("toi khong biet cach lam")).toBe("vi");
		expect(detectSpeechLanguage("Xin chào")).toBe("vi");
		expect(detectSpeechLanguage("XIN CHA\u0300O")).toBe("vi");
	});

	it("treats language-free text as English", () => {
		expect(detectSpeechLanguage("12345")).toBe("en");
	});
});
