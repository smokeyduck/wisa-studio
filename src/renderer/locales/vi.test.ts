import { describe, expect, it } from "vitest";
import { en } from "./en";
import { vi } from "./vi";
import identicalKeys from "./vi-identical.json";

const placeholders = (text: string) =>
	[...text.matchAll(/\{(\w+)\}/g)]
		.map(match => match[1])
		.filter(name => name !== "plural" && !name.endsWith("Plural"))
		.sort();

/** Latin letters outside ASCII that Vietnamese orthography requires. */
const VIETNAMESE_DIACRITIC = /[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

describe("Vietnamese locale completeness", () => {
	it("covers exactly the English source keys with nonempty translations", () => {
		expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
		for (const [key, value] of Object.entries(vi)) expect(value.trim(), key).not.toBe("");
	});

	it("preserves every parameter occurrence except the English plural suffix", () => {
		for (const key of Object.keys(en)) expect(placeholders(vi[key]), key).toEqual(placeholders(en[key]));
	});

	it("only leaves reviewed technical names and code in English", () => {
		for (const [key, value] of Object.entries(en)) {
			if (identicalKeys.includes(key)) {
				expect(vi[key], key).toBe(value);
				continue;
			}
			if (!/[a-z]/i.test(value.replace(/\{\w+\}/g, ""))) continue;
			expect(vi[key], key).not.toBe(value);
		}
	});

	it("retains protected technical terminology and named modes", () => {
		for (const [key, value] of Object.entries(en)) {
			if (/\bMCP\b/.test(value)) expect(vi[key], key).toMatch(/\bMCP\b/);
			if (/\bskills?\b/i.test(value)) expect(vi[key], key).toMatch(/\bskills?\b/i);
			if (/\bhooks?\b/i.test(value)) expect(vi[key], key).toMatch(/\bhooks?\b/i);
		}
		expect(vi["tabs.new.agent"]).toContain("Agent");
		expect(vi["tabs.new.chat"]).toContain("Chat");
	});

	// Unaccented Vietnamese ("Am thanh thong bao") is what a keyboard without a
	// Vietnamese IME produces: it reads as neither English nor Vietnamese. Any
	// value that is pure ASCII yet carries two or more common Vietnamese
	// function words is that mistake, not a technical name.
	it("writes Vietnamese with its diacritics", () => {
		const words = new Set(
			"khong duoc nguoi nhung phai trong cua ban voi mot nay khi thi cho den se da dang neu bat tat am thanh thong bao tieng chuong ngan ung dung hien xem chon mo dong luu xoa them sua tim kiem trang cai dat phien hoi thoai tin nhan gui ket qua cong cu viec lich su canh chi tiet mau sac hinh anh tep thu muc danh sach trinh don gian day du nho lon cao thap nhanh cham moi truoc sau giua ngoai len xuong trai tren duoi".split(
				" ",
			),
		);
		const offenders = Object.entries(vi).filter(([, value]) => {
			if (VIETNAMESE_DIACRITIC.test(value) || !/[a-z]/i.test(value)) return false;
			const tokens = value.toLowerCase().match(/[a-z]+/g) ?? [];
			return tokens.filter(token => words.has(token)).length >= 2;
		});
		expect(offenders).toEqual([]);
	});

	it("localizes visible starter templates with Vietnamese diacritics", () => {
		for (const key of Object.keys(en)) {
			if (
				(key.startsWith("chat.starter.") && key.endsWith(".prompt")) ||
				key === "planPanel.approveMessage" ||
				key === "planPanel.reviseMessage"
			) {
				expect(vi[key], key).toMatch(VIETNAMESE_DIACRITIC);
				expect(placeholders(vi[key]), key).toEqual(placeholders(en[key]));
			}
		}
	});
});
