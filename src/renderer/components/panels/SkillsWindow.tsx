/**
 * Skills page, opened from the sidebar: the same master-detail skills manager
 * Settings hosts, but as a workspace page like Memory and Plugins.
 *
 * Skills are something you consult while working, not something you configure
 * once, so they belong beside the session instead of two clicks into Settings.
 * The page body is the Settings page itself, so the two entry points can never
 * drift apart.
 */

import { BookOpen } from "lucide-react";
import { useT } from "../../lib/i18n";
import { useUiStore } from "../../stores/ui";
import { Modal } from "../common";
import { SkillsSettingsPage } from "../settings/SkillsSettingsPage";

export function SkillsWindow() {
	const t = useT();
	const open = useUiStore(s => s.skillsOpen);
	const close = useUiStore(s => s.closeSkills);
	return (
		<Modal
			bodyClassName="p-0"
			dockable
			onClose={close}
			open={open}
			size="full"
			title={
				<span className="flex items-center gap-2">
					<BookOpen aria-hidden="true" size={15} />
					{t("titlebar.skills")}
				</span>
			}
		>
			{/* The page scrolls its own panes, so this only pads the frame. */}
			<div className="flex h-full min-h-0 flex-col px-5 py-4">
				<SkillsSettingsPage query="" />
			</div>
		</Modal>
	);
}
