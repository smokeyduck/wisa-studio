import { parseHTML } from "linkedom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNowTick } from "./now-tick";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { document, window, Event, HTMLElement, Element, Node, IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: globalThis.Element;

function Clock({ active = true }: { active?: boolean }) {
	const now = useNowTick(active);
	return <span>{now}</span>;
}

async function visibility(hidden: boolean): Promise<void> {
	await act(async () => {
		Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
		document.dispatchEvent(new Event("visibilitychange"));
	});
}

async function mount(): Promise<void> {
	container = document.createElement("div") as unknown as globalThis.Element;
	document.body.appendChild(container as never);
	root = createRoot(container);
	await act(async () => {
		root!.render(
			<>
				<Clock />
				<Clock />
			</>,
		);
	});
}

afterEach(async () => {
	await act(async () => root?.unmount());
	root = undefined;
	container?.remove();
	Object.defineProperty(document, "hidden", { configurable: true, value: false });
	vi.restoreAllMocks();
});

describe("shared visible clock", () => {
	it("shares a timer, stops while hidden, catches up immediately, and cleans up", async () => {
		const interval = vi.spyOn(window, "setInterval");
		const clear = vi.spyOn(window, "clearInterval");
		const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
		await mount();
		expect(interval).toHaveBeenCalledTimes(1);
		expect(container.textContent).toBe("10001000");

		await visibility(true);
		expect(clear).toHaveBeenCalledTimes(1);
		now.mockReturnValue(20_000);
		expect(container.textContent).toBe("10001000");
		await visibility(false);
		expect(container.textContent).toBe("2000020000");
		expect(interval).toHaveBeenCalledTimes(2);

		await act(async () => root!.unmount());
		root = undefined;
		expect(clear).toHaveBeenCalledTimes(2);
		await visibility(false);
		expect(interval).toHaveBeenCalledTimes(2);
	});

	it("does not start a timer when mounted hidden", async () => {
		await visibility(true);
		const interval = vi.spyOn(window, "setInterval");
		const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
		await mount();
		expect(interval).not.toHaveBeenCalled();
		now.mockReturnValue(30_000);
		await visibility(false);
		expect(container.textContent).toBe("3000030000");
		expect(interval).toHaveBeenCalledTimes(1);
	});
});
