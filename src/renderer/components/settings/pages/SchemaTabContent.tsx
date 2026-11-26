/**
 * SchemaTabContent: all settings for one schema tab, sectioned by its
 * ordered groups. Extracted verbatim from SettingsWindow.tsx.
 */

import { useEffect, useMemo, useState } from "react";
import type { SettingEntry } from "../../../../shared/rpc-types";
import {
	type VietnameseVoice,
	vietnameseVoicePreference,
	VIETNAMESE_VOICE_PREF,
} from "../../../../shared/speech-language";
import { useLang, useT } from "../../../lib/i18n";
import { previewVietnameseVoice, stopVoicePreview, useSpeechPlaying } from "../../../lib/voice";
import { toast } from "../../../stores/toast";
import { Section } from "../editors/Section";
import { SchemaSettingRow } from "../SchemaSettingRow";
import { schemaGroupTitle } from "../schema-localization";
import { groupSchemaEntries, isSettingVisibleInGui } from "../settings-schema-utils";

function VietnameseVoiceSetting() {
	const t = useT();
	const [voice, setVoice] = useState<VietnameseVoice>("auto");
	const [ready, setReady] = useState(false);
	const playing = useSpeechPlaying(null);
	useEffect(() => {
		let cancelled = false;
		void window.omp.prefs
			.get(VIETNAMESE_VOICE_PREF)
			.then(value => {
				if (!cancelled) setVoice(vietnameseVoicePreference(value));
			})
			.catch(() => undefined)
			.finally(() => {
				if (!cancelled) setReady(true);
			});
		return () => {
			cancelled = true;
			stopVoicePreview();
		};
	}, []);

	async function changeVoice(next: VietnameseVoice): Promise<void> {
		stopVoicePreview();
		setReady(false);
		try {
			await window.omp.prefs.set(VIETNAMESE_VOICE_PREF, next);
			setVoice(next);
		} catch (cause) {
			toast({ variant: "error", title: t("settings.saveFailed"), message: String(cause) });
		} finally {
			setReady(true);
		}
	}

	return (
		<div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--omp-border) py-3">
			<div>
				<label htmlFor="vietnamese-speech-voice" className="text-omp-sm text-(--omp-text)">
					{t("voice.viVoice.label")}
				</label>
				<p className="text-omp-xs text-(--omp-muted)">{t("voice.viVoice.description")}</p>
			</div>
			<div className="flex items-center gap-2">
				<select
					id="vietnamese-speech-voice"
					className="rounded border border-(--omp-border) bg-(--omp-surface) px-2 py-1 text-omp-sm text-(--omp-text)"
					value={voice}
					disabled={!ready}
					onChange={event => void changeVoice(vietnameseVoicePreference(event.target.value))}
				>
					<option value="auto">{t("voice.viVoice.auto")}</option>
					<option value="vais1000">{t("voice.viVoice.vais1000")}</option>
					<option value="system">{t("voice.viVoice.system")}</option>
				</select>
				<button
					type="button"
					className="omp-pressable rounded border border-(--omp-border) px-2 py-1 text-omp-sm text-(--omp-text)"
					disabled={!ready}
					onClick={() => (playing ? stopVoicePreview() : previewVietnameseVoice(voice))}
				>
					{t(playing ? "voice.speak.stop" : "voice.viVoice.preview")}
				</button>
			</div>
		</div>
	);
}

/** All settings for one schema tab, sectioned by its ordered groups. */
export function SchemaTabContent({
	tabId,
	groups,
	entries,
	values,
	onCommitted,
}: {
	tabId: string;
	groups: string[];
	entries: SettingEntry[];
	values: Record<string, unknown>;
	onCommitted: (path: string, value: unknown) => void;
}) {
	// Drop TUI-only entries and entries whose condition resolves false. Groups
	// left empty by either filter emit no heading.
	const visibleEntries = useMemo(
		() => entries.filter(entry => isSettingVisibleInGui(entry, values)),
		[entries, values],
	);
	const { tabEntries, ungrouped, orderedGroups } = useMemo(
		() => groupSchemaEntries(visibleEntries, tabId, groups),
		[visibleEntries, tabId, groups],
	);
	const { lang } = useLang();
	const t = useT();

	if (tabEntries.length === 0) {
		return <div className="py-10 text-center text-omp-xs text-(--omp-dim)">{t("settings.sectionEmpty")}</div>;
	}

	const renderRow = (entry: SettingEntry) => (
		<div id={`setting-${entry.path}`} key={entry.path} className="scroll-mt-4">
			<SchemaSettingRow entry={entry} onCommitted={onCommitted} value={values[entry.path]} />
			{entry.path === "speech.voice" && <VietnameseVoiceSetting />}
		</div>
	);

	return (
		<>
			{ungrouped.length > 0 && <div className="mb-4">{ungrouped.map(renderRow)}</div>}
			{orderedGroups.map(group => (
				<Section key={group.name} title={schemaGroupTitle(lang, group.name)}>
					{group.entries.map(renderRow)}
				</Section>
			))}
		</>
	);
}
