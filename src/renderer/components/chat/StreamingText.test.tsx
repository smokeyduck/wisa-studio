import { parseHTML } from "linkedom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { useMessagesStore } from "../../stores/messages";
import { useToolsStore } from "../../stores/tools";
import { useUiStore } from "../../stores/ui";
import { StreamingRows } from "./ChatStream";
import { StreamingText } from "./StreamingText";

const { document, window, Event, HTMLElement, Element, Node } = parseHTML("<html><body></body></html>");
const globals = globalThis as Record<string, unknown>;
Object.assign(globals, { document, window, Event, HTMLElement, Element, Node, IS_REACT_ACT_ENVIRONMENT: true });

interface TestElement {
	textContent: string | null;
	remove: () => void;
	getAttribute: (name: string) => string | null;
	setAttribute: (name: string, value: string) => void;
	dispatchEvent: (event: Event) => boolean;
	querySelector: (selector: string) => TestElement | null;
	querySelectorAll: (selector: string) => TestElement[];
}

let frameId = 0;
let frameTime = 0;
const frameCallbacks = new Map<number, FrameRequestCallback>();
const testWindow = window as unknown as Record<string, unknown>;
testWindow.requestAnimationFrame = (callback: FrameRequestCallback) => {
	const id = ++frameId;
	frameCallbacks.set(id, callback);
	return id;
};
testWindow.cancelAnimationFrame = (id: number) => frameCallbacks.delete(id);

let container: TestElement;
let root: Root;

async function mount(text: string, element: ReactElement = <StreamingText />): Promise<void> {
	useMessagesStore.setState({ streamingText: text });
	container = document.createElement("div") as unknown as TestElement;
	document.body.appendChild(container as never);
	root = createRoot(container as unknown as Element);
	await act(async () => {
		root.render(<I18nProvider>{element}</I18nProvider>);
	});
}

async function flushFrame(elapsed = 50): Promise<void> {
	frameTime += elapsed;
	const callbacks = [...frameCallbacks.values()];
	frameCallbacks.clear();
	await act(async () => {
		for (const callback of callbacks) callback(frameTime);
	});
}

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	useMessagesStore.getState().reset();
	useToolsStore.getState().reset();
	useUiStore.setState({ transcriptDetail: "compact" });
	frameCallbacks.clear();
	frameTime = 0;
});

describe("StreamingText presentation", () => {
	it("keeps the live reply on the same assistant surface as restored output", async () => {
		useMessagesStore.setState({
			streamingMessage: { role: "assistant", content: [], timestamp: "2026-08-22T00:00:00Z" },
		});
		useUiStore.setState({ transcriptDetail: "full" });
		await mount("Live answer", <StreamingRows expanded={false} onExpandedChange={() => {}} />);

		const turn = container.querySelector(".omp-streaming-turn");
		expect(turn?.getAttribute("class")).toContain("omp-assistant-turn");
		expect(turn?.querySelector(".omp-transcript-content")).not.toBeNull();
		expect(turn?.querySelector(".omp-streaming-tail")?.textContent).toContain("Live answer");
	});

	it("keeps an opened reasoning trace current without replacing the live answer", async () => {
		useMessagesStore.setState({
			streamingMessage: { role: "assistant", content: [], timestamp: "2026-08-22T00:00:00Z" },
		});
		useUiStore.setState({ transcriptDetail: "full" });
		await mount("Answer stays selected", <StreamingRows expanded onExpandedChange={() => {}} />);
		const answer = container.querySelector(".omp-streaming-tail");
		expect(container.querySelector(".omp-thinking-header")).toBeNull();

		await act(async () => {
			useMessagesStore.setState({ streamingThinking: "First reasoning" });
		});
		const header = container.querySelector(".omp-thinking-header");
		expect(header).not.toBeNull();
		await act(async () => {
			header?.dispatchEvent(new Event("click", { bubbles: true }) as unknown as globalThis.Event);
		});
		expect(header?.getAttribute("aria-expanded")).toBe("true");

		await act(async () => {
			useMessagesStore.setState({ streamingThinking: "First reasoning\n\nContinued **analysis**" });
		});
		await flushFrame();
		expect(container.querySelector(".omp-thinking-body")?.textContent).toContain("Continued analysis");
		expect(container.querySelector(".omp-thinking-body strong")?.textContent).toBe("analysis");
		expect(container.querySelector(".omp-thinking-header")).toBe(header);
		expect(container.querySelector(".omp-transcript-content > .omp-streaming .omp-streaming-tail")).toBe(answer);
	});

	it("shows one disclosure for earlier work and live thinking, without hiding the answer", async () => {
		useMessagesStore.setState({
			streamingMessage: { role: "assistant", content: [], timestamp: 2 },
			streamingThinking: "Current reasoning",
		});
		await mount(
			"Live answer",
			<StreamingRows
				expanded={false}
				onExpandedChange={() => {}}
				process={{
					kind: "process",
					messages: [{ role: "assistant", content: "Earlier work", timestamp: 1 }],
					stepCount: 3,
					failedEvents: 1,
					backgroundEvents: 2,
					toolCallIds: [],
					toolNames: [],
				}}
			/>,
		);
		const groups = container.querySelectorAll(".omp-execution-group-header");
		expect(groups).toHaveLength(1);
		expect(groups[0]?.textContent).toContain("1 failed - 4 steps");
		expect(groups[0]?.getAttribute("aria-label")).toContain("Background events: 2");
		expect(container.querySelector(".omp-thinking-header")).toBeNull();
		expect(container.querySelector(".omp-streaming-tail")?.textContent).toContain("Live answer");
	});

	it("coalesces multiple incoming prefixes into one visible animation frame", async () => {
		await mount("A");

		await act(async () => {
			useMessagesStore.setState({ streamingText: "AB" });
			useMessagesStore.setState({ streamingText: "ABC" });
		});
		expect(container.querySelector(".omp-streaming-tail")?.textContent).toBe("A");

		await flushFrame();
		expect(container.querySelector(".omp-streaming-tail")?.textContent).toBe("ABC");
	});

	/**
	 * The unfinished block used to render as raw text and reflow into formatting
	 * once its paragraph closed: `**`, backticks and table pipes flashed on screen
	 * and every block jumped. It now renders formatted while it grows.
	 */
	it("renders the unfinished block formatted instead of as raw Markdown", async () => {
		await mount("- **Structure**: a demo with `README.md` and **unfinished `co");

		const tail = container.querySelector(".omp-streaming-tail");
		expect(tail?.querySelector("li")).not.toBeNull();
		expect(tail?.querySelectorAll("strong").map(node => node.textContent)).toEqual(["Structure", "unfinished co"]);
		expect(tail?.querySelectorAll("code").map(node => node.textContent)).toEqual(["README.md", "co"]);
		expect(tail?.textContent).not.toContain("**");
		expect(tail?.textContent).not.toContain("`");
	});

	it("holds a table back until its delimiter row is complete", async () => {
		await mount("| File | Status |\n| --- | --");
		expect(container.querySelector(".omp-streaming-tail")?.textContent).not.toContain("|");

		await act(async () => {
			useMessagesStore.setState({ streamingText: "| File | Status |\n| --- | --- |\n| README.md | modi" });
		});
		await flushFrame();
		const tail = container.querySelector(".omp-streaming-tail");
		expect(tail?.querySelectorAll("th").map(node => node.textContent)).toEqual(["File", "Status"]);
		expect(tail?.querySelectorAll("td").map(node => node.textContent)).toEqual(["README.md", "modi"]);
	});

	it("keeps the caret on the last rendered line", async () => {
		await mount("Intro paragraph.\n\n- first\n- second ite");

		const marked = container.querySelectorAll("[data-omp-caret]");
		expect(marked).toHaveLength(1);
		expect(marked[0]?.textContent).toBe("second ite");
	});

	it("parses a completed paragraph once and keeps the unfinished suffix lightweight", async () => {
		const paragraph = "First **complete** paragraph.";
		await mount(paragraph);

		await act(async () => {
			useMessagesStore.setState({ streamingText: `${paragraph}\n\nTail still growing` });
		});
		await flushFrame();

		expect(container.querySelectorAll(".omp-streaming-block")).toHaveLength(1);
		expect(container.querySelector("strong")?.textContent).toBe("complete");
		expect(container.querySelector(".omp-streaming-tail")?.textContent).toBe("Tail still growing");
	});

	it("grows an unfinished fence inside the final code chrome and highlights it once closed", async () => {
		const unfinished = "```ts\nconst answer = 42;\n";
		const completed = `${unfinished}\`\`\`\n`;
		await mount(unfinished);
		const live = container.querySelector(".omp-streaming-tail code.language-typescript");
		expect(live?.textContent).toContain("const answer = 42;");
		// Tokenizing every frame is what the plain live render avoids.
		expect(live?.querySelector("[class^='hljs-']")).toBeNull();
		expect(container.querySelector(".omp-streaming-tail")?.textContent).not.toContain("```");

		await act(async () => {
			useMessagesStore.setState({ streamingText: completed });
		});
		await flushFrame();

		expect(container.querySelector(".omp-streaming-block code.language-typescript")?.textContent).toContain(
			"const answer = 42;",
		);
		expect(container.querySelector(".omp-streaming-tail")?.textContent).toBe("");
	});

	it("keeps an unfinished bracket equation together and typesets it when it closes", async () => {
		const unfinished = String.raw`\[
TPS_{\text{decode}}

=
\frac{500-1}{12-2}
=
49.9
`;
		await mount(unfinished);
		expect(container.querySelector(".omp-streaming-block")).toBeNull();
		expect(container.querySelector(".omp-streaming-tail")?.textContent).toBe(unfinished);

		await act(async () => {
			useMessagesStore.setState({ streamingText: `${unfinished}\\]\nExplanation` });
		});
		await flushFrame();

		expect(container.querySelectorAll(".katex-display")).toHaveLength(1);
		expect(container.querySelector("h1, h2, .katex-error")).toBeNull();
		expect(container.querySelector(".omp-streaming-tail")?.textContent).toBe("Explanation");
	});
});
