import { useCallback, useEffect, useRef, useState } from "react";
import type { IpcFsListResult } from "../../../shared/ipc-types";
import { useWorkspaceRevision } from "../../hooks/use-workspace-revision";
import { describeError } from "../../lib/errors";

// Keep successful listings and coalesce in-flight reads across drawer mounts.
// Search results and failures never enter the reusable cache.
const DIRECTORY_CACHE_LIMIT = 32;
const EMPTY_DIRECTORIES: ReadonlyMap<string, IpcFsListResult> = new Map();
const bridgeCaches = new WeakMap<object, Map<string, Promise<IpcFsListResult>>>();

export function useWorkspaceExplorer(cwd: string, tabId: string | null, expanded: ReadonlySet<string>) {
	const [query, setQuery] = useState("");
	const [showIgnored, setShowIgnored] = useState(false);
	const revision = useWorkspaceRevision();
	const fs = window.omp?.fs;
	let directoryCache = fs && bridgeCaches.get(fs);
	if (fs && !directoryCache) {
		directoryCache = new Map();
		bridgeCaches.set(fs, directoryCache);
	}
	const workspacePrefix = JSON.stringify([tabId, cwd]).slice(0, -1) + ",";
	const scope = workspacePrefix + showIgnored + "," + revision + "];";
	const [listing, setListing] = useState({ scope, directories: EMPTY_DIRECTORIES });
	const directories = listing.scope === scope ? listing.directories : EMPTY_DIRECTORIES;
	const [search, setSearch] = useState<IpcFsListResult | null>(null);
	const [searchRevision, setSearchRevision] = useState(0);
	const active = useRef(new Set<string>());
	const version = useRef(0);
	const term = query.trim();
	const refresh = useCallback(() => {
		for (const key of directoryCache?.keys() ?? []) {
			if (key.startsWith(workspacePrefix)) directoryCache?.delete(key);
		}
		version.current++;
		active.current.clear();
		setListing({ scope, directories: new Map() });
		setSearchRevision(value => value + 1);
	}, [directoryCache, scope, workspacePrefix]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: invalidate in-flight reads when the scope changes or unmounts.
	useEffect(() => {
		const requests = active.current;
		return () => {
			version.current++;
			requests.clear();
		};
	}, [scope]);

	useEffect(() => {
		const requestVersion = version.current;
		const list = async (path: string) => {
			if (directories.has(path) || active.current.has(path)) return;
			const key = scope + path;
			const publish = (result: IpcFsListResult) =>
				setListing(current => ({
					scope,
					directories: new Map(current.scope === scope ? current.directories : EMPTY_DIRECTORIES).set(
						path,
						result,
					),
				}));
			active.current.add(path);
			let lookup = directoryCache?.get(key);
			if (!lookup) {
				lookup = Promise.resolve()
					.then(() => window.omp.fs.explore({ path, tabId: tabId ?? undefined, showIgnored }))
					.catch((error): IpcFsListResult => ({ ok: false, entries: [], truncated: false, error: describeError(error) }));
				if (directoryCache && (tabId !== null || cwd !== "")) {
					directoryCache.set(key, lookup);
					if (directoryCache.size > DIRECTORY_CACHE_LIMIT) {
						const oldest = directoryCache.keys().next().value;
						if (oldest !== undefined) directoryCache.delete(oldest);
					}
					void lookup.then(result => {
						if (!result.ok && directoryCache.get(key) === lookup) directoryCache.delete(key);
					});
				}
			}
			const result = await lookup;
			if (requestVersion !== version.current) return;
			active.current.delete(path);
			publish(result);
		};
		void list("");
		for (const id of expanded) void list(id.slice(4));
	}, [cwd, directories, directoryCache, expanded, scope, showIgnored, tabId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reload on refresh and when a tab changes working directories.
	useEffect(() => {
		setSearch(null);
		if (!term) return;
		let cancelled = false;
		let started = false;
		const request = { showIgnored, tabId: tabId ?? undefined };
		const timer = window.setTimeout(() => {
			started = true;
			void window.omp.fs
				.explore({ ...request, query: term })
				.then(result => {
					if (!cancelled) setSearch(result);
				})
				.catch(error => {
					if (!cancelled) setSearch({ ok: false, entries: [], truncated: false, error: describeError(error) });
				});
		}, 160);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
			if (started) void window.omp.fs.explore({ ...request, query: "" }).catch(() => {});
		};
	}, [term, scope, showIgnored, tabId, searchRevision]);

	return { term, query, setQuery, showIgnored, setShowIgnored, directories, search, refresh };
}
