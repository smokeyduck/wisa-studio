import type { Language } from "../../../shared/languages";
import { RU_SCHEMA_OPTION_TEXT } from "./schema-option-ru";
import { VI_SCHEMA_OPTION_TEXT } from "./schema-option-vi";
import { ZH_SCHEMA_OPTION_TEXT } from "./schema-option-zh";
import { RU_GROUP_TITLES, RU_SETTINGS } from "./schema-ru";
import { VI_GROUP_TITLES, VI_SETTINGS } from "./schema-vi";
import { ZH_GROUP_TITLES, ZH_SETTINGS } from "./schema-zh";

export function settingTranslation(language: Language, path: string) {
	if (language === "ru") return RU_SETTINGS[path];
	if (language === "vi") return VI_SETTINGS[path];
	if (language === "zh") return ZH_SETTINGS[path];
	if (path === "display.pinnedAgents") {
		return {
			label: "Subagent cards",
			description:
				"Show subagents where they started in the conversation, even after they finish. Off hides the cards; Collapsed shows brief details; Full adds progress.",
		};
	}
}

export function schemaGroupTitle(language: Language, title: string): string {
	const titles =
		language === "ru"
			? RU_GROUP_TITLES
			: language === "vi"
				? VI_GROUP_TITLES
				: language === "zh"
					? ZH_GROUP_TITLES
					: undefined;
	return titles?.[title] ?? title;
}

export function schemaOptionText(language: Language, text: string): string {
	const options =
		language === "ru"
			? RU_SCHEMA_OPTION_TEXT
			: language === "vi"
				? VI_SCHEMA_OPTION_TEXT
				: language === "zh"
					? ZH_SCHEMA_OPTION_TEXT
					: undefined;
	return options?.[text] ?? text;
}
