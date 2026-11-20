import { parseHTML } from "linkedom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PanelErrorBoundary } from "./PanelErrorBoundary";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
const globals = globalThis as Record<string, unknown>;
Object.assign(globals, { document, window, Event, HTMLElement, Element, Node, IS_REACT_ACT_ENVIRONMENT: true });

interface TestElement {
	remove(): void;
	textContent: string | null;
}

let container: TestElement;
let root: Root;

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
});

function Broken(): ReactNode {
	throw new Error("panel blew up");
}

describe("PanelErrorBoundary", () => {
	// The boundary is what catches a panel whose own `useT` found no provider, so
	// its fallback cannot depend on that provider being reachable. Rendering
	// outside `I18nProvider` is exactly the failure it exists to survive.
	it("reports a crash with the fallback even when no i18n provider is mounted", async () => {
		container = document.createElement("div") as unknown as TestElement;
		document.body.appendChild(container as never);
		root = createRoot(container as unknown as Element, { onCaughtError: () => {} });

		await act(async () => {
			root.render(
				<PanelErrorBoundary>
					<Broken />
				</PanelErrorBoundary>,
			);
		});

		expect(container.textContent).toContain("panel blew up");
		expect(container.textContent).not.toContain("useT must be used within I18nProvider");
		expect(container.textContent).toContain("Retry");
	});
});
