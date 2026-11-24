/** Queue and goal indicators at the end of the transcript's scroll area. */
import { useSubagentStreamPoll } from "../../../hooks/use-subagent-stream-poll";
import { useQueuedMessages } from "../../../stores/queue";
import { useSessionStore } from "../../../stores/session";
import { useRuntimeTabId } from "../../../stores/session-runtime-context";
import { useTabsStore } from "../../../stores/tabs";
import { PanelErrorBoundary } from "../../common";
import { GoalDockBar } from "./GoalDockBar";
import { QueueDockChip } from "./QueueDockChip";

function WorkspaceDockContent() {
	const goalVisible = useSessionStore(state => state.goal !== null);
	const queued = useQueuedMessages();
	const queueVisible = queued.steering.length > 0 || queued.followUp.length > 0;

	if (!queueVisible && !goalVisible) return null;
	return (
		<div className="omp-workspace-dock flex min-h-0 flex-col gap-1.5 pt-2 pb-1.5">
			{queueVisible && (
				<div className="min-h-0" data-testid="workspace-dock">
					<PanelErrorBoundary>
						<QueueDockChip />
					</PanelErrorBoundary>
				</div>
			)}
			<PanelErrorBoundary>
				<GoalDockBar />
			</PanelErrorBoundary>
		</div>
	);
}

/** `pollMs`: get_subagents cadence while a turn streams (tests shorten it). */
export function WorkspaceDock({ pollMs }: { pollMs?: number }) {
	useSubagentStreamPoll(pollMs);
	const tabId = useRuntimeTabId();
	const isChat = useTabsStore(state => state.tabs.find(tab => tab.id === (tabId ?? state.activeTabId))?.kind === "chat");
	if (isChat) return null;
	return <WorkspaceDockContent />;
}
