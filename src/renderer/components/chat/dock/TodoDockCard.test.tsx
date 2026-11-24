import { parseHTML } from "linkedom";
import { act, type ReactElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type { RpcCommand, RpcResponse } from "../../../../shared/rpc-types";
import { I18nProvider, translate } from "../../../lib/i18n";
import {
	deleteSessionRuntime,
	SessionRuntimeProvider,
	sessionRuntimeStore,
	setFocusedSessionRuntime,
} from "../../../stores/session-runtime-context";
import { createTabRuntime } from "../../../stores/tab-runtime";
import { useToastStore } from "../../../stores/toast";
import { type TodoStore, useTodoStore } from "../../../stores/todo";
import { useUiStore } from "../../../stores/ui";

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
// The status menu clamps itself to the viewport, which linkedom does not model.
Object.assign(window as unknown as Record<string, unknown>, { innerWidth: 1280, innerHeight: 900 });

const setTodos: Mock<() => Promise<RpcResponse>> = vi.fn(async () => ({
	type: "response",
	command: "set_todos",
	success: true,
	data: {},
}));
type RoutedCommand = (tabId: string, command: RpcCommand, timeoutMs?: number) => Promise<RpcResponse>;
const bridge: { setTodos: typeof setTodos; commandForTab?: RoutedCommand } = { setTodos };
const ompWindow = window as unknown as { omp: { rpc: typeof bridge } };
ompWindow.omp = { rpc: bridge };

const { createRoot } = await import("react-dom/client");
const { TodoRibbon } = await import("./TodoDockCard");

let container: HTMLElement;
let root: Root;

async function mount(element: ReactElement = <TodoRibbon />): Promise<void> {
	container = document.createElement("div") as unknown as HTMLElement;
	document.body.appendChild(container as never);
	root = createRoot(container as unknown as Element);
	await act(async () => {
		root.render(<I18nProvider>{element}</I18nProvider>);
	});
}

function ribbonTrigger(): HTMLButtonElement {
	const trigger = container.querySelector<HTMLButtonElement>("[data-todo-ribbon] > button");
	if (!trigger) throw new Error("missing todo ribbon trigger");
	return trigger;
}

async function openRibbon(): Promise<void> {
	await act(async () => ribbonTrigger().click());
}

function statusCycleButton(): { click(): void; dispatchEvent(event: Event): void } {
	const cycle = [...container.querySelectorAll("button")].find(button =>
		button.getAttribute("aria-label")?.startsWith("Status:"),
	) as unknown as { click(): void; dispatchEvent(event: Event): void } | undefined;
	if (!cycle) throw new Error("status cycle control missing");
	return cycle;
}

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	deleteSessionRuntime("other-tab");
	deleteSessionRuntime("ribbon-tab");
	setFocusedSessionRuntime(null);
	delete bridge.commandForTab;
	setTodos.mockClear();
	useToastStore.setState({ toasts: [] });
	useTodoStore.getState().reset();
	useUiStore.setState({ todoRibbonRequest: 0 });
});

describe("TodoRibbon", () => {
	it("shows the current task on the closed ribbon and the remaining tasks on hover", async () => {
		useTodoStore.getState().setPhases([
			{
				name: "Implementation",
				tasks: [
					{ content: "Refine compact renderer", status: "in_progress" },
					{ content: "Run visual QA", status: "pending" },
				],
			},
		]);
		await mount();

		expect(ribbonTrigger().textContent).toContain("Refine compact renderer");
		expect(ribbonTrigger().parentElement?.dataset.state).toBe("running");
		expect(ribbonTrigger().textContent).toContain("1 running - 1 pending");
		expect(container.textContent).not.toContain("Run visual QA");
		expect(ribbonTrigger().getAttribute("aria-expanded")).toBe("false");
		await act(async () => ribbonTrigger().dispatchEvent(new Event("mouseover", { bubbles: true })));
		expect(ribbonTrigger().getAttribute("aria-expanded")).toBe("true");
		expect(container.textContent).toContain("Refine compact renderer");
		expect(container.textContent).toContain("Run visual QA");
		expect(container.textContent).not.toContain("Implementation");
	});

	it("shows abandoned work as failed even if some tasks are complete", async () => {
		useTodoStore.getState().setPhases([
			{
				name: "Release",
				tasks: [{ content: "Verify", status: "completed" }, { content: "Ship", status: "abandoned" }],
			},
		]);
		await mount();
		expect(ribbonTrigger().parentElement?.dataset.state).toBe("failed");
		expect(ribbonTrigger().textContent).toContain("1 abandoned");
	});

	it("shows a success state only when all tasks are complete", async () => {
		useTodoStore.getState().setPhases([
			{ name: "Release", tasks: [{ content: "Verify", status: "completed" }] },
		]);
		await mount();
		expect(ribbonTrigger().parentElement?.dataset.state).toBe("complete");
		expect(ribbonTrigger().textContent).toContain("1 complete");
	});

	it("opens from keyboard focus and closes when focus leaves", async () => {
		useTodoStore.getState().setPhases([
			{ name: "Compatibility", tasks: [{ content: "Update model compatibility", status: "completed" }] },
		]);
		await mount();
		await act(async () => ribbonTrigger().dispatchEvent(new Event("focusin", { bubbles: true })));
		expect(container.textContent).toContain("Update model compatibility");
		await act(async () => ribbonTrigger().dispatchEvent(new Event("focusout", { bubbles: true })));
		expect(container.textContent).not.toContain("Update model compatibility");
	});

	it("reveals every restored task when opened from the todo edit command", async () => {
		useTodoStore.getState().setPhases([
			{
				name: "Restored",
				tasks: Array.from({ length: 12 }, (_, index) => ({
					content: `Restored task ${index + 1}`,
					status: "completed" as const,
				})),
			},
		]);
		await mount();
		expect(container.querySelector('[title="Restored task 1"]')).toBeNull();
		await act(async () => useUiStore.getState().focusTodoRibbon());

		expect(container.querySelector('[title="Restored task 1"]')).not.toBeNull();
		expect(container.querySelector('[title="Restored task 12"]')).not.toBeNull();
	});

	it("removes a deleted task from the list and persists the remaining phases", async () => {
		useTodoStore.getState().setPhases([
			{ name: "Live", tasks: [{ content: "Delete me", status: "pending" }, { content: "Keep me", status: "pending" }] },
		]);
		await mount();
		await openRibbon();
		const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Delete"]');
		if (!remove) throw new Error("missing task delete control");
		await act(async () => remove.click());
		expect(container.textContent).not.toContain("Delete me");
		expect(container.textContent).toContain("Keep me");
		expect(setTodos).toHaveBeenCalledWith([{ name: "Live", tasks: [{ content: "Keep me", status: "pending" }] }]);
	});

	it("reads and updates only the ribbon's owning session", async () => {
		const other = createTabRuntime("other-tab");
		const owner = createTabRuntime("ribbon-tab");
		setFocusedSessionRuntime(other.tabId);
		const otherStore = sessionRuntimeStore<TodoStore>(other.tabId, "todo");
		const ownerStore = sessionRuntimeStore<TodoStore>(owner.tabId, "todo");
		if (!otherStore || !ownerStore) throw new Error("missing test runtime stores");
		otherStore.getState().setPhases([{ name: "Other", tasks: [{ content: "Other session task", status: "pending" }] }]);
		ownerStore.getState().setPhases([{ name: "Owner", tasks: [{ content: "Owning session task", status: "pending" }] }]);
		const commandForTab = vi.fn(async (_tabId: string, command: RpcCommand): Promise<RpcResponse> => ({
			type: "response",
			command: command.type,
			success: true,
			data: {},
		}));
		bridge.commandForTab = commandForTab;
		await mount(<SessionRuntimeProvider runtime={owner}><TodoRibbon /></SessionRuntimeProvider>);
		await openRibbon();
		expect(container.textContent).toContain("Owning session task");
		expect(container.textContent).not.toContain("Other session task");
		await act(async () => statusCycleButton().click());
		expect(commandForTab).toHaveBeenCalledWith(
			owner.tabId,
			{ type: "set_todos", phases: [{ name: "Owner", tasks: [{ content: "Owning session task", status: "in_progress" }] }] },
			undefined,
		);
		expect(otherStore.getState().phases[0]?.tasks[0]?.status).toBe("pending");
	});

	it("unwinds a status cycle the sidecar refused, even though the store re-normalised it", async () => {
		// The dock writes through setPhases, which clones and re-ids every phase,
		// so the object the optimistic guard must recognise is what landed in the
		// store — not the one the click built. Comparing the wrong identity left
		// a checked-off task looking done while Core never stored it.
		useTodoStore.getState().setPhases([
			{
				name: "Live",
				tasks: [{ content: "Survive a refused write", status: "pending" }],
			},
		]);
		await mount();
		await openRibbon();

		const cycle = [...container.querySelectorAll("button")].find(button =>
			button.getAttribute("aria-label")?.startsWith("Status:"),
		) as unknown as { click: () => void } | undefined;
		if (!cycle) throw new Error("status cycle control missing");
		setTodos.mockResolvedValueOnce({
			type: "response",
			command: "set_todos",
			success: false,
			error: "session is read-only",
		} satisfies RpcResponse);

		await act(async () => cycle.click());
		await act(async () => {
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 0);
			await promise;
		});

		expect(setTodos).toHaveBeenCalledWith([
			{ name: "Live", tasks: [{ content: "Survive a refused write", status: "in_progress" }] },
		]);
		expect(useTodoStore.getState().phases[0]?.tasks[0]?.status).toBe("pending");
		expect(container.textContent).toContain("Survive a refused write");
		expect(useToastStore.getState().toasts).toContainEqual(
			expect.objectContaining({
				variant: "error",
				title: translate("todoPanel.updateFailed"),
				message: "session is read-only",
			}),
		);
	});

	it("keeps an accepted status cycle", async () => {
		useTodoStore.getState().setPhases([
			{
				name: "Live",
				tasks: [{ content: "Confirm a stored write", status: "pending" }],
			},
		]);
		await mount();
		await openRibbon();

		const cycle = [...container.querySelectorAll("button")].find(button =>
			button.getAttribute("aria-label")?.startsWith("Status:"),
		) as unknown as { click: () => void } | undefined;
		if (!cycle) throw new Error("status cycle control missing");

		await act(async () => cycle.click());
		await act(async () => {
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 0);
			await promise;
		});

		expect(useTodoStore.getState().phases[0]?.tasks[0]?.status).toBe("in_progress");
		expect(useToastStore.getState().toasts).toEqual([]);
	});

	it("cycles a finished task back to pending, not on to a verdict", async () => {
		// Abandoned is a verdict set from the row menu; one click on a finished
		// task must not reach it.
		useTodoStore.getState().setPhases([
			{
				name: "Live",
				tasks: [{ content: "Shipped work", status: "completed" }],
			},
		]);
		await mount();
		await openRibbon();

		await act(async () => statusCycleButton().click());

		expect(setTodos).toHaveBeenCalledWith([
			{ name: "Live", tasks: [{ content: "Shipped work", status: "pending" }] },
		]);
		expect(useTodoStore.getState().phases[0]?.tasks[0]?.status).toBe("pending");
	});

	it("marks a task abandoned from the row menu", async () => {
		useTodoStore.getState().setPhases([
			{
				name: "Live",
				tasks: [{ content: "Dropped work", status: "pending" }],
			},
		]);
		await mount();
		await openRibbon();

		const event = Object.assign(new Event("contextmenu", { bubbles: true, cancelable: true }), {
			clientX: 24,
			clientY: 32,
		});
		await act(async () => statusCycleButton().dispatchEvent(event));

		const abandon = [...document.querySelectorAll("button")].find(
			button => button.textContent?.trim() === translate("todoPanel.markAbandoned"),
		) as unknown as { click: () => void } | undefined;
		expect(abandon).toBeDefined();
		await act(async () => abandon?.click());

		expect(setTodos).toHaveBeenCalledWith([
			{ name: "Live", tasks: [{ content: "Dropped work", status: "abandoned" }] },
		]);
	});
});
