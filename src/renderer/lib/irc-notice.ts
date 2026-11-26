import { resultDetails } from "./format";

export function ircSenderId(message: unknown): string | undefined {
	const from = resultDetails(message)?.from;
	return typeof from === "string" && from.trim() ? from.trim() : undefined;
}

/** Summarize agent coordination without showing the message body in the UI. */
export function ircNotice(message: unknown, t: (key: string, params?: { agent: string }) => string): string {
	const agent = ircSenderId(message);
	return agent ? t("chat.custom.ircReplied", { agent }) : t("chat.custom.ircUnknownSender");
}
