import type { ToolEntry } from "../stores/tools";

/** Decode only the completed prefix of a streamed JSON string. */
function streamedString(json: string, field: "path" | "content"): string | null {
	let depth = 0;
	for (let index = 0; index < json.length; index++) {
		const char = json[index];
		if (char === "{" || char === "[") {
			depth++;
			continue;
		}
		if (char === "}" || char === "]") {
			depth--;
			continue;
		}
		if (char !== '"') continue;
		const start = index + 1;
		while (++index < json.length && json[index] !== '"') {
			if (json[index] === "\\") index++;
		}
		if (depth !== 1 || !json.startsWith(field, start) || index !== start + field.length) continue;
		let value = index + 1;
		while (value < json.length && /\s/.test(json[value])) value++;
		if (json[value++] !== ":") continue;
		while (value < json.length && /\s/.test(json[value])) value++;
		if (json[value] !== '"') return null;
		let end = ++value;
		while (end < json.length && json[end] !== '"') {
			if (json[end] === "\\") {
				const width = json[end + 1] === "u" ? 6 : 2;
				if (end + width > json.length) break;
				end += width;
			} else end++;
		}
		if (field === "path" && json[end] !== '"') return null;
		try {
			const decoded: unknown = JSON.parse(`"${json.slice(value, end)}"`);
			return typeof decoded === "string" ? decoded : null;
		} catch {
			return null;
		}
	}
	return null;
}

/** `propose` is a write pseudo-path; session-local plan drafts use the artifact convention. */
function planWrite(entries: Map<string, ToolEntry>, planPath: string | null) {
	let latest: { path: string; entry: ToolEntry } | null = null;
	for (const entry of entries.values()) {
		if (entry.status !== "pending" && entry.status !== "running") continue;
		if (entry.toolName && entry.toolName !== "write") continue;
		const path = typeof entry.args.path === "string" ? entry.args.path : streamedString(entry.streamingArgs, "path");
		if (path && (path === "propose" || path === planPath || /^local:\/+[^/\\]*plan\.md$/i.test(path)))
			latest = { path, entry };
	}
	return latest;
}

export function livePlanWritePath(entries: Map<string, ToolEntry>, planPath: string | null): string | null {
	return planWrite(entries, planPath)?.path ?? null;
}

/** Write arguments expose the plan before the file is persisted. */
export function streamingPlanContent(entries: Map<string, ToolEntry>, planPath: string | null): string | null {
	const matching = planWrite(entries, planPath);
	if (!matching) return null;
	const { args, streamingArgs } = matching.entry;
	return typeof args.content === "string" ? args.content : streamedString(streamingArgs, "content");
}
