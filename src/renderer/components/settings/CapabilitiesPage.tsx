import { useEffect, useState } from "react";
import { forkSessionFromGui, prefillComposer, retryFailedTurn } from "../../lib/command-registry";
import { exportSessionHtml } from "../../lib/export-session";
import { useT } from "../../lib/i18n";
import { clearSessionContext, retryLastTurn } from "../../lib/messages";
import { useTabRpc } from "../../lib/tab-rpc";
import { dumpTranscriptToClipboard } from "../../lib/transcript-copy";
import { openHandoffDialog } from "../../stores/fork-handoff";
import { useSessionStore } from "../../stores/session";
import { toast } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";
import { Modal } from "../common/Modal";
import { CapabilitiesHome, type CapabilityTarget } from "./pages/CapabilitiesHome";
import {
	COMMANDS_TAB_ID,
	GUI_TAB_ID,
	HOOKS_TAB_ID,
	MCP_TAB_ID,
	RESOURCES_TAB_ID,
	type SettingsResponseData,
	SKILLS_TAB_ID,
	SSH_TAB_ID,
	UPDATES_TAB_ID,
} from "./settings-window-model";

const CAPABILITY_SETTINGS = ["advisor.enabled", "memory.backend", "ttsr.enabled"];

export function CapabilitiesPage() {
	const t = useT();
	const { getSettings } = useTabRpc();
	const sidecarReady = useSessionStore(state => state.status === "ready");
	const sessionId = useSessionStore(state => state.sessionId);
	const close = useUiStore(state => state.returnToConversation);
	const [settings, setSettings] = useState<SettingsResponseData | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new session can have different effective settings.
	useEffect(() => {
		setSettings(null);
		if (!sidecarReady) return;
		let version = 0;
		const refresh = async () => {
			const current = ++version;
			try {
				const response = await getSettings(CAPABILITY_SETTINGS);
				if (current === version && response.success && response.data) {
					setSettings(response.data as SettingsResponseData);
				}
			} catch {
				// Leave the last known values in place until the next config update.
			}
		};
		void refresh();
		const unsubscribe = window.omp.events.onConfigUpdate(() => void refresh());
		return () => {
			++version;
			unsubscribe();
		};
	}, [getSettings, sessionId, sidecarReady]);

	const openCapabilityTarget = (target: CapabilityTarget) => {
		const ui = useUiStore.getState();
		const runAsync = (action: () => Promise<unknown>) => {
			close();
			void action().catch(error => toast({ variant: "error", title: t("palette.failed"), message: String(error) }));
		};
		const prefill = (text: string) => {
			close();
			prefillComposer(text);
		};
		switch (target) {
			case "model":
				ui.openModelPicker();
				return;
			case "modelRoles":
				ui.openModelRoles();
				return;
			case "modelCompare":
				ui.openModelCompare();
				return;
			case "benchmark":
				ui.openBenchmark();
				return;
			case "providers":
				ui.openProviders();
				return;
			case "providerConfig":
				ui.openProviderConfig();
				return;
			case "usage":
				ui.openUsage();
				return;
			case "agents":
				ui.openAgentHub();
				return;
			case "skills":
				ui.openSettings(SKILLS_TAB_ID);
				return;
			case "mcp":
				ui.openSettings(MCP_TAB_ID);
				return;
			case "resources":
				ui.openSettings(`${RESOURCES_TAB_ID}:catalog`);
				return;
			case "marketplaces":
				ui.openSettings(`${RESOURCES_TAB_ID}:marketplaces`);
				return;
			case "templates":
				ui.openSettings(`${RESOURCES_TAB_ID}:templates`);
				return;
			case "memoryResources":
				ui.openSettings(`${RESOURCES_TAB_ID}:memory`);
				return;
			case "hooks":
				ui.openSettings(HOOKS_TAB_ID);
				return;
			case "commands":
				ui.openSettings(COMMANDS_TAB_ID);
				return;
			case "security":
				ui.openSecurityPage();
				return;
			case "ssh":
				ui.openSettings(SSH_TAB_ID);
				return;
			case "updates":
				ui.openSettings(UPDATES_TAB_ID);
				return;
			case "modes":
				ui.openModes();
				return;
			case "vibe":
				ui.openModes("vibe");
				return;
			case "collab":
				ui.openCollab();
				return;
			case "live":
				ui.openLive();
				return;
			case "debug":
				ui.openDebug();
				return;
			case "clear":
				runAsync(clearSessionContext);
				return;
			case "import":
				ui.openImportDialog();
				return;
			case "sessionInfo":
				ui.openSessionInfo();
				return;
			case "sessionTree":
				ui.openSessionTree();
				return;
			case "share":
				ui.openShareSession();
				return;
			case "handoff":
				openHandoffDialog();
				return;
			case "export":
				runAsync(exportSessionHtml);
				return;
			case "dump":
				runAsync(dumpTranscriptToClipboard);
				return;
			case "fork":
				runAsync(forkSessionFromGui);
				return;
			case "retry":
				runAsync(retryFailedTurn);
				return;
			case "resend":
				runAsync(() =>
					retryLastTurn(() =>
						toast({
							variant: "warning",
							title: t("palette.retryNothing"),
							message: t("palette.retryNothingDesc"),
						}),
					),
				);
				return;
			case "btw":
				prefill("/btw ");
				return;
			case "tan":
				prefill("/tan ");
				return;
			case "omfg":
				prefill("/omfg ");
				return;
			case "guidedGoal":
				prefill("/guided-goal ");
				return;
			case "queue":
				prefill("-> ");
				return;
			case "workspaceDirs":
				ui.openWorkspaceDirs();
				return;
			case "prCenter":
				ui.openPrCenter();
				return;
			case "context":
				ui.openContextReport();
				return;
			case "tools":
				ui.openActiveTools();
				return;
			case "stats":
				ui.openStatsDashboard();
				return;
			case "jobs":
				ui.openJobs();
				return;
			case "hotkeys":
				ui.openHotkeys();
				return;
			case "theme":
				ui.openThemePicker();
				return;
			case "settings":
				ui.openSettings(GUI_TAB_ID);
				return;
			case "changelog":
				ui.openChangelog();
				return;
			case "copy":
				ui.openCopySelector();
				return;
			case "force":
				ui.openForceTool();
		}
	};

	const memoryBackend = settings?.values?.["memory.backend"];
	return (
		<Modal bodyClassName="p-0" dockable onClose={close} open title={t("sidebar.navigation.capabilities")}>
			<div className="settings-page-frame settings-content py-6">
				<CapabilitiesHome
					advisorActive={settings?.advisorActive}
					advisorEnabled={settings?.advisorEnabled ?? settings?.values?.["advisor.enabled"] === true}
					memoryBackend={typeof memoryBackend === "string" ? memoryBackend : ""}
					onConfigureAdvisor={() => useUiStore.getState().openSettings("model", "advisor")}
					onConfigureTtsr={() => useUiStore.getState().openSettings("context", "ttsr")}
					onOpenAgents={() => useUiStore.getState().openAgentHub("definitions")}
					onOpenCommandCenter={() => useUiStore.getState().openCommandPalette()}
					onOpenGoal={() => useUiStore.getState().openModes("goal")}
					onOpenLoop={() => useUiStore.getState().openModes("loop")}
					onOpenMemory={() => useUiStore.getState().openSettings("memory")}
					onOpenModelRoles={() => useUiStore.getState().openModelRoles()}
					onOpenTarget={openCapabilityTarget}
					onOpenTools={() => useUiStore.getState().openSettings("tools")}
					ready={sidecarReady && settings !== null}
					ttsrEnabled={settings?.values?.["ttsr.enabled"] === true}
				/>
			</div>
		</Modal>
	);
}
