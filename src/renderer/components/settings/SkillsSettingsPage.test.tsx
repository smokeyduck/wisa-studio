/**
 * Tests for the Skills page bulk switch: one global `disabledExtensions` list
 * backs every skill, so "Enable all" must send one toggle per skill that is
 * actually off — and none for the ones already on.
 */

import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RpcResponse, RpcSkillInfo } from "../../../shared/rpc-types";
import { I18nProvider, translate } from "../../lib/i18n";
import { useSessionStore } from "../../stores/session";
import { useTabsStore } from "../../stores/tabs";
import { SkillsSettingsPage } from "./SkillsSettingsPage";

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

function ok(command: string, data?: unknown): RpcResponse {
	return { type: "response", command, success: true, data };
}

function skill(name: string, enabled: boolean): RpcSkillInfo {
	return {
		name,
		description: `${name} description`,
		source: "custom:user",
		enabled,
		location: `/tmp/skills/${name}/SKILL.md`,
		provider: "custom",
		providerName: "Custom",
		level: "user",
		managed: false,
		hidden: false,
	};
}

const list = [skill("alpha", false), skill("beta", true), skill("gamma", false)];

const getSkills = vi.fn(async (): Promise<RpcResponse> => ok("get_skills", { skills: list }));
const setSkillEnabled = vi.fn(async (): Promise<RpcResponse> => ok("set_skill_enabled", {}));

Object.assign(window as unknown as Record<string, unknown>, {
	omp: {
		rpc: {
			getSkills,
			setSkillEnabled,
			getSkillDetail: vi.fn(async (): Promise<RpcResponse> => ok("get_skill_detail", undefined)),
			manageSkill: vi.fn(async (): Promise<RpcResponse> => ok("manage_skill", {})),
			getSettings: vi.fn(async (): Promise<RpcResponse> => ok("get_settings", { values: {} })),
		},
	},
});

const roots: Root[] = [];

beforeEach(() => {
	useSessionStore.setState({ status: "ready", cwd: "/tmp/workspace" });
	useTabsStore.setState({ activeTabId: "tab-a" });
});

async function mount(): Promise<void> {
	const root = createRoot(document.body as unknown as Element);
	await act(async () => {
		root.render(
			<I18nProvider>
				<SkillsSettingsPage query="" />
			</I18nProvider>,
		);
	});
	await act(async () => {
		await Promise.resolve();
	});
	roots.push(root);
}

function buttonWithLabel(label: string): HTMLButtonElement | undefined {
	return (Array.from(document.body.querySelectorAll("button")) as HTMLButtonElement[]).find(
		button => (button.textContent ?? "").trim() === label,
	);
}

async function openInstalled(): Promise<void> {
	const tab = buttonWithLabel(translate("skills.tab.installed"));
	expect(tab).toBeDefined();
	await act(async () => tab?.click());
}

afterEach(async () => {
	for (const root of roots) {
		await act(async () => {
			root.unmount();
		});
	}
	roots.length = 0;
	while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
	getSkills.mockClear();
	setSkillEnabled.mockClear();
	useSessionStore.getState().reset();
	useTabsStore.getState().reset();
});

it("opens Skills on Community by default", async () => {
	await mount();
	expect(document.querySelector('[data-tab-id="community"]')?.getAttribute("aria-selected")).toBe("true");
	expect(document.querySelector('[data-tab-id="all-time"]')?.getAttribute("aria-selected")).toBe("true");
	expect(buttonWithLabel(translate("settings.skills.enableAll"))).toBeUndefined();
});

describe("SkillsSettingsPage bulk switch", () => {
	it("enables only the skills that are off", async () => {
		await mount();
		await openInstalled();

		await act(async () => {
			buttonWithLabel(translate("settings.skills.enableAll"))?.click();
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(setSkillEnabled.mock.calls.map(call => call.slice(0, 2))).toEqual([
			["alpha", true],
			["gamma", true],
		]);
	});

	it("disables only the skills that are on", async () => {
		await mount();
		await openInstalled();

		await act(async () => {
			buttonWithLabel(translate("settings.skills.disableAll"))?.click();
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(setSkillEnabled.mock.calls.map(call => call.slice(0, 2))).toEqual([["beta", false]]);
	});
});
