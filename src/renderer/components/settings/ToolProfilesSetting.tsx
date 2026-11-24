import { useEffect, useState } from "react";
import {
	CODING_EDIT_MODES,
	CODING_PROFILE_TOOLS,
	CODING_TOOL_PROFILE_PREF,
	type CodingToolProfile,
	readCodingToolProfile,
	readWorkToolProfile,
	WORK_PROFILE_TOOLS,
	WORK_TOOL_PROFILE_PREF,
	type WorkToolProfile,
} from "../../../shared/tool-profiles";
import { saveGuiPreference } from "../../lib/display-preferences";
import { useT } from "../../lib/i18n";
import { Button } from "../common";
import { Section } from "./editors/Section";

function ToolChoices<T extends string>({
	isDisabled,
	tools,
	isChecked,
	onChange,
}: {
	isDisabled?: (tool: T) => boolean;
	tools: readonly T[];
	isChecked: (tool: T) => boolean;
	onChange: (tool: T, checked: boolean) => void;
}) {
	const t = useT();
	return (
		<div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
			{tools.map(tool => (
				<label className="flex items-center gap-2 py-1 text-omp-sm text-(--omp-text)" key={tool}>
					<input
						checked={isChecked(tool)}
						className="accent-(--omp-accent)"
						disabled={isDisabled?.(tool)}
						onChange={event => onChange(tool, event.target.checked)}
						type="checkbox"
					/>
					{tool === "task" ? <span>{t("settings.toolProfiles.subagents")}</span> : <code>{tool}</code>}
				</label>
			))}
		</div>
	);
}

export function ToolProfilesSetting() {
	const t = useT();
	const [coding, setCoding] = useState<CodingToolProfile | null>(null);
	const [work, setWork] = useState<WorkToolProfile | null>(null);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		let active = true;
		const loadCoding = (raw?: unknown) => {
			if (active) setCoding(readCodingToolProfile(raw));
		};
		const loadWork = (raw?: unknown) => {
			if (active) setWork(readWorkToolProfile(raw));
		};
		void window.omp.prefs.get(CODING_TOOL_PROFILE_PREF).then(loadCoding, () => loadCoding());
		void window.omp.prefs.get(WORK_TOOL_PROFILE_PREF).then(loadWork, () => loadWork());
		return () => {
			active = false;
		};
	}, []);

	const saveCoding = async (next: CodingToolProfile | null) => {
		setSaving(true);
		setSaved(false);
		setSaved(await saveGuiPreference(CODING_TOOL_PROFILE_PREF, next, () => setCoding(readCodingToolProfile(next))));
		setSaving(false);
	};
	const saveWork = async (next: WorkToolProfile | null) => {
		setSaving(true);
		setSaved(false);
		setSaved(await saveGuiPreference(WORK_TOOL_PROFILE_PREF, next, () => setWork(readWorkToolProfile(next))));
		setSaving(false);
	};

	return (
		<Section id="setting-gui-toolProfiles" title={t("settings.toolProfiles.title")}>
			<p className="mb-2 text-omp-sm text-(--omp-muted)">{t("settings.toolProfiles.availability")}</p>
			<p className="mb-3 text-omp-sm text-(--omp-muted)" role="status">
				{saved && <span className="mr-2 font-medium text-(--omp-success)">{t("common.saved")}</span>}
				{t("settings.toolProfiles.restart")}
			</p>
			<fieldset
				className="mb-4 space-y-2 rounded-lg border border-(--omp-border) px-3 pb-3"
				disabled={!coding || saving}
			>
				<legend className="px-1 text-omp-md font-medium text-(--omp-text)">
					{t("settings.toolProfiles.coding")}
				</legend>
				<p className="text-omp-sm text-(--omp-muted)">{t("settings.toolProfiles.codingDesc")}</p>
				<ToolChoices
					isChecked={tool => coding !== null && !coding.disabled.includes(tool)}
					onChange={(tool, checked) => {
						if (!coding) return;
						const disabled = checked ? coding.disabled.filter(name => name !== tool) : [...coding.disabled, tool];
						void saveCoding({ ...coding, disabled });
					}}
					tools={CODING_PROFILE_TOOLS}
				/>
				<label className="flex flex-wrap items-center gap-2 text-omp-sm text-(--omp-text)">
					<span>{t("settings.toolProfiles.editMode")}</span>
					<select
						className="max-w-full rounded-md border border-(--omp-input-border) bg-(--omp-input-bg) px-2.5 py-1.5"
						onChange={event => {
							const editMode = CODING_EDIT_MODES.find(mode => mode === event.target.value);
							if (coding && editMode) void saveCoding({ ...coding, editMode });
						}}
						value={coding?.editMode ?? "hashline"}
					>
						{CODING_EDIT_MODES.map(mode => (
							<option key={mode} value={mode}>
								{t(`settings.toolProfiles.edit.${mode}`)}
							</option>
						))}
					</select>
				</label>
				<p className="text-omp-sm text-(--omp-muted)">{t("settings.toolProfiles.editDesc")}</p>
				<Button onClick={() => void saveCoding(null)} size="sm" type="button" variant="secondary">
					{t("settings.toolProfiles.reset")}
				</Button>
			</fieldset>
			<fieldset className="space-y-2 rounded-lg border border-(--omp-border) px-3 pb-3" disabled={!work || saving}>
				<legend className="px-1 text-omp-md font-medium text-(--omp-text)">
					{t("settings.toolProfiles.work")}
				</legend>
				<p className="text-omp-sm text-(--omp-muted)">{t("settings.toolProfiles.workDesc")}</p>
				<ToolChoices
					isChecked={tool => work?.tools.includes(tool) ?? false}
					isDisabled={tool => tool === "computer"}
					onChange={(tool, checked) => {
						if (!work) return;
						const tools = checked ? [...work.tools, tool] : work.tools.filter(name => name !== tool);
						void saveWork({ tools });
					}}
					tools={WORK_PROFILE_TOOLS}
				/>
				<Button onClick={() => void saveWork(null)} size="sm" type="button" variant="secondary">
					{t("settings.toolProfiles.reset")}
				</Button>
			</fieldset>
		</Section>
	);
}
