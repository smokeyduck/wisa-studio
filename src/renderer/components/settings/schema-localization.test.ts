import { describe, expect, it } from "vitest";
import type { SettingEntry } from "../../../shared/rpc-types";
import { schemaGroupTitle, schemaOptionText, settingTranslation } from "./schema-localization";
import { RU_SCHEMA_OPTION_TEXT } from "./schema-option-ru";
import { VI_SCHEMA_OPTION_TEXT } from "./schema-option-vi";
import { RU_GROUP_TITLES, RU_SETTINGS } from "./schema-ru";
import { VI_GROUP_TITLES, VI_SETTINGS } from "./schema-vi";
import { matchesSettingSearch } from "./settings-schema-utils";

describe("Vietnamese schema localization", () => {
	it("localizes labels, descriptions, groups and enum prose", () => {
		const label = settingTranslation("vi", "update.channel")?.label ?? "";
		const description = settingTranslation("vi", "update.channel")?.description ?? "";
		expect(label).not.toBe("Core Update Channel");
		expect(description).not.toBe("");
		expect(schemaOptionText("vi", "Stable")).not.toBe("Stable");
		expect(schemaOptionText("vi", "unregistered-enum-value")).toBe("unregistered-enum-value");
	});
	it("keeps untranslated group titles on their English source", () => {
		expect(schemaGroupTitle("vi", "Display")).not.toBe("Display");
		expect(schemaGroupTitle("vi", "Skills")).toBe("Skills");
	});
	it("searches Vietnamese displayed setting text alongside wire identifiers", () => {
		const entry = { path: "update.channel", label: "Core Update Channel", type: "enum" } as SettingEntry;
		const label = settingTranslation("vi", entry.path)?.label ?? "";
		expect(matchesSettingSearch(entry, label)).toBe(true);
	});
});
const SETTINGS = { ru: RU_SETTINGS, vi: VI_SETTINGS };
const GROUPS = { ru: RU_GROUP_TITLES, vi: VI_GROUP_TITLES };
const OPTIONS = { ru: RU_SCHEMA_OPTION_TEXT, vi: VI_SCHEMA_OPTION_TEXT };

describe("schema translation tables", () => {
	it("carries a nonempty label and description for every entry both locales list", () => {
		// A missing key silently falls back to the English wire string, which is
		// how ru and vi drifted a whole sidecar release behind. check:locale
		// gates the full schema against a built binary; this keeps the tables
		// internally honest without one.
		for (const locale of ["ru", "vi"] as const) {
			for (const [path, entry] of Object.entries(SETTINGS[locale])) {
				expect(entry.label?.trim(), `${locale} ${path} label`).toBeTruthy();
				if (entry.description !== undefined) {
					expect(entry.description.trim(), `${locale} ${path} description`).toBeTruthy();
				}
			}
			for (const [group, title] of Object.entries(GROUPS[locale])) {
				expect(title.trim(), `${locale} group ${group}`).toBeTruthy();
			}
			for (const [option, text] of Object.entries(OPTIONS[locale])) {
				expect(text.trim(), `${locale} option ${option}`).toBeTruthy();
			}
		}
	});
});

describe("Russian schema localization", () => {
	it("localizes labels, descriptions, groups and enum prose", () => {
		expect(settingTranslation("ru", "update.channel")?.label).toMatch(/[А-Яа-яЁё]/);
		expect(settingTranslation("ru", "update.channel")?.description).toMatch(/[А-Яа-яЁё]/);
		expect(schemaGroupTitle("ru", "Skills")).toBe("Skills");
		expect(schemaOptionText("ru", "Stable")).toMatch(/[А-Яа-яЁё]/);
		expect(schemaOptionText("ru", "unregistered-enum-value")).toBe("unregistered-enum-value");
	});
	it("preserves English wire text and existing Chinese translations", () => {
		expect(settingTranslation("en", "update.channel")).toBeUndefined();
		expect(schemaGroupTitle("en", "Display")).toBe("Display");
		expect(schemaGroupTitle("zh", "Display")).toBe("显示");
	});
	it("searches Russian displayed setting text alongside wire identifiers", () => {
		const entry = { path: "update.channel", label: "Core Update Channel", type: "enum" } as SettingEntry;
		const label = settingTranslation("ru", entry.path)?.label ?? "";
		expect(label).not.toBe("");
		expect(matchesSettingSearch(entry, label)).toBe(true);
	});
});
