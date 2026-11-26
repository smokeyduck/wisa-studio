import type { RpcGitStatus } from "../../shared/rpc-types";
import { type GitQueryCache, useCachedGitQuery } from "./use-cached-git-query";

const cache = new WeakMap<object, GitQueryCache<RpcGitStatus>>();

export function useGitStatus(): { status: RpcGitStatus | null; refresh: () => void } {
	const { data, refresh } = useCachedGitQuery(cache, "getGitStatus");
	return { status: data, refresh };
}
