import type { RpcGitChanges } from "../../shared/rpc-types";
import { type GitQueryCache, useCachedGitQuery } from "./use-cached-git-query";

const cache = new WeakMap<object, GitQueryCache<RpcGitChanges>>();

/** Overview and Changes share the checkout's status list. */
export function useWorkingTreeChanges() {
	return useCachedGitQuery(cache, "getGitChanges");
}

