# Vietnamese interface localization

Vietnamese extends the English/Chinese/Russian/Thai localization. The globe opens an explicit English / Русский / 中文 / ไทย / Tiếng Việt menu. The preference is stored in the existing `prefs.language` and `omp.lang` keys, broadcast to every window, and used by native menus, tray labels, notifications, settings search, and date formatting.

## Translation surfaces

- `src/renderer/locales/vi.ts`: all 4,211 English UI keys (every key, none omitted).
- `src/main/native-vi.ts`: application/browser menus, native dialogs, update errors, and tray labels.
- `src/renderer/components/settings/schema-vi.ts`: setting labels/descriptions and section headings for the bundled Core schema.
- `src/renderer/components/settings/schema-option-vi.ts`: display labels/descriptions for enum options. Underlying option values and setting paths are unchanged.
- `src/shared/languages.ts`: supported language IDs, names and formatting locales.
- `src/shared/language-detect.ts`: preference → IANA time zone → English, shared by main and renderer.

## Language selection

An explicit preference always wins. With no preference, the first preferred locale the UI ships selects the language; a preference list that ships nothing supported (`en-US` on a Vietnamese machine is the common case) falls through to the IANA time zone (`Asia/Ho_Chi_Minh` → `vi`) and only then to English.

## Terminology

- Kept in English: `MCP`, `API`, `CLI`, `Git`, `commit`, `hook`/`hooks`, `skill`/`skills`, `branch`, model and provider names, tool names, theme names, `PLAN`.
- Translated: menus, dialogs, settings prose, tool descriptions, empty/error states.
- Placeholders (`{name}`, `{count}`, …) must survive verbatim; Vietnamese drops the English `{plural}` suffix, which the guard test allows.

## Guards

- `src/renderer/locales/vi.test.ts`: key-set parity with `en`, no empty values, placeholder parity, and a reviewed allowlist (`vi-identical.json`) for values that legitimately stay English.
- `src/renderer/components/settings/schema-localization.test.ts`: `vi` resolves labels, descriptions, group titles and enum text and is searchable.
- `bun scripts/check-schema-locale.ts <sidecar-path> --lang vi` (or `bun run check:locale <sidecar-path> --lang vi`): validates the complete `vi` tables against the schema of the actually bundled Core.

When the bundled Core changes, run the schema check. Translate added keys/options, review terminology, and inspect screens for clipping. A saved language preference survives normal updates using the same application profile; the new binary must also contain Vietnamese.
