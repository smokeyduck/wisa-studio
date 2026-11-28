import { parseHTML } from "linkedom";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AgentNotchApi, type AgentNotchState, DEFAULT_AGENT_NOTCH_SETTINGS } from "../../../shared/agent-notch";
import { I18nProvider } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settings";
import { AgentNotchSettings } from "./AgentNotchSettings";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, {
	document,
	window,
	Event,
	HTMLElement,
	Element,
	Node,
	IS_REACT_ACT_ENVIRONMENT: true,
	requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
});

let root: Root | undefined;
let container: globalThis.HTMLElement;
const initial: AgentNotchState = {
	settings: { ...DEFAULT_AGENT_NOTCH_SETTINGS },
	available: true,
	error: null,
};

const extraApi = {
	exportSetup: async () => true,
	importSetup: async () => null,
	integrations: async () => [],
	connectAgent: async () => [],
};
function button(text: string): globalThis.HTMLButtonElement {
	const found = Array.from(container.querySelectorAll<globalThis.HTMLButtonElement>("button")).find(
		item => (item.getAttribute("aria-label") ?? item.textContent) === text,
	);
	if (!found) throw new Error(`Missing button: ${text}`);
	return found;
}

async function mount(api: AgentNotchApi | undefined): Promise<void> {
	Object.assign(window, { omp: { notch: api, initialLanguage: "en" } });
	container = document.createElement("div") as unknown as globalThis.HTMLElement;
	document.body.appendChild(container as never);
	root = createRoot(container);
	await act(async () => {
		root?.render(
			<I18nProvider>
				<AgentNotchSettings />
			</I18nProvider>,
		);
	});
}

afterEach(async () => {
	await act(async () => root?.unmount());
	root = undefined;
	container?.remove();
	useSettingsStore.getState().reset();
});

describe("AgentNotchSettings", () => {
	it("explains that a stale preload requires an application restart", async () => {
		await mount(undefined);
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Restart Wisa");
		expect(container.querySelector('button[role="switch"]')?.hasAttribute("disabled")).toBe(true);
	});

	it("explains a missing main-process handler without hiding native helper failures", async () => {
		await mount({
			...extraApi,
			getState: async () => {
				throw new Error(
					"Error invoking remote method 'agent-notch:get': Error: No handler registered for 'agent-notch:get'",
				);
			},
			configure: async settings => ({ ...initial, settings }),
			onChanged: () => () => {},
		});
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Restart Wisa");
	});

	it("preserves the native helper failure in settings", async () => {
		await mount({
			...extraApi,
			getState: async () => ({ ...initial, available: false, error: "Notch Island launch failed: EACCES" }),
			configure: async settings => ({ ...initial, settings }),
			onChanged: () => () => {},
		});
		expect(container.querySelector('.notch-settings > [role="alert"]')?.textContent).toContain(
			"Notch Island launch failed: EACCES",
		);
	});

	it("keeps a newer disabled state when an older startup read finishes later", async () => {
		let resolveInitial!: (state: AgentNotchState) => void;
		let publish!: (state: AgentNotchState) => void;
		const startup = new Promise<AgentNotchState>(resolve => {
			resolveInitial = resolve;
		});
		await mount({
			...extraApi,
			getState: () => startup,
			configure: async settings => ({ ...initial, settings }),
			onChanged: callback => {
				publish = callback;
				return () => {};
			},
		});
		await act(async () => publish({ ...initial, settings: { ...initial.settings, enabled: false } }));
		await act(async () => resolveInitial(initial));
		const toggle = container.querySelector('button[role="switch"]');
		expect(toggle?.getAttribute("aria-checked")).toBe("false");
		expect(container.querySelector("fieldset")?.hasAttribute("disabled")).toBe(false);
	});

	it("retains the draft and does not claim a failed explicit save succeeded", async () => {
		const configure = vi.fn(async () => {
			throw new Error("disk full");
		});
		await mount({ ...extraApi, getState: async () => initial, configure, onChanged: () => () => {} });
		const toggle = container.querySelector<globalThis.HTMLButtonElement>('button[role="switch"]');
		await act(async () => toggle?.click());
		expect(configure).not.toHaveBeenCalled();
		await act(async () => button("Save").click());
		expect(configure).toHaveBeenCalledWith({ ...initial.settings, enabled: false });
		expect(toggle?.getAttribute("aria-checked")).toBe("false");
		expect(container.querySelector('.notch-settings > [role="alert"]')?.textContent).toContain("disk full");
		expect(container.querySelector('[role="status"]')).toBeNull();
	});

	it("builds and reorders widgets without applying each edit", async () => {
		const configure = vi.fn(async (settings: AgentNotchState["settings"]) => ({ ...initial, settings }));
		await mount({ ...extraApi, getState: async () => initial, configure, onChanged: () => () => {} });
		await act(async () => button("Add Note").click());
		expect(configure).not.toHaveBeenCalled();
		expect(container.querySelectorAll("ol > li")).toHaveLength(2);
		const up = container.querySelectorAll("ol > li")[1]?.querySelector<globalThis.HTMLButtonElement>("button");
		await act(async () => up?.click());
		await act(async () => button("Save").click());
		expect(configure.mock.calls[0]?.[0].widgets.map(widget => widget.kind)).toEqual(["note", "sessions"]);
		expect(container.querySelector('[role="status"]')?.textContent).toBe("Configuration saved");
	});
	it("requires confirmation before replacing a preset and tolerates cancellation", async () => {
		const importSetup = vi.fn(async () => null);
		await mount({
			...extraApi,
			importSetup,
			getState: async () => initial,
			configure: async settings => ({ ...initial, settings }),
			onChanged: () => () => {},
		});
		await act(async () => button("Import").click());
		expect(importSetup).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain("all unsaved edits");
		await act(async () => button("Cancel").click());
		expect(importSetup).not.toHaveBeenCalled();
		await act(async () => button("Import").click());
		await act(async () => button("Continue").click());
		expect(importSetup).toHaveBeenCalledOnce();
		expect(container.querySelector('[role="status"]')).toBeNull();
	});
	it("confirms the exact agent config before connecting", async () => {
		const info = {
			agent: "claude" as const,
			connected: false,
			configPath: "/home/test/.claude/settings.json",
			command: "wisa-hook",
		};
		const connectAgent = vi.fn(async () => [{ ...info, connected: true }]);
		await mount({
			...extraApi,
			integrations: async () => [info],
			connectAgent,
			getState: async () => initial,
			configure: async settings => ({ ...initial, settings }),
			onChanged: () => () => {},
		});
		await act(async () => button("Connect").click());
		expect(connectAgent).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain(info.configPath);
		await act(async () => button("Continue").click());
		expect(connectAgent).toHaveBeenCalledWith("claude", true);
		expect(button("Disconnect")).toBeDefined();
	});

	it("keeps agent visibility separate from connection permissions", async () => {
		const connectAgent = vi.fn(async () => []);
		const configure = vi.fn(async (settings: AgentNotchState["settings"]) => ({ ...initial, settings }));
		await mount({ ...extraApi, connectAgent, getState: async () => initial, configure, onChanged: () => () => {} });
		const toggle = container.querySelector<globalThis.HTMLButtonElement>(
			'button[role="switch"][aria-label="Claude Code"]',
		);
		expect(toggle).not.toBeNull();
		await act(async () => toggle?.click());
		expect(connectAgent).not.toHaveBeenCalled();
		expect(configure).not.toHaveBeenCalled();
		expect(button("Export").disabled).toBe(true);
	});

	it("does not mark a returned helper error as a successful save", async () => {
		await mount({
			...extraApi,
			getState: async () => initial,
			configure: async settings => ({ ...initial, settings, error: "helper unavailable" }),
			onChanged: () => () => {},
		});
		await act(async () => container.querySelector<globalThis.HTMLButtonElement>('button[role="switch"]')?.click());
		await act(async () => button("Save").click());
		expect(container.querySelector('.notch-settings > [role="alert"]')?.textContent).toContain("helper unavailable");
		expect(container.querySelector('[role="status"]')).toBeNull();
		expect(button("Save").disabled).toBe(false);
	});

	it("allows an empty layout without inventing live sessions", async () => {
		const configure = vi.fn(async (settings: AgentNotchState["settings"]) => ({ ...initial, settings }));
		await mount({ ...extraApi, getState: async () => initial, configure, onChanged: () => () => {} });
		await act(async () => button("Remove").click());
		expect(container.querySelectorAll("ol > li")).toHaveLength(0);
		expect(container.textContent).toContain("Empty layout");
		await act(async () => button("Save").click());
		expect(configure.mock.calls[0]?.[0].widgets).toEqual([]);
	});

	it("retains a parent-owned draft across mount-on-demand navigation", async () => {
		const configure = vi.fn(async (settings: AgentNotchState["settings"]) => ({ ...initial, settings }));
		await mount({ ...extraApi, getState: async () => initial, configure, onChanged: () => () => {} });
		function Host() {
			const [draft, setDraft] = useState<AgentNotchState["settings"] | null>(null);
			const [visible, setVisible] = useState(true);
			return (
				<I18nProvider>
					<button type="button" onClick={() => setVisible(value => !value)}>
						Navigate
					</button>
					{visible && <AgentNotchSettings draft={draft} onDraftChange={setDraft} />}
				</I18nProvider>
			);
		}
		await act(async () => root?.render(<Host />));
		await act(async () => container.querySelector<globalThis.HTMLButtonElement>('button[role="switch"]')?.click());
		await act(async () => button("Navigate").click());
		await act(async () => button("Navigate").click());
		expect(container.querySelector('button[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
		await act(async () => button("Save").click());
		expect(configure).toHaveBeenCalledWith({ ...initial.settings, enabled: false });
	});
});
