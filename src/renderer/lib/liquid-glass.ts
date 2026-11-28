import { type CssMaterialOptions, createCssMaterialTokens, createGlassLookTokens } from "open-glass-ui";

const STYLE_ID = "wisa-liquid-glass-materials";
const MATERIALS = ["clear", "regular", "frosted"] as const;
const INTERACTIVE_SURFACES = [
	".omp-button:not(:disabled)",
	".omp-pressable:not(:disabled)",
	".omp-send-button:not(:disabled)",
	'.omp-tabs [role="tab"]:not(:disabled)',
	".settings-nav-item:not(:disabled)",
	".omp-card",
	".omp-onboarding-choice",
].join(",");

/** One delegated light field, one pending frame, no work while the pointer is idle. */
function installGlassLighting(): void {
	const reducedEffects = matchMedia(
		"(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)",
	);
	const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
	let enabled = false;
	let surface: HTMLElement | null = null;
	let frame = 0;
	let x = 0;
	let y = 0;
	const reset = () => {
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
		surface?.style.removeProperty("--wisa-glass-x");
		surface?.style.removeProperty("--wisa-glass-y");
		surface = null;
	};
	const paint = () => {
		frame = 0;
		if (!surface?.isConnected) {
			reset();
			return;
		}
		const bounds = surface.getBoundingClientRect();
		surface.style.setProperty("--wisa-glass-x", `${Math.round(x - bounds.left)}px`);
		surface.style.setProperty("--wisa-glass-y", `${Math.round(y - bounds.top)}px`);
	};
	const onPointerMove = (event: PointerEvent) => {
		if (event.pointerType === "touch") return;
		const next = event.target instanceof Element ? event.target.closest<HTMLElement>(INTERACTIVE_SURFACES) : null;
		if (surface !== next) {
			reset();
			surface = next;
		}
		if (!surface) return;
		x = event.clientX;
		y = event.clientY;
		if (!frame) frame = requestAnimationFrame(paint);
	};
	const onPointerOut = (event: PointerEvent) => {
		if (!(event.relatedTarget instanceof Node) || !surface?.contains(event.relatedTarget)) reset();
	};
	const update = () => {
		const next = finePointer.matches && !reducedEffects.matches;
		if (next === enabled) return;
		enabled = next;
		if (enabled) {
			document.addEventListener("pointermove", onPointerMove, { passive: true });
			document.addEventListener("pointerout", onPointerOut, { passive: true });
			window.addEventListener("blur", reset);
		} else {
			document.removeEventListener("pointermove", onPointerMove);
			document.removeEventListener("pointerout", onPointerOut);
			window.removeEventListener("blur", reset);
			reset();
		}
	};
	reducedEffects.addEventListener("change", update);
	finePointer.addEventListener("change", update);
	update();
}

/** Generate the vendor's material recipes once, not once per rendered element.
 * CSS follows theme and accessibility changes, including portals under body.
 * A separate namespace survives clearInlineThemeTokens and custom theme loads.
 */
export function installLiquidGlass(): void {
	if (document.getElementById(STYLE_ID)) return;
	const declarations = (options: Omit<CssMaterialOptions, "material">) =>
		MATERIALS.flatMap(material =>
			Object.entries(createCssMaterialTokens({ ...options, material, design: "liquid" })).map(
				([key, value]) => `${key.replace("--ogui-material-", `--wisa-glass-${material}-`)}:${value};`,
			),
		).join("");
	const themes = (options: Partial<CssMaterialOptions> = {}) =>
		(["dark", "light"] as const)
			.map(tone => {
				const selector = tone === "dark" ? ":root:not([data-theme=light])" : ":root[data-theme=light]";
				return `${selector}{${declarations({ tone, ...options })}}`;
			})
			.join("");
	const look = Object.entries(createGlassLookTokens("liquid"))
		.map(([key, value]) => `${key}:${value};`)
		.join("");
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = [
		`:root{${look}}`,
		themes(),
		`@supports not (backdrop-filter:blur(1px)){${themes({ reducedTransparency: true })}}`,
		`@media (prefers-reduced-transparency:reduce),(prefers-contrast:more){${themes({ reducedTransparency: true })}}`,
		`@media (forced-colors:active){${themes({ forcedColors: true })}}`,
	].join("\n");
	document.head.append(style);
	installGlassLighting();
}
