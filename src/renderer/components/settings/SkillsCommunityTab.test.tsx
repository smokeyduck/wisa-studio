/**
 * The Community tab is the one place in the Skills page that installs something
 * off the internet, so its contracts are: it lists the cached catalogue without
 * touching the network itself, it renders the quality signal (rank and install
 * count) and the provenance (`owner/repo`) for every row, filtering is local so
 * typing never costs a request, and a successful install locks the row instead
 * of offering the same install twice.
 */

import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	CommunityBoard,
	CommunityBoardState,
	CommunitySkill,
	IpcSkillsCommunityCatalogResult,
	IpcSkillsCommunityCatalogUpdate,
	IpcSkillsCommunityInstallResult,
	IpcSkillsCommunityPreviewResult,
} from "../../../shared/skills-community";
import { I18nProvider } from "../../lib/i18n";
import { useSessionStore } from "../../stores/session";
import { useTabsStore } from "../../stores/tabs";
import { SkillsCommunityTab } from "./SkillsCommunityTab";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis as Record<string, unknown>, {
	document,
	window,
	Event,
	HTMLElement,
	Element,
	Node,
	IS_REACT_ACT_ENVIRONMENT: true,
});
(globalThis as Record<string, unknown>).requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);

const ROOT = "/home/user/.omp/agent/skills";

const PDF: CommunitySkill = {
	id: "anthropics/skills/pdf",
	skillId: "pdf",
	name: "pdf",
	source: "anthropics/skills",
	installs: 233721,
};
// A different slug: two skills with the same slug would share one folder, so
// the second would honestly read as installed after the first lands.
const PDF_TOOLS: CommunitySkill = {
	id: "openai/skills/pdf-tools",
	skillId: "pdf-tools",
	name: "pdf-tools",
	source: "openai/skills",
	installs: 13937,
};

function catalog(
	overrides: Partial<Record<CommunityBoard, CommunityBoardState>> = {},
): IpcSkillsCommunityCatalogResult {
	const board = (skills: CommunitySkill[], total: number, complete = true): CommunityBoardState => ({
		skills,
		total,
		complete,
	});
	return {
		status: "ok",
		root: ROOT,
		installed: {},
		fetchedAt: "2026-11-21T00:00:00.000Z",
		boards: {
			"all-time": board([PDF, PDF_TOOLS], 9905),
			trending: board([PDF_TOOLS], 9962),
			hot: board([PDF], 7211),
			...overrides,
		},
	};
}

const readCatalog = vi.fn(async (): Promise<IpcSkillsCommunityCatalogResult> => catalog());
const refresh = vi.fn(async (): Promise<IpcSkillsCommunityCatalogResult> => catalog());
const preview = vi.fn(
	async (): Promise<IpcSkillsCommunityPreviewResult> => ({
		status: "ok",
		id: PDF.id,
		files: ["SKILL.md", "FORMS.md"],
		skillMd: "# pdf\n\nFill forms.\n",
	}),
);
const install = vi.fn(
	async (): Promise<IpcSkillsCommunityInstallResult> => ({
		status: "ok",
		id: PDF.id,
		name: "pdf",
		source: "anthropics/skills",
		dir: `${ROOT}/pdf`,
		root: ROOT,
		files: 3,
	}),
);

/** Handlers the component registered through `onCatalogUpdate`, for pushing pages. */
let catalogListeners: Array<(update: IpcSkillsCommunityCatalogUpdate) => void> = [];

Object.assign(window as unknown as Record<string, unknown>, {
	omp: {
		skillsCommunity: {
			catalog: readCatalog,
			refresh,
			preview,
			install,
			onCatalogUpdate: (callback: (update: IpcSkillsCommunityCatalogUpdate) => void) => {
				catalogListeners.push(callback);
				return () => {
					catalogListeners = catalogListeners.filter(listener => listener !== callback);
				};
			},
		},
	},
});

const roots: Root[] = [];

beforeEach(() => {
	useSessionStore.setState({ status: "ready", cwd: "/tmp/workspace" });
	useTabsStore.setState({ activeTabId: "tab-a" });
	catalogListeners = [];
	for (const spy of [readCatalog, refresh, preview, install]) spy.mockClear();
});

afterEach(async () => {
	for (const root of roots.splice(0)) await act(async () => root.unmount());
	document.body.innerHTML = "";
});

async function mount(): Promise<void> {
	const container = document.createElement("div") as unknown as Element;
	document.body.appendChild(container as never);
	const root = createRoot(container);
	await act(async () => {
		root.render(
			<I18nProvider>
				<SkillsCommunityTab />
			</I18nProvider>,
		);
	});
	roots.push(root);
	await act(async () => {
		await Promise.resolve();
	});
}

function buttons(): HTMLButtonElement[] {
	return Array.from(document.body.querySelectorAll("button")) as HTMLButtonElement[];
}

function text(): string {
	return document.body.textContent ?? "";
}

/** Click the button whose trimmed label matches. */
async function click(label: string, index = 0): Promise<void> {
	const matches = buttons().filter(button => (button.textContent ?? "").trim() === label);
	const target = matches[index];
	expect(target, `no button labelled ${label}`).toBeTruthy();
	await act(async () => {
		target.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }) as never);
	});
	await act(async () => {
		await Promise.resolve();
	});
}

/** Drive the controlled filter box, the way a keystroke would. */
async function filter(value: string): Promise<void> {
	const input = document.body.querySelector("input") as unknown as Record<string, unknown> & { value: string };
	input.value = value;
	const propsKey = Object.getOwnPropertyNames(input).find(key => key.startsWith("__reactProps$"));
	const props = propsKey ? (input[propsKey] as { onChange?: (event: object) => void } | undefined) : undefined;
	await act(async () => {
		props?.onChange?.({ target: input, currentTarget: input });
	});
	await act(async () => {
		await Promise.resolve();
	});
}

describe("SkillsCommunityTab", () => {
	it("lists the whole catalogue on open, with provenance, rank, and install counts", async () => {
		await mount();
		expect(readCatalog).toHaveBeenCalledTimes(1);
		const page = text();
		expect(page).toContain("anthropics/skills");
		expect(page).toContain("openai/skills");
		expect(page).toContain("233,721");
		// Rank comes from the board, so the first row is #1.
		expect(page).toContain("#1");
		// How much of the index is loaded, and where installs land.
		expect(page).toContain("2 of 9,905 skills");
		expect(page).toContain("skills");
	});

	it("switches boards without asking main for anything", async () => {
		await mount();
		await click("Trending");
		const page = text();
		expect(page).toContain("1 of 9,962 skills");
		expect(readCatalog).toHaveBeenCalledTimes(1);
	});

	it("filters what is loaded locally instead of searching the network", async () => {
		await mount();
		await filter("pdf-tools");
		const page = text();
		expect(page).toContain("openai/skills");
		expect(page).not.toContain("anthropics/skills/pdf");
		expect(page).toContain("1 of 9,905 loaded skills match");
		expect(readCatalog).toHaveBeenCalledTimes(1);
	});

	it("grows a board in place when the background pager pushes a page", async () => {
		await mount();
		expect(catalogListeners).toHaveLength(1);
		await act(async () => {
			catalogListeners[0]({
				board: "all-time",
				state: {
					skills: [PDF, PDF_TOOLS, { ...PDF, id: "vercel/skills/next", skillId: "next", name: "next" }],
					total: 9905,
					complete: false,
				},
			});
		});
		const page = text();
		expect(page).toContain("#3");
		expect(page).toContain("Loading the rest of the catalogue");
	});

	it("keeps a skill's board rank when the filter narrows the list, and marks only the first ten", async () => {
		// Ranks 2, 11 and 12 all match "skill-1": the badge follows the board, not
		// the filtered order.
		const many = Array.from({ length: 12 }, (_, index) => ({
			...PDF,
			id: `owner/repo/skill-${index}`,
			skillId: `skill-${index}`,
			name: `skill-${index}`,
		}));
		readCatalog.mockResolvedValueOnce(catalog({ "all-time": { skills: many, total: 12, complete: true } }));
		await mount();
		await filter("skill-1");
		const rendered = Array.from(document.body.querySelectorAll("[style*='translateY']")).map(
			node => node.textContent ?? "",
		);
		expect(rendered).toHaveLength(3);
		expect(rendered[0]).toContain("#2");
		expect(rendered[0]).toContain("Top");
		expect(rendered[1]).toContain("#11");
		expect(rendered[1]).not.toContain("Top");
		expect(rendered[2]).toContain("#12");
	});

	it("previews a skill before installing it", async () => {
		await mount();
		await click("Preview");
		expect(preview).toHaveBeenCalledWith({ id: PDF.id });
		const page = text();
		expect(page).toContain("Fill forms");
		expect(page).toContain("2 files");
	});

	it("installs the row that was clicked and locks it as installed", async () => {
		await mount();
		const installButtons = buttons().filter(button => (button.textContent ?? "").trim() === "Install");
		expect(installButtons).toHaveLength(2);
		await click("Install");
		expect(install).toHaveBeenCalledWith({ id: PDF.id });
		const installed = buttons().filter(button => (button.textContent ?? "").trim() === "Installed");
		expect(installed).toHaveLength(1);
		expect(installed[0].hasAttribute("disabled")).toBe(true);
	});

	it("asks main to re-read the index when refreshed", async () => {
		await mount();
		await click("Refresh");
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("says so when this build has no bridge, rather than rendering an empty list", async () => {
		const bridge = (window as unknown as Record<string, unknown>).omp;
		(window as unknown as Record<string, unknown>).omp = undefined;
		try {
			await mount();
			expect(text()).toContain("unavailable");
		} finally {
			(window as unknown as Record<string, unknown>).omp = bridge;
		}
	});
});
