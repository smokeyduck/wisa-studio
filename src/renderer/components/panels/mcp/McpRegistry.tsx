import { Plug, Search } from "lucide-react";
import { useEffect, useState } from "react";
import {
	MCP_REGISTRY_SEARCH_MAX,
	MCP_REGISTRY_SERVERS_URL,
	type McpCatalogEntry,
	type McpCatalogPage,
} from "../../../../shared/mcp-catalog";
import type { RpcMcpServerInfo } from "../../../../shared/rpc-types";
import { describeError } from "../../../lib/errors";
import { useT } from "../../../lib/i18n";
import { Button, ConfirmDialog, Spinner } from "../../common";
import { CatalogCard } from "../../common/CatalogCard";
import { CopyableError } from "../inventory/ErrorNote";
import { validateMcpServerName } from "./McpServerWizard";

type Remote = NonNullable<McpCatalogEntry["remote"]>;

function configuredEndpoint(servers: readonly RpcMcpServerInfo[], remote: Remote): boolean {
	return servers.some(
		server => server.transport === remote.transport && server.url && URL.parse(server.url)?.href === remote.url,
	);
}

export function McpRegistry({
	servers,
	workspace,
	routeKey,
	canInstall,
	busyKey,
	onInstall,
}: {
	servers: readonly RpcMcpServerInfo[];
	workspace: string;
	routeKey: string;
	canInstall: boolean;
	busyKey: string | null;
	onInstall: (name: string, remote: Remote) => void;
}) {
	const t = useT();
	const [query, setQuery] = useState("");
	const [request, setRequest] = useState<{ search: string; cursors: string[] }>({ search: "", cursors: [] });
	const [result, setResult] = useState<{ request: typeof request; page?: McpCatalogPage; error?: string } | null>(
		null,
	);
	const [pending, setPending] = useState<{ routeKey: string; name: string; remote: Remote } | null>(null);
	const page = result?.request === request ? result.page : undefined;
	const error = result?.request === request ? result.error : undefined;
	const selected = pending?.routeKey === routeKey ? pending : null;

	useEffect(() => {
		let stale = false;
		const cursor = request.cursors.at(-1);
		void (async () => {
			try {
				const page = await window.omp.mcpCatalog.list({ search: request.search, ...(cursor ? { cursor } : {}) });
				if (!stale) setResult({ request, page });
			} catch (cause) {
				if (!stale) setResult({ request, error: describeError(cause) });
			}
		})();
		return () => {
			stale = true;
		};
	}, [request]);

	const confirmInstall = (): void => {
		if (
			!selected ||
			!canInstall ||
			configuredEndpoint(servers, selected.remote) ||
			servers.some(server => server.name === selected.name)
		) {
			return;
		}
		setPending(null);
		onInstall(selected.name, selected.remote);
	};

	return (
		<section
			aria-label={t("mcp.registry.title")}
			className="flex flex-col gap-3 border-t border-(--omp-border-muted) px-4 py-3"
		>
			<div>
				<h3 className="font-medium text-(--omp-text)">{t("mcp.registry.title")}</h3>
				<p className="text-omp-sm text-(--omp-dim)">{t("mcp.registry.description")}</p>
			</div>
			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={event => {
					event.preventDefault();
					setRequest({ search: query.trim(), cursors: [] });
				}}
			>
				<input
					aria-label={t("mcp.registry.search")}
					className="min-w-40 flex-1 rounded-md border border-(--omp-input-border) bg-(--omp-input-bg) px-2.5 py-1.5 text-omp-sm text-(--omp-text) placeholder:text-(--omp-dim) focus:border-(--omp-input-focus-border) focus:outline-none"
					maxLength={MCP_REGISTRY_SEARCH_MAX}
					onChange={event => setQuery(event.target.value)}
					placeholder={t("mcp.registry.search")}
					spellCheck={false}
					type="search"
					value={query}
				/>
				<Button icon={<Search size={12} />} size="sm" type="submit" variant="secondary">
					{t("mcp.registry.searchButton")}
				</Button>
			</form>
			{error !== undefined ? (
				<div className="space-y-2">
					<CopyableError message={`${t("mcp.registry.failed")} ${error}`} copyLabel={t("marketplace.copyError")} />
					<Button onClick={() => setRequest(previous => ({ ...previous }))} size="sm" variant="secondary">
						{t("common.retry")}
					</Button>
				</div>
			) : !page ? (
				<Spinner label={t("common.loading")} size="sm" />
			) : page.entries.length === 0 ? (
				<p className="text-omp-sm text-(--omp-dim)">{t("mcp.registry.empty")}</p>
			) : (
				<ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-2.5">
					{page.entries.map(entry => {
						const { remote } = entry;
						// Core permits a colon but not a slash. Preserve both namespace and name.
						const name = entry.name.replace("/", ":");
						const installed = remote && configuredEndpoint(servers, remote);
						const nameTaken = servers.some(server => server.name === name);
						const registryUrl = `${MCP_REGISTRY_SERVERS_URL}/${encodeURIComponent(entry.name)}/versions/${encodeURIComponent(entry.version)}`;
						return (
							<li className="min-w-0" key={entry.name}>
								<CatalogCard
									byline={entry.title ? entry.name : undefined}
									description={entry.description}
									install={
										installed
											? { installed: true, label: t("mcp.registry.installed") }
											: !remote || validateMcpServerName(name)
												? { unavailable: true, label: t("mcp.registry.manual") }
												: {
														installed: false,
														label: t("mcp.registry.install"),
														disabled: !canInstall || nameTaken,
														loading: busyKey === name,
														title: nameTaken ? t("mcp.registry.nameTaken") : undefined,
														onClick: () => setPending({ routeKey, name, remote }),
													}
									}
									logo={
										<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--omp-selected-bg) text-(--omp-muted)">
											<Plug aria-hidden="true" size={16} />
										</span>
									}
									metadata={entry.version}
									onOpen={() => void window.omp.system.openExternal(registryUrl)}
									openLabel={`${t("mcp.registry.entry")}: ${entry.title ?? entry.name}`}
									square
									title={entry.title ?? entry.name}
								/>
							</li>
						);
					})}
				</ul>
			)}
			{(request.cursors.length > 0 || page?.nextCursor) && (
				<div className="flex flex-wrap justify-end gap-2">
					<Button
						disabled={request.cursors.length === 0}
						onClick={() => setRequest(previous => ({ ...previous, cursors: previous.cursors.slice(0, -1) }))}
						size="sm"
						variant="ghost"
					>
						{t("mcp.registry.previous")}
					</Button>
					<Button
						disabled={!page?.nextCursor || request.cursors.includes(page.nextCursor)}
						onClick={() => {
							const cursor = page?.nextCursor;
							if (cursor) setRequest(previous => ({ ...previous, cursors: [...previous.cursors, cursor] }));
						}}
						size="sm"
						variant="secondary"
					>
						{t("mcp.registry.next")}
					</Button>
				</div>
			)}
			<ConfirmDialog
				busy={!canInstall}
				confirmLabel={t("mcp.registry.trustConfirm")}
				message={t("mcp.registry.trustMessage", {
					name: selected?.name ?? "",
					workspace,
					url: selected?.remote.url ?? "",
				})}
				onCancel={() => setPending(null)}
				onConfirm={confirmInstall}
				open={selected !== null}
				title={t("mcp.registry.trustTitle", { name: selected?.name ?? "" })}
				warning={t("mcp.registry.trustWarning")}
			/>
		</section>
	);
}
