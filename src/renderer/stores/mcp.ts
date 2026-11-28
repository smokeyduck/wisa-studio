import { createStore } from "zustand/vanilla";
import type { RpcMcpServerInfo, RpcMcpServersResult } from "../../shared/rpc-types";
import { describeError } from "../lib/errors";
import { activeTabCommand, createScopedStoreApi, type TabCommand, useScopedStore } from "./session-runtime-context";

/** Runtime connection state wins over cached tool registration and credential metadata. */
export function mcpServerState(server: RpcMcpServerInfo) {
	if (!server.enabled) return { key: "off", variant: "muted", pulse: false } as const;
	if (server.status === "connected") return { key: "connected", variant: "success", pulse: false } as const;
	if (server.status === "connecting") return { key: "connecting", variant: "warning", pulse: true } as const;
	if (server.lastError || server.authState === "expired" || server.authState === "required") {
		return { key: "error", variant: "error", pulse: false } as const;
	}
	return { key: "disconnected", variant: "muted", pulse: false } as const;
}

export interface McpStore {
	data: RpcMcpServerInfo[] | null;
	sessionKey: string;
	error: string | null;
	loading: boolean;
	refresh: () => Promise<void>;
	watch: (sessionKey: string) => () => void;
	reset: () => void;
}

/** One reader/timer per session; no parallel probes or connection attempts. */
export function createMcpStore(command: TabCommand = activeTabCommand) {
	let epoch = 0;
	let key = "";
	let watchers = 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	let pending: Promise<void> | null = null;
	let dirty = false;
	return createStore<McpStore>((set, get) => ({
		data: null,
		sessionKey: "",
		error: null,
		loading: false,
		refresh: () => {
			if (pending) {
				dirty = true;
				return pending;
			}
			const mine = epoch;
			set({ loading: get().data === null });
			const read = async () => {
				do {
					dirty = false;
					try {
						const response = await command({ type: "get_mcp_servers" });
						if (mine !== epoch) return;
						if (!response.success) throw new Error(describeError(response.error));
						set({ data: (response.data as RpcMcpServersResult).servers, error: null });
					} catch (cause) {
						if (mine !== epoch) return;
						// A failed read is unknown, not a healthy stale connection.
						set({ data: null, error: describeError(cause) });
					}
				} while (dirty && mine === epoch);
			};
			const request = read().finally(() => {
				if (mine === epoch) {
					pending = null;
					set({ loading: false });
				}
			});
			pending = request;
			return request;
		},
		watch: sessionKey => {
			if (key !== sessionKey) {
				get().reset();
				key = sessionKey;
				set({ sessionKey });
			}
			const mine = epoch;
			if (watchers++ === 0) {
				void get().refresh();
				timer = setInterval(() => {
					if (!pending) void get().refresh();
				}, 1000);
			}
			return () => {
				if (mine !== epoch || --watchers !== 0) return;
				clearInterval(timer);
				timer = undefined;
				++epoch;
				pending = null;
				set({ data: null, error: null, loading: false });
			};
		},
		reset: () => {
			++epoch;
			clearInterval(timer);
			timer = undefined;
			pending = null;
			watchers = 0;
			key = "";
			dirty = false;
			set({ data: null, error: null, loading: false, sessionKey: "" });
		},
	}));
}

const defaultMcpStore = createMcpStore();
function useMcp(): McpStore;
function useMcp<U>(selector: (state: McpStore) => U): U;
function useMcp<U = McpStore>(selector?: (state: McpStore) => U): U {
	return useScopedStore("mcp", defaultMcpStore, selector);
}
export const useMcpStore = Object.assign(useMcp, createScopedStoreApi("mcp", defaultMcpStore));
