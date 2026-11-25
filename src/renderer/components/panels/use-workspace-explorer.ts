import { useCallback, useEffect, useRef, useState } from "react";
import type { IpcFsListResult } from "../../../shared/ipc-types";
import { describeError } from "../../lib/errors";

// Reuse recent listings when the explorer remounts. Never cache search results or errors.
const DIRECTORY_CACHE_TTL_MS = 5_000;
const DIRECTORY_CACHE_LIMIT = 32;
const EMPTY_DIRECTORIES: ReadonlyMap<string, IpcFsListResult> = new Map();
const directoryCache = new Map<string, { result: IpcFsListResult; expires: number }>();

export function useWorkspaceExplorer(cwd: string, tabId: string | null, expanded: ReadonlySet<string>) {
	const [query, setQuery] = useState("");
	const [showIgnored, setShowIgnored] = useState(false);
	const scope = `${JSON.stringify([tabId, cwd, showIgnored])}\0`;
	const [listing, setListing] = useState({ scope, directories: EMPTY_DIRECTORIES });
	const directories = listing.scope === scope ? listing.directories : EMPTY_DIRECTORIES;
	const [search, setSearch] = useState<IpcFsListResult | null>(null);
	const [searchRevision, setSearchRevision] = useState(0);
	const active = useRef(new Set<string>());
	const version = useRef(0);
	const term = query.trim();
	const refresh = useCallback(() => {
		for (const key of directoryCache.keys()) {
			if (key.startsWith(scope)) directoryCache.delete(key);
		}
		version.current++;
		active.current.clear();
		setListing({ scope, directories: new Map() });
		setSearchRevision(value => value + 1);
	}, [scope]);

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
			const cacheable = tabId !== null || cwd !== "";
			const cached = cacheable ? directoryCache.get(key) : undefined;
			const publish = (result: IpcFsListResult) =>
				setListing(current => ({
					scope,
					directories: new Map(current.scope === scope ? current.directories : EMPTY_DIRECTORIES).set(
						path,
						result,
					),
				}));
			if (cached && cached.expires > Date.now()) {
				publish(cached.result);
				return;
			}
			active.current.add(path);
			let result: IpcFsListResult;
			try {
				result = await window.omp.fs.explore({ path, tabId: tabId ?? undefined, showIgnored });
			} catch (error) {
				result = { ok: false, entries: [], truncated: false, error: describeError(error) };
			}
			if (requestVersion !== version.current) return;
			active.current.delete(path);
			if (cacheable && result.ok) {
				directoryCache.delete(key);
				directoryCache.set(key, { result, expires: Date.now() + DIRECTORY_CACHE_TTL_MS });
				if (directoryCache.size > DIRECTORY_CACHE_LIMIT) {
					const oldest = directoryCache.keys().next().value;
					if (oldest !== undefined) directoryCache.delete(oldest);
				}
			}
			publish(result);
		};
		void list("");
		for (const id of expanded) void list(id.slice(4));
	}, [cwd, directories, expanded, scope, showIgnored, tabId]);

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
