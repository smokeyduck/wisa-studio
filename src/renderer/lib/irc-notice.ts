import { resultDetails } from "./format";

/** Summarize agent coordination without showing the message body in the UI. */
export function ircNotice(message: unknown, t: (key: string, params?: { agent: string }) => string): string {
	const from = resultDetails(message)?.from;
	const agent = typeof from === "string" ? from.trim() : "";
	return agent ? t("chat.custom.ircReplied", { agent }) : t("chat.custom.ircUnknownSender");
}
