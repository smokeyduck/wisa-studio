import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NotchAppTarget } from "../shared/notch-apps";

export interface NotchRevision {
	id: string;
	createdAt: string;
	name: string;
	html: string;
	width: number;
	height: number;
}
export interface StoredNotchApp {
	id: string;
	currentRevision: string;
	revisions: NotchRevision[];
	state: unknown;
}
interface StoreData {
	version: 1;
	apps: StoredNotchApp[];
	active: NotchAppTarget | null;
}

export function boundedText(value: unknown, label: string, limit: number): string {
	if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`Invalid ${label}`);
	return value;
}
export function appId(value: unknown): string {
	const id = boundedText(value, "app id", 64);
	if (!/^[a-z0-9][a-z0-9_-]*$/.test(id))
		throw new Error("App id must use lowercase letters, digits, underscores or hyphens");
	return id;
}
function dimension(value: unknown, label: string, min: number, max: number): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max)
		throw new Error(`Invalid ${label}: ${min}–${max}`);
	return value;
}
export function revisionInput(args: Record<string, unknown>): Omit<NotchRevision, "id" | "createdAt"> {
	return {
		name: boundedText(args.name, "name", 120),
		html: boundedText(args.html, "HTML (maximum 512 KiB)", 512 * 1024),
		width: dimension(args.width, "width", 120, 1600),
		height: dimension(args.height, "height", 40, 1000),
	};
}

/** One bounded, atomic document keeps revision source, active pointer and state consistent. */
export class NotchAppStore {
	#path: string;
	data: StoreData = { version: 1, apps: [], active: null };

	constructor(directory: string) {
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		this.#path = join(directory, "notch-apps.json");
		try {
			const text = readFileSync(this.#path, "utf8");
			if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error("Mini-app store exceeds limit");
			const value = JSON.parse(text) as StoreData;
			if (value.version !== 1 || !Array.isArray(value.apps) || value.apps.length > 64)
				throw new Error("Invalid mini-app store");
			const ids = new Set<string>();
			for (const app of value.apps) {
				appId(app.id);
				if (ids.has(app.id) || !Array.isArray(app.revisions) || !app.revisions.length || app.revisions.length > 100)
					throw new Error("Invalid app revisions");
				ids.add(app.id);
				const revisions = new Set<string>();
				for (const revision of app.revisions) {
					revisionInput(revision as unknown as Record<string, unknown>);
					boundedText(revision.id, "revision", 64);
					if (revisions.has(revision.id) || !Number.isFinite(Date.parse(revision.createdAt)))
						throw new Error("Invalid revision metadata");
					revisions.add(revision.id);
				}
				if (!revisions.has(app.currentRevision)) throw new Error("Missing current revision");
				this.validateState(app.state);
			}
			if (
				value.active &&
				!value.apps.some(
					app => app.id === value.active?.appId && app.revisions.some(rev => rev.id === value.active?.revisionId),
				)
			)
				throw new Error("Missing active revision");
			this.data = value;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}

	validateState(value: unknown): void {
		const json = JSON.stringify(value);
		if (json === undefined || Buffer.byteLength(json) > 64 * 1024)
			throw new Error("App state must be JSON, at most 64 KiB");
	}

	commit(next: StoreData): void {
		const json = JSON.stringify(next);
		if (Buffer.byteLength(json) > 16 * 1024 * 1024) throw new Error("Mini-app storage limit reached (16 MiB)");
		const temporary = `${this.#path}.${randomUUID()}.tmp`;
		writeFileSync(temporary, json, { encoding: "utf8", mode: 0o600 });
		renameSync(temporary, this.#path);
		this.data = next;
	}

	resolve(args: Record<string, unknown>): { app: StoredNotchApp; revision: NotchRevision; target: NotchAppTarget } {
		const id = appId(args.id);
		const app = this.data.apps.find(entry => entry.id === id);
		if (!app) throw new Error(`Unknown app: ${id}`);
		const revisionId = args.revisionId ?? app.currentRevision;
		const revision = app.revisions.find(entry => entry.id === revisionId);
		if (!revision) throw new Error("Unknown revision");
		return { app, revision, target: { appId: id, revisionId: revision.id } };
	}

	save(args: Record<string, unknown>): void {
		const id = appId(args.id);
		const source = revisionInput(args);
		const existing = this.data.apps.find(entry => entry.id === id);
		if ((!existing && this.data.apps.length >= 64) || (existing && existing.revisions.length >= 100))
			throw new Error("App/revision limit reached; export and delete unused apps");
		const revision = { ...source, id: randomUUID(), createdAt: new Date().toISOString() };
		const app = {
			id,
			currentRevision: revision.id,
			revisions: [...(existing?.revisions ?? []), revision],
			state: existing?.state ?? null,
		};
		this.commit({ ...this.data, apps: [...this.data.apps.filter(entry => entry.id !== id), app] });
	}
}
