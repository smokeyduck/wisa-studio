import { describe, expect, it } from "vitest";
import { minifyInput } from "./minify-input";

describe("minifyInput", () => {
	it("removes JSON layout without rounding numbers, merging duplicate keys or touching strings", () => {
		const text = String.raw`{ "id": 9007199254740993, "id": 1e+100, "text": "two  spaces\n\"quoted\"", "ok": true }`;
		expect(minifyInput(text)).toBe(
			String.raw`{"id":9007199254740993,"id":1e+100,"text":"two  spaces\n\"quoted\"","ok":true}`,
		);
	});

	it("compacts fenced JSON but preserves other code, Markdown hard breaks and log records", () => {
		const code = '```python\nif ready:\n    print("two  spaces")  \n\n\n```';
		const text = `Inspect this   \n\n\n\n${code}\n\n\`\`\`json\n{\n  "ok": true\n}\n\`\`\`\nERROR one\nERROR one\n    at main:42  `;
		expect(minifyInput(text)).toBe(
			`Inspect this  \n\n${code}\n\n\`\`\`json\n{"ok":true}\n\`\`\`\nERROR one\nERROR one\n    at main:42  `,
		);
	});

	it.each([
		"/custom preserve   \n\n\narguments",
		"```\n```",
		"```",
		"```python\nprint(1)  \n\n\n",
		"~~~json\n{ invalid JSON }\n~~~",
		"````text\n```\nnot a closing fence  \n````",
		"    literal  \n    \n    \n    end",
		"    literal\n\n\n    end",
	])("keeps commands and literal/code boundaries intact: %s", text => {
		expect(minifyInput(text)).toBe(text);
	});

	it("does not delete nonblank lines or join words in plain logs", () => {
		const text = "ERROR  path with spaces \n\n\n\nWARN next\nTRACE repeated\nTRACE repeated";
		expect(minifyInput(text)).toBe("ERROR  path with spaces\n\nWARN next\nTRACE repeated\nTRACE repeated");
	});
});
