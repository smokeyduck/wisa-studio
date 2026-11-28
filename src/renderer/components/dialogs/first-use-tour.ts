import { type UiStore, useUiStore } from "../../stores/ui";

export type FirstUseTourId =
	| "sidebar"
	| "workspace"
	| "tabs"
	| "model"
	| "providers"
	| "thinking"
	| "compose"
	| "commands"
	| "attachments"
	| "approvals"
	| "context"
	| "compact"
	| "skills"
	| "memory"
	| "modes"
	| "goal"
	| "loop"
	| "roles"
	| "typesafe"
	| "tools"
	| "inspector"
	| "settings"
	| "wallpaper"
	| "help";

export type FirstUseTourChapter = "workspace" | "chat" | "knowledge" | "automation" | "preferences";

interface FirstUseTourStep {
	readonly id: FirstUseTourId;
	readonly chapter: FirstUseTourChapter;
	readonly target: string;
	readonly reveal: () => void;
}

// Only navigation state touched by the tour. Never snapshot a draft, session,
// model, preference, credentials, or the store's actions.
const TOUR_UI_KEYS = [
	"sidebarVisible",
	"panelVisible",
	"panelOwnerTabId",
	"panelTab",
	"workspacePage",
	"activeToolsOpen",
	"agentHubOpen",
	"changelogOpen",
	"contextReportOpen",
	"debugOpen",
	"extensionsOpen",
	"hotkeysOpen",
	"inventoryOpen",
	"jobsOpen",
	"logsOpen",
	"memoryOpen",
	"modelCompareOpen",
	"modelRolesOpen",
	"pluginsOpen",
	"prCenterOpen",
	"providersOpen",
	"sessionInfoOpen",
	"sessionTreeOpen",
	"skillsOpen",
	"statsDashboardOpen",
	"templatesOpen",
	"usageOpen",
	"workspaceDirsOpen",
	"modelPickerOpen",
	"settingsOpen",
	"settingsTab",
	"settingsQuery",
	"modesOpen",
	"modesTab",
	"memoryTab",
] as const satisfies readonly (keyof UiStore)[];
export type TourUiSnapshot = Pick<UiStore, (typeof TOUR_UI_KEYS)[number]>;
export function captureTourUi(): TourUiSnapshot {
	const state = useUiStore.getState();
	return Object.fromEntries(TOUR_UI_KEYS.map(key => [key, state[key]])) as TourUiSnapshot;
}

export function restoreTourUi(snapshot: TourUiSnapshot): void {
	useUiStore.setState(snapshot);
}

function conversation(): void {
	// The shared navigation action also closes every dockable workspace page.
	useUiStore.getState().returnToConversation();
	useUiStore.setState({ modelPickerOpen: false, settingsOpen: false, modesOpen: false, panelVisible: false });
}

function page(open: (ui: UiStore) => void): () => void {
	return () => {
		conversation();
		open(useUiStore.getState());
	};
}

// Targets inside a session are scoped to its active split pane. If a control
// does not exist in Chat, leave it unavailable rather than highlighting an
// unrelated feature or changing the user's tab/session. The overflow button
// is the real responsive parent of Thinking and Approval controls.
const activePane = '[data-active="true"]';
const sessionTarget = (id: string): string => `${activePane} [data-tour="${id}"]`;
const runSettingTarget = (id: string): string =>
	`${sessionTarget(id)}, ${sessionTarget("run-settings")}${id === "approvals" ? "[data-tour-approvals]" : ""}`;

export const FIRST_USE_TOUR = [
	{
		id: "sidebar",
		chapter: "workspace",
		target: '[data-tour="sidebar"]',
		reveal: page(() => useUiStore.setState({ sidebarVisible: true })),
	},
	{
		id: "workspace",
		chapter: "workspace",
		target: '[data-tour="workspace"]',
		reveal: page(ui => ui.openWorkspaceDirs()),
	},
	{ id: "tabs", chapter: "workspace", target: '[data-tour="tabs"]', reveal: conversation },
	{ id: "model", chapter: "chat", target: '[data-tour="model"]', reveal: page(ui => ui.openModelPicker()) },
	{ id: "providers", chapter: "chat", target: '[data-tour="providers"]', reveal: page(ui => ui.openProviders()) },
	{ id: "thinking", chapter: "chat", target: runSettingTarget("thinking"), reveal: conversation },
	{ id: "compose", chapter: "chat", target: sessionTarget("compose"), reveal: conversation },
	// Opening slash completion inserts '/' into the live draft. Show its actual
	// input surface instead; a read-only tour must never manufacture user text.
	{ id: "commands", chapter: "chat", target: sessionTarget("commands"), reveal: conversation },
	{ id: "attachments", chapter: "chat", target: sessionTarget("attachments"), reveal: conversation },
	{ id: "approvals", chapter: "chat", target: runSettingTarget("approvals"), reveal: conversation },
	{ id: "context", chapter: "knowledge", target: sessionTarget("context"), reveal: conversation },
	{ id: "compact", chapter: "knowledge", target: sessionTarget("compact"), reveal: conversation },
	{ id: "skills", chapter: "knowledge", target: '[data-tour="skills"]', reveal: page(ui => ui.openSkills()) },
	{
		id: "memory",
		chapter: "knowledge",
		target: '[data-tour="memory"]',
		reveal: page(ui => ui.openMemory("knowledge")),
	},
	{
		id: "modes",
		chapter: "automation",
		target: '[data-tour="modes"]',
		reveal: page(ui => ui.openModes("vibe")),
	},
	{ id: "goal", chapter: "automation", target: '[data-tour="goal"]', reveal: page(ui => ui.openModes("goal")) },
	{ id: "loop", chapter: "automation", target: '[data-tour="loop"]', reveal: page(ui => ui.openModes("loop")) },
	{
		id: "roles",
		chapter: "automation",
		target: '[data-tour="roles"]',
		reveal: page(ui => ui.openModelRoles()),
	},
	{
		id: "typesafe",
		chapter: "automation",
		target: '[data-tour="typesafe"]',
		reveal: page(ui => ui.openModelRoles()),
	},
	{
		id: "tools",
		chapter: "automation",
		target: '[data-tour="tools"]',
		reveal: page(ui => ui.openActiveTools()),
	},
	{
		id: "inspector",
		chapter: "preferences",
		target: sessionTarget("inspector"),
		reveal: page(ui => ui.setPanelTab("overview")),
	},
	{
		id: "settings",
		chapter: "preferences",
		target: '[data-tour="settings"]',
		reveal: page(ui => ui.openSettings("gui")),
	},
	{ id: "wallpaper", chapter: "preferences", target: sessionTarget("wallpaper"), reveal: conversation },
	{ id: "help", chapter: "preferences", target: '[data-tour="help"]', reveal: page(ui => ui.openHotkeys()) },
] as const satisfies readonly FirstUseTourStep[];
