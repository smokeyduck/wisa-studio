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
	if (path === "speech.enabled") {
		return language === "th"
			? { label: "อ่านออกเสียง", description: "อ่านคำตอบที่ส่งเข้ามาใหม่บนอุปกรณ์นี้" }
			: { label: "Read aloud", description: "Read new responses aloud on this device." };
	}
	if (path === "speech.mode") {
		return language === "th"
			? { label: "โหมดการอ่านออกเสียง", description: "ทั้งหมด = ข้อความผู้ช่วยและผลลัพธ์เครื่องมือ; ผู้ช่วย = เฉพาะข้อความผู้ช่วย; ข้อความสุดท้าย = เมื่อจบรอบ" }
			: { label: "Read-aloud mode", description: "All: assistant messages and tool results. Assistant: assistant messages only. Final: the last assistant message at the end of the run." };
	}
	if (path === "speech.voice") {
		return language === "th"
			? { label: "เสียงอ่านภาษาอังกฤษ", description: "เสียง Phonon ในเครื่องสำหรับภาษาอังกฤษเท่านั้น" }
			: { label: "English read-aloud voice", description: "Local Phonon voice for English only." };
	}
	if (path === "speech.speed") {
		return language === "th"
			? { label: "ความเร็วการอ่านภาษาอังกฤษ", description: "ความเร็วของเสียง Phonon: 1 = ปกติ ช่วง 0.8–1.3" }
			: { label: "English read-aloud speed", description: "Phonon playback speed: 1 = normal (0.8–1.3)." };
	}
	if (path === "stt.language") {
		return language === "th"
			? { label: "ภาษาการถอดเสียง", description: "ใช้ vi สำหรับภาษาเวียดนาม หรือเว้นว่างให้โมเดลตรวจจับภาษาเอง" }
			: { label: "Dictation language", description: "Use vi for Vietnamese, or clear the input to request language detection. English-only models ignore this setting." };
	}
	if (language === "th" && path === "task.judgeRouting") {
		return {
			label: "ให้ Judge เลือกเส้นทางโมเดล",
			description:
				"เมื่อเปิด ระบบจะส่งข้อความสั้น ๆ จากคำอธิบายงานของเอเจนต์ย่อยที่ไม่ได้ตรึงโมเดลไปยังบริการ Judge โดยไม่ส่งบทสนทนาหรือบริบทร่วม Judge เลือกได้เฉพาะเส้นทางโมเดลแชตที่การตั้งค่าอนุญาต โดยการเลือกที่ระบุไว้จะมีลำดับก่อน หาก Judge ใช้งานไม่ได้หรืองดเลือก ระบบจะใช้การกำหนดเส้นทางตามปกติ การตั้งค่าโปรเจกต์เปิดคุณสมบัตินี้แทนคุณไม่ได้",
		};
	}
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
	if (text === "All (messages + thinking)" && (language === "en" || language === "th"))
		return language === "th" ? "ทั้งหมด (ข้อความและผลลัพธ์เครื่องมือ)" : "All (messages + tool results)";
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
