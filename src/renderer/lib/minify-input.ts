/** Remove JSON layout without reserializing numbers, duplicate keys or string escapes. */
function compactJson(text: string): string | undefined {
	if (!/^\s*[[{]/.test(text)) return undefined;
	try {
		JSON.parse(text);
	} catch {
		return undefined;
	}
	return text.replace(/"(?:[^"\\]|\\[\s\S])*"|[\t\n\r ]+/g, token => (token[0] === '"' ? token : ""));
}

/** Conservative, local submit-time reduction; never summarize or drop log records.
 * Commands and code remain literal. JSON loses only insignificant whitespace;
 * prose loses excess blank lines and trailing space (keeping Markdown hard breaks).
 */
export function minifyInput(text: string): string {
	if (/^\s*\//.test(text)) return text;
	const json = compactJson(text);
	if (json !== undefined) return json;

	const lines = text.split("\n");
	const result: string[] = [];
	let blank = false;
	let indented = false;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const fence = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?$/.exec(line);
		if (fence) {
			const start = index;
			const marker = fence[1];
			const closing = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}[ \\t]*\\r?$`);
			while (++index < lines.length && !closing.test(lines[index])) {}
			if (index === lines.length) {
				for (let rest = start; rest < lines.length; rest++) result.push(lines[rest]);
				break;
			}
			result.push(line);
			if (index > start + 1) {
				const body = lines.slice(start + 1, index).join("\n");
				const compact = fence[2].trim().toLowerCase() === "json" ? compactJson(body) : undefined;
				result.push(compact ?? body);
			}
			result.push(lines[index]);
			blank = false;
			indented = false;
			continue;
		}
		// Indented code, YAML literals and stack traces keep their layout.
		if (/^(?: {4}|\t)/.test(line)) {
			result.push(line);
			blank = false;
			indented = true;
			continue;
		}
		if (/^[ \t\r]*$/.test(line)) {
			if (!blank || indented) result.push(line);
			blank = true;
		} else {
			indented = false;
			result.push(line.replace(/[ \t]+$/, space => (space.endsWith("  ") ? "  " : "")));
			blank = false;
		}
	}
	return result.join("\n");
}
