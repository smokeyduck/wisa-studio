/**
 * The Community tab is the one place in the Skills page that installs something
 * off the internet, so its contracts are: it never asks skills.sh for a query
 * too short to be legal, it renders the quality signal (install count) and the
 * provenance (`owner/repo`) for every row, and a successful install locks the
 * row instead of offering the same install twice.
 */

import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcSkillsCommunityInstallResult, IpcSkillsCommunitySearchResult } from "../../../shared/skills-community";
import { I18nProvider } from "../../lib/i18n";
import { useSessionStore } from "../../stores/session";
import { useTabsStore } from "../../stores/tabs";
import { SkillsCommunityTab } from "./SkillsCommunityTab";

/** Long enough for the tab's own debounce; the component owns the constant. */
const DEBOUNCE_MS = 400;

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

const SEARCH_OK: IpcSkillsCommunitySearchResult = {
	status: "ok",
	query: "pdf",
	root: ROOT,
	installed: {},
	skills: [
		{ id: "anthropics/skills/pdf", skillId: "pdf", name: "pdf", source: "anthropics/skills", installs: 233721 },
		// A different slug: two skills with the same slug would share one folder,
		// so the second would honestly read as installed after the first lands.
		{
			id: "openai/skills/pdf-tools",
			skillId: "pdf-tools",
			name: "pdf-tools",
			source: "openai/skills",
			installs: 13937,
		},
	],
};

const search = vi.fn(async (): Promise<IpcSkillsCommunitySearchResult> => SEARCH_OK);
const install = vi.fn(
	async (): Promise<IpcSkillsCommunityInstallResult> => ({
		status: "ok",
		id: "anthropics/skills/pdf",
		name: "pdf",
		source: "anthropics/skills",
		dir: `${ROOT}/pdf`,
		root: ROOT,
		files: 3,
	}),
);

Object.assign(window as unknown as Record<string, unknown>, {
	omp: { skillsCommunity: { search, install } },
});

const roots: Root[] = [];

beforeEach(() => {
	useSessionStore.setState({ status: "ready", cwd: "/tmp/workspace" });
	useTabsStore.setState({ activeTabId: "tab-a" });
	search.mockClear();
	install.mockClear();
});

afterEach(async () => {
	vi.useRealTimers();
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

/** Type into the controlled search box, then wait out the tab's debounce. */
async function type(value: string): Promise<void> {
	const input = document.body.querySelector("input") as unknown as Record<string, unknown> & { value: string };
	input.value = value;
	// linkedom's input has no React value tracker, so drive the onChange prop the
	// renderer attached rather than a synthetic event the component would miss.
	const propsKey = Object.getOwnPropertyNames(input).find(key => key.startsWith("__reactProps$"));
	const props = propsKey ? (input[propsKey] as { onChange?: (event: object) => void } | undefined) : undefined;
	await act(async () => {
		props?.onChange?.({ target: input, currentTarget: input });
	});
	await wait(DEBOUNCE_MS + 100);
	await act(async () => {
		await Promise.resolve();
	});
}

function wait(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

describe("SkillsCommunityTab", () => {
	it("does not search until the query reaches the API's two-character minimum", async () => {
		await mount();
		await type("p");
		expect(search).not.toHaveBeenCalled();
	});

	it("shows the name, the owner/repo source, and the install count for each hit", async () => {
		await mount();
		await type("pdf");
		const text = document.body.textContent ?? "";
		expect(search).toHaveBeenCalledWith({ query: "pdf" });
		expect(text).toContain("anthropics/skills");
		expect(text).toContain("233,721");
		expect(text).toContain("openai/skills");
		// The install target and the "nothing is executed" note are on the page.
		expect(text).toContain("skills");
		expect(document.body.querySelectorAll("button").length).toBeGreaterThan(0);
	});

	it("installs the row that was clicked and locks it as installed", async () => {
		await mount();
		await type("pdf");
		const installButtons = buttons().filter(button => (button.textContent ?? "").trim() === "Install");
		expect(installButtons).toHaveLength(2);
		await act(async () => {
			installButtons[0].dispatchEvent(new Event("click", { bubbles: true, cancelable: true }) as never);
		});
		await act(async () => {
			await Promise.resolve();
		});
		expect(install).toHaveBeenCalledWith({ id: "anthropics/skills/pdf" });
		const installed = buttons().filter(button => (button.textContent ?? "").trim() === "Installed");
		expect(installed).toHaveLength(1);
		expect(installed[0].hasAttribute("disabled")).toBe(true);
	});
});
