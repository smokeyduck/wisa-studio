import type { NotchPanelApi, NotchPanelState, PanelAction, PanelRequest } from "../../shared/notch-panel";
import "./style.css";

declare global {
	interface Window {
		notchPanel: NotchPanelApi;
	}
}
const panel = document.getElementById("panel")!;
let state: NotchPanelState | null = null;
const selections = new Map<string, Record<string, string[]>>();
const clocks: HTMLElement[] = [];
function node<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text?: string,
	className?: string,
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	if (text) element.textContent = text;
	if (className) element.className = className;
	return element;
}
function label(key: string): string {
	return state?.labels[key] ?? key;
}
function button(text: string, action: PanelAction, className?: string): HTMLButtonElement {
	const result = node("button", text, className);
	result.type = "button";
	result.addEventListener("click", () => window.notchPanel.action(action));
	return result;
}
function requestCard(request: PanelRequest): HTMLElement {
	const card = node("section", undefined, "request card");
	card.append(node("h3", request.tool || label("waiting")));
	if (request.detail) card.append(node("pre", request.detail));
	const controls = node("div", undefined, "controls");
	const identity = { requestId: request.id, identity: request.identity };
	if (state?.settings.approveInNotch && request.supported) {
		if (request.questions) {
			const answers = selections.get(request.identity) ?? (Object.create(null) as Record<string, string[]>);
			selections.set(request.identity, answers);
			const submit = node("button", label("allow"), "primary");
			submit.type = "button";
			const ready = (): void => {
				submit.disabled = !request.questions!.every(question => answers[question.question]?.length);
			};
			for (const question of request.questions) {
				const group = node("fieldset");
				group.append(node("legend", question.question));
				for (const option of question.options) {
					const wrapper = node("label", undefined, "option");
					const input = node("input");
					input.type = question.multi ? "checkbox" : "radio";
					input.name = `${request.identity}:${question.question}`;
					input.checked = answers[question.question]?.includes(option) ?? false;
					input.addEventListener("change", () => {
						if (question.multi) {
							const selected = new Set(answers[question.question] ?? []);
							if (input.checked) selected.add(option);
							else selected.delete(option);
							answers[question.question] = [...selected];
						} else answers[question.question] = [option];
						ready();
					});
					wrapper.append(input, node("span", option));
					group.append(wrapper);
				}
				card.append(group);
			}
			ready();
			submit.addEventListener("click", () => {
				const values: Record<string, string> = Object.create(null);
				for (const question of request.questions!)
					values[question.question] = (answers[question.question] ?? []).join(", ");
				window.notchPanel.action({ type: "respond", ...identity, behavior: "answer", answers: values });
			});
			controls.append(submit);
		} else {
			controls.append(button(label("allow"), { type: "respond", ...identity, behavior: "allow" }, "primary"));
			if (request.always)
				controls.append(button(label("always"), { type: "respond", ...identity, behavior: "always" }));
			controls.append(button(label("deny"), { type: "respond", ...identity, behavior: "deny" }));
		}
	}
	controls.append(button(label("open"), { type: "open", sessionId: request.sessionId }));
	card.append(controls);
	return card;
}
function render(next: NotchPanelState): void {
	state = next;
	const scroll = panel.querySelector(".content")?.scrollTop ?? 0;
	const active = document.activeElement;
	const focusedOption =
		active instanceof HTMLInputElement
			? { name: active.name, index: [...panel.querySelectorAll("input")].indexOf(active) }
			: null;
	panel.replaceChildren();
	clocks.length = 0;
	panel.className = next.expanded ? "expanded" : "collapsed";
	panel.style.setProperty("--background", next.settings.background);
	panel.style.setProperty("--foreground", next.settings.foreground);
	panel.style.setProperty("--accent", next.settings.accent);
	panel.style.setProperty("--radius", `${next.settings.radius}px`);
	panel.style.setProperty("--opacity", String(next.settings.opacity));
	const header = node("header");
	const count = next.sessions.filter(session => session.waiting).length;
	const running = next.sessions.filter(session => session.running).length;
	const title = button(
		`${label("title")} · ${count ? `${label("waiting")} ${count}` : running ? `${label("working")} ${running}` : label("done")}`,
		{ type: next.expanded ? "collapse" : "expand" },
		"summary",
	);
	header.append(title);
	if (next.expanded) {
		const power = button("⏻", { type: "disable" });
		power.setAttribute("aria-label", label("close"));
		header.append(power, button(label("close"), { type: "collapse" }));
	}
	panel.append(header);
	if (!next.expanded) return;
	const content = node("div", undefined, "content");
	const identities = new Set(next.requests.map(request => request.identity));
	for (const identity of selections.keys()) if (!identities.has(identity)) selections.delete(identity);
	// Requests remain reachable even when the builder intentionally has no widgets.
	const requests = node("div", undefined, "requests");
	requests.style.maxHeight = `${next.settings.maxCards * 180}px`;
	for (const request of next.requests) requests.append(requestCard(request));
	if (next.requests.length) content.append(requests);
	for (const widget of next.settings.widgets) {
		const section = node("section", undefined, "widget");
		if (widget.title) section.append(node("h2", widget.title));
		if (widget.kind === "clock") {
			const clock = node("time", new Date().toLocaleTimeString(), "clock");
			clocks.push(clock);
			section.append(clock);
		} else if (widget.kind === "note") section.append(node("p", widget.text, "note"));
		else if (widget.kind === "activity") {
			if (!widget.title) section.append(node("h2", label("activity")));
			for (const key of ["working", "waiting", "done"] as const) {
				const count = next.sessions.filter(session =>
					key === "working"
						? session.running
						: key === "waiting"
							? session.waiting
							: !session.running && !session.failed && !session.waiting,
				).length;
				section.append(node("p", `${label(key)} · ${count}`, "activity"));
			}
		} else if (widget.kind === "sessions") {
			if (!next.sessions.length) section.append(node("p", label("empty"), "muted"));
			// maxCards controls the visible viewport, not loss of access to older sessions.
			const list = node("div", undefined, "sessions");
			list.style.maxHeight = `${next.settings.maxCards * 112}px`;
			for (const session of next.sessions) {
				const card = node("article", undefined, "card session");
				const line = node("div", undefined, "session-title");
				line.append(
					node("strong", session.title),
					node(
						"span",
						session.failed
							? label("failed")
							: session.waiting
								? label("waiting")
								: session.running
									? label("working")
									: label("done"),
						"status",
					),
				);
				card.append(line, node("small", `${session.agent} · ${session.cwd}`, "muted"));
				if (session.tool || session.preview) card.append(node("p", session.tool || session.preview, "preview"));
				card.append(button(label("open"), { type: "open", sessionId: session.id }));
				list.append(card);
			}
			section.append(list);
		}
		content.append(section);
	}
	panel.append(content);
	content.scrollTop = scroll;
	if (focusedOption) {
		const input = panel.querySelectorAll("input")[focusedOption.index];
		if (input?.name === focusedOption.name) input.focus({ preventScroll: true });
	}
}
panel.addEventListener("mouseenter", () => {
	if (state?.settings.openOnHover && !state.expanded) window.notchPanel.action({ type: "expand" });
});
document.addEventListener("keydown", event => {
	if (event.key === "Escape") window.notchPanel.action({ type: "collapse" });
});
const unsubscribe = window.notchPanel.events(render);
void window.notchPanel.get().then(render);
const timer = setInterval(() => {
	for (const clock of clocks) clock.textContent = new Date().toLocaleTimeString();
}, 1000);
window.addEventListener("beforeunload", () => {
	unsubscribe();
	clearInterval(timer);
});
