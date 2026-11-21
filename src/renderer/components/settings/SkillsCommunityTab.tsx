/**
 * Community tab: browse skills.sh and install one into the user skills folder.
 *
 * The renderer never talks to the network here — main does the fetching (see
 * `src/main/skills-community.ts`), and the installer only writes files: it runs
 * no npm/pip/node and executes none of the scripts a skill ships. The tab says
 * both of those things next to the install target, because "one click install
 * from the internet" is exactly the place a user deserves to know where the
 * bytes land and what did not happen to them.
 */

import { Download, Search, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	COMMUNITY_QUERY_MIN_LENGTH,
	type CommunitySkill,
	communitySkillSlug,
	type IpcSkillsCommunitySearchResult,
} from "../../../shared/skills-community";
import { shortenPath } from "../../lib/format";
import { getFormattingLocale, useT } from "../../lib/i18n";
import { toast } from "../../stores/toast";
import { Button, Input, Spinner } from "../common";

/** Long enough that typing a name is one request, short enough to feel live. */
const DEBOUNCE_MS = 400;

type SearchState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ok"; query: string; skills: CommunitySkill[]; root: string; installed: Record<string, string> }
	| { status: "error"; error: string };

/** Install counts are the index's only quality signal, so they are always shown. */
function installsLabel(t: (key: string, params?: Record<string, string | number>) => string, installs: number): string {
	return t("skills.community.installs", { count: installs.toLocaleString(getFormattingLocale()) });
}

export function SkillsCommunityTab({ onInstalled }: { onInstalled?: () => void }) {
	const t = useT();
	const [input, setInput] = useState("");
	const [state, setState] = useState<SearchState>({ status: "idle" });
	const [installed, setInstalled] = useState<Record<string, string>>({});
	const [installing, setInstalling] = useState<string | null>(null);
	const sequence = useRef(0);

	const trimmed = input.trim();
	// skills.sh answers HTTP 400 below two characters, so the page never asks.
	const tooShort = trimmed.length > 0 && trimmed.length < COMMUNITY_QUERY_MIN_LENGTH;
	const bridge = typeof window === "undefined" ? undefined : window.omp?.skillsCommunity;

	useEffect(() => {
		if (!bridge) {
			setState({ status: "error", error: t("skills.community.unavailable") });
			return;
		}
		if (trimmed.length < COMMUNITY_QUERY_MIN_LENGTH) {
			sequence.current += 1;
			setState({ status: "idle" });
			return;
		}
		const mine = ++sequence.current;
		setState({ status: "loading" });
		const run = () => {
			bridge.search({ query: trimmed }).then(
				(answer: IpcSkillsCommunitySearchResult) => {
					if (mine !== sequence.current) return;
					if (answer.status !== "ok") {
						setState({ status: "error", error: answer.error });
						return;
					}
					setInstalled(current => ({ ...answer.installed, ...current }));
					setState({
						status: "ok",
						query: answer.query,
						skills: answer.skills,
						root: answer.root,
						installed: answer.installed ?? {},
					});
				},
				cause => {
					if (mine !== sequence.current) return;
					setState({ status: "error", error: String(cause) });
				},
			);
		};
		const timer = window.setTimeout(run, DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [bridge, t, trimmed]);

	const install = async (skill: CommunitySkill) => {
		if (!bridge || installing) return;
		setInstalling(skill.id);
		try {
			const result = await bridge.install({ id: skill.id });
			if (result.status !== "ok") {
				// "already installed" is not a failure the user caused: the folder is
				// there, so the row switches to its installed state either way.
				if (result.error === "already installed") {
					const slug = communitySkillSlug(skill.id) ?? skill.skillId;
					setInstalled(current => ({ ...current, [slug]: result.error }));
				}
				toast({ variant: "error", message: result.error });
				return;
			}
			const slug = communitySkillSlug(skill.id) ?? skill.skillId;
			setInstalled(current => ({ ...current, [slug]: result.dir }));
			setState(current => (current.status === "ok" ? { ...current, root: result.root } : current));
			toast({ variant: "success", title: t("skills.community.installSuccess"), message: result.dir });
			onInstalled?.();
		} catch (cause) {
			toast({ variant: "error", message: String(cause) });
		} finally {
			setInstalling(null);
		}
	};

	const root = state.status === "ok" ? state.root : null;

	const body = (() => {
		if (state.status === "error") {
			return (
				<div className="flex flex-col items-center justify-center gap-3 px-5 py-12 text-center">
					<p className="rounded-lg border border-[color-mix(in_srgb,var(--omp-error)_35%,transparent)] bg-transparent px-3 py-2 text-omp-sm text-(--omp-error)">
						{state.error}
					</p>
				</div>
			);
		}
		if (state.status === "loading") {
			return (
				<div className="flex items-center justify-center py-12">
					<Spinner label={t("skills.community.loading")} size="sm" />
				</div>
			);
		}
		if (state.status === "idle") {
			return (
				<div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
					<Search className="text-(--omp-dim)" size={20} strokeWidth={1.4} />
					<p className="text-omp-sm text-(--omp-dim)">
						{tooShort ? t("skills.community.minChars") : t("skills.community.hint")}
					</p>
				</div>
			);
		}
		if (state.skills.length === 0) {
			return (
				<div className="flex items-center justify-center px-5 py-12 text-center text-omp-sm text-(--omp-dim)">
					{t("skills.community.empty")}
				</div>
			);
		}
		return (
			<div className="p-1.5">
				{state.skills.map(skill => {
					// Either answer counts: this session's install, or the folder main
					// found on disk when it answered the search. Both are keyed by the
					// folder name, which is the id's slug segment.
					const slug = communitySkillSlug(skill.id) ?? skill.skillId;
					const installedDir = installed[slug] ?? state.installed[slug] ?? null;
					const busy = installing === skill.id;
					return (
						<div
							className="flex items-center gap-2 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-(--omp-bg-tertiary)"
							key={skill.id}
						>
							<span className="flex size-7 shrink-0 items-center justify-center text-(--omp-muted)">
								<Download size={13} />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate font-mono text-omp-sm font-medium text-(--omp-text)">
									{skill.name}
								</span>
								<span className="mt-0.5 block truncate text-omp-xxs text-(--omp-dim)">{skill.source}</span>
							</span>
							<span
								className="shrink-0 rounded-md border border-(--omp-border-muted) bg-transparent px-1.5 py-0.5 text-omp-xxs font-medium tracking-wide text-(--omp-dim) tabular-nums"
								title={t("skills.community.installsHint")}
							>
								{installsLabel(t, skill.installs)}
							</span>
							<Button
								disabled={Boolean(installedDir) || installing !== null}
								loading={busy}
								onClick={() => void install(skill)}
								size="sm"
								variant={installedDir ? "ghost" : "primary"}
							>
								{installedDir
									? t("skills.community.installed")
									: busy
										? t("skills.community.installing")
										: t("skills.community.install")}
							</Button>
						</div>
					);
				})}
			</div>
		);
	})();

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<Input
					aria-label={t("skills.community.search")}
					className="max-w-md"
					compact
					onChange={event => setInput(event.target.value)}
					placeholder={t("skills.community.searchPlaceholder")}
					spellCheck={false}
					value={input}
				/>
				{tooShort && <span className="text-omp-xxs text-(--omp-dim)">{t("skills.community.minChars")}</span>}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-(--omp-border-muted)">{body}</div>

			{/* Where the files go, and what the installer did not do with them. */}
			<div className="flex flex-col gap-1.5 rounded-lg border border-(--omp-border-muted) px-3 py-2.5">
				{root && (
					<p className="flex flex-wrap items-center gap-1.5 text-omp-xxs text-(--omp-dim)">
						<span>{t("skills.community.target")}</span>
						<span className="truncate font-mono text-(--omp-muted)" title={root}>
							{shortenPath(root)}
						</span>
					</p>
				)}
				<p className="flex items-start gap-1.5 text-omp-xxs leading-relaxed text-(--omp-dim)">
					<ShieldCheck className="mt-px shrink-0 text-(--omp-success)" size={12} />
					<span>{t("skills.community.safetyNote")}</span>
				</p>
			</div>
		</div>
	);
}
