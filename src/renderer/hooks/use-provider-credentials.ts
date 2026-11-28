import { useEffect, useRef, useState } from "react";
import type { ProviderInfo } from "../../shared/rpc-types";
import { describeError } from "../lib/errors";
import { useT } from "../lib/i18n";
import type { TabRpc } from "../lib/tab-rpc";
import { watchSignInRequests } from "../stores/extension-ui";
import { toast } from "../stores/toast";

type CredentialSession = {
	rpc: TabRpc;
	active: boolean;
	busy: boolean;
	dismissSignIn: (() => void) | null;
};

/** Shared credential flows, scoped to the tab that started them. */
export function useProviderCredentials({
	rpc,
	providers,
	reload,
}: {
	rpc: TabRpc;
	providers: readonly ProviderInfo[];
	reload: () => Promise<unknown>;
}) {
	const t = useT();
	const [busyProvider, setBusyProvider] = useState<string | null>(null);
	const [signIn, setSignIn] = useState<{ providerId: string; startedAt: number } | null>(null);
	const sessionRef = useRef<CredentialSession | null>(null);
	const rpcRef = useRef(rpc);
	rpcRef.current = rpc;

	useEffect(() => {
		const session: CredentialSession = { rpc, active: true, busy: false, dismissSignIn: null };
		sessionRef.current = session;
		setBusyProvider(null);
		setSignIn(null);
		return () => {
			session.active = false;
			session.dismissSignIn?.();
			session.dismissSignIn = null;
			if (sessionRef.current === session) sessionRef.current = null;
		};
	}, [rpc]);

	const isCurrent = (session: CredentialSession) =>
		session.active && sessionRef.current === session && rpcRef.current === session.rpc;

	const handleLogin = async (providerId: string): Promise<void> => {
		const session = sessionRef.current;
		if (!session || session.rpc !== rpc || !isCurrent(session) || session.busy) return;
		session.busy = true;
		const name = providers.find(provider => provider.id === providerId)?.name ?? providerId;
		setBusyProvider(providerId);
		setSignIn({ providerId, startedAt: Date.now() });
		session.dismissSignIn = watchSignInRequests();
		try {
			const res = await rpc.login(providerId);
			if (!isCurrent(session)) return;
			if (!res.success) {
				// Dismissing the sign-in page is cancellation, not an error.
				if (res.code === "login_cancelled") return;
				toast({ variant: "error", title: t("providers.loginFailed"), message: res.error });
				return;
			}
			await reload();
			if (!isCurrent(session)) return;
			toast({ variant: "success", message: t("providers.loginSuccess", { provider: name }) });
		} catch (cause) {
			if (isCurrent(session)) {
				toast({ variant: "error", title: t("providers.loginFailed"), message: String(cause) });
			}
		} finally {
			session.dismissSignIn?.();
			session.dismissSignIn = null;
			session.busy = false;
			if (isCurrent(session)) {
				setBusyProvider(null);
				setSignIn(null);
			}
		}
	};

	/** Failures stay in the API-key dialog rather than becoming error toasts. */
	const handleSaveApiKey = async (providerId: string, apiKey: string): Promise<string | null> => {
		const session = sessionRef.current;
		if (!session || session.rpc !== rpc || !isCurrent(session) || session.busy) return null;
		session.busy = true;
		const name = providers.find(provider => provider.id === providerId)?.name ?? providerId;
		setBusyProvider(providerId);
		try {
			const res = await rpc.setApiKey(providerId, apiKey);
			if (!isCurrent(session)) return null;
			if (!res.success) return res.error;
			await reload();
			if (!isCurrent(session)) return null;
			toast({ variant: "success", message: t("providers.apiKey.saved", { provider: name }) });
			return null;
		} catch (cause) {
			return isCurrent(session) ? describeError(cause) : null;
		} finally {
			session.busy = false;
			if (isCurrent(session)) setBusyProvider(null);
		}
	};

	return { busyProvider, signIn, handleLogin, handleSaveApiKey };
}
