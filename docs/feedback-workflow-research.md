# Feedback workflow research

Date: 2026-11-22. Primary-source findings only. **Evidence** summarizes retrieved sources; **Decision** specifies this product's design, not a requirement attributed to those sources.

## Questions belong to their chat

**Evidence:** Claude Code documents `AskUserQuestion` as multiple-choice clarification or decision gathering, with an `Other` row or notes field for free text. Questions wait for an answer by default. Its optional idle timeout does not apply to background sessions, screen reader mode, or Remote Control. Permission prompts, including plan approval, never auto-resolve on idle. [1]

**Decision:** Render each agent question inline in its owning chat, next to the conversation that explains it. Keep questions and answers associated with the originating session and request; switching chats must not redirect an answer. Preserve choices, free-text input, and pending state until an explicit answer or cancellation. Background questions may expose an unread/pending indicator, not steal focus or open a global modal. Keep clarification separate from permission and plan approval.

**Boundary:** [1] supports explicit conversational clarification and free-text answers. It does not prescribe inline placement, cross-session routing, or a ban on question modals. Those are product decisions to retain context and avoid interrupting another chat.

## Plan in the right sidebar

**Evidence:** CSSWG's scroll-anchoring draft describes unexpected movement during content consumption as disruptive. Its mechanism adjusts scroll position to keep the user's view stable across layout changes. This is an Editor's Draft, explicitly work in progress, not a browser-support guarantee or a specification of streaming-chat behavior. [2]

**Decision:** Show the owning chat's plan in a labeled right sidebar. Reveal streamed plan content progressively without replacing the chat or opening a modal. Give the plan its own scroll container; updates must not scroll the conversation.

**Decision:** Follow appended plan content only while the user remains at the plan's end. Scrolling away suspends following and preserves the reading position; offer an explicit “Jump to latest” control to resume. Do not reset to the top or force the bottom for every token, render, or status change. Opening the panel may preserve its previous position; merely receiving an update must not move keyboard focus. Keep plan approval an explicit action, separate from revealing or scrolling the plan.

**Boundary:** Right-side placement, follow-at-end behavior, and the resume control are product decisions informed by [2]'s stability goal. Native scroll anchoring alone does not implement this intent policy. Progressive reveal means content arrival, not mandatory smooth animation.

## Compact quick setup dialogs

**Evidence:** WAI APG's modal-dialog pattern makes the background inert, moves focus inside on open, contains `Tab` and `Shift+Tab`, and closes on `Escape`. It strongly recommends a visible close or cancel button. The dialog needs an accessible name and `aria-modal="true"`; modal semantics must match actual interaction blocking. [3]

**Evidence:** Initial focus depends on content: usually the first focusable control, but a static heading or introductory element can be appropriate for structured or long content. Closing normally returns focus to the invoker; if it disappeared, or the next workflow step is more logical, focus moves to a suitable alternative. APG advises omitting `aria-describedby` for complex structured content rather than announcing it as one unbroken string. [3]

**Decision:** Use compact, viewport-centered modals for short, user-invoked quick setup tasks. Keep only task-relevant controls, a clear title, primary action, and visible cancel/close action. Bound dimensions to the viewport; allow internal scrolling when needed rather than clipping controls. Centering and compactness are product choices, not APG requirements.

**Decision:** On open, focus the first meaningful setup field unless introductory content must be read first. Trap keyboard traversal and make background controls inert. On cancel or completion, restore the launcher focus, or the logical next control if the launcher no longer exists. Do not mark the plan sidebar or inline questions modal. Do not introduce a second nested modal for ordinary setup steps.

## Implemented workflow contract

Questions use the owning transcript, never a global clarification overlay: `ask`, `askDialog`, `form`, non-permission `select`, and non-sign-in `input`. Their request-owned drafts and receipt timestamps survive transcript remounts. Permission confirmations and sign-in remain explicit modal interactions.

Plan documents and structured approval render only in the inspector. A focused project/session reveals its plan on activation, a new planning turn, or a new proposal. Deliberately closing the inspector wins through refreshes and completion of that turn; a subsequent planning turn or proposal may reveal it again. Background sessions cannot reveal their plan over the focused project. The sidebar does not move keyboard focus.

The plan previews completed prefixes of actual streamed write arguments targeting its exact path or `propose`. Persisted snapshots reconcile after tool/turn events and at a bounded 400 ms cadence during active planning; the known path avoids repeated mode RPCs. No synthetic typing animation or claim that disk writes arrive per token. Follow-scroll stops on upward reading gestures and resumes only at the end or through Jump to latest.

All transcript starter cards use a single compact prompt-editing dialog. Continue in chat stages the draft through the existing composer path, retaining normal attachments and submission safeguards. Vibe, Goal and Loop use the same centered modal convention rather than workspace navigation. The plan itself is never rendered inside those setup dialogs.

Verification: headless linkedom renderer tests exercise question choices/forms/sign-in, cross-tab isolation and draft remounts, plan approval actions, real streamed plan rendering and scroll intent, project-scoped sidebar transitions, all twelve starter cards, and the three mode dialogs. No Electron window was launched. Integration checks belong to the director.

## Session resume and protocol routing evidence

`showView` changes the focused runtime synchronously, settles the main route before awaiting hydration, and retains that runtime's history. Main-process `setTabView` synchronously wires full event streams for every visible tab, not only the focused pane; hidden tabs retain lightweight status only. Returning A after A to B to A therefore need not wait for a transcript RPC to display retained history or receive new A events. Hydration previously deferred applying `get_state` and reasserting the subagent subscription until the complete transcript returned. These now settle independently; event-version guards still reject snapshots overtaken by fresh events.

Measurement, Bun on this workstation: 5,000 alternating committed user/assistant messages with repeated task/implementation prose, approximately 4 MB of text. Reconciling a structured clone took 2.15 ms; compact rows plus stable keys took 23.37 ms. Existing reconciliation replaced the array and first object even when text was unchanged. This does not demonstrate the reported 4 to 5 second production delay; no production timing validation was performed and no speculative transcript cache was added. Regression coverage observes retained A history and real streaming presentation from newly reduced A events while A's transcript remains unresolved.

Further root-path evidence: the sidecar `get_transcript_page` reconstructs the full display transcript before slicing every page; the GUI previously requested 256 rows per page, multiplying full-history construction by page count. The GUI now first requests the already-supported full `get_transcript` snapshot. An actual error response, including the sidecar's explicit transport-limit error, falls back to paged transport; no compatibility timeout or synthetic delay is introduced. A backend-source fixture using `buildSessionContext` with 5,000 linked alternating user/assistant entries measured 20 repeated builds at 32.73 ms versus one build at 0.84 ms, both yielding 5,000 complete messages. This isolates construction work, excludes serialization/network/DOM timing, and still does not prove the observed production delay's magnitude. The fixture ran against the available `/home/smokeyduck132/work/omp-sync` source checkout; the `/tmp/omp-src` checkout could not resolve its pi-tui dependency.

Protocol Auto preserves an omitted provider API when the sidecar permits it and materializes concrete APIs on explicit models. Saved-provider routes come from existing `get_available_models` metadata, including protocols already resolved by proxy discovery. The discovery RPC itself does not return `api`; merely adding a field to the GUI type cannot recover it. Without saved metadata, exact native `api.openai.com` uses Responses, exact `api.anthropic.com` uses Messages, and generic compatible endpoints use Chat Completions. A model called OpenAI or Claude through an arbitrary gateway does not prove that gateway accepts Responses or Messages. Every per-model explicit override wins; the effective Auto route is shown inline. Non-proxy discovery requires a concrete provider fallback under the sidecar's current schema.

Auto with a non-proxy automatic discovery type must save a concrete provider fallback because the sidecar only enables those discovery types when provider `api` exists. Reopening shows that concrete protocol rather than Auto; no unsupported configuration marker is written. Runtime-discovered models appear separately from configured rows, remain automatic when untouched, and only an edited discovered row becomes an explicit saved model override. Saved catalog protocol metadata is ignored after that row's effective endpoint changes.

## Sources and retrieval limits

1. Anthropic, [Claude Code tools reference: AskUserQuestion tool behavior](https://code.claude.com/docs/en/tools-reference#askuserquestion-tool-behavior). Retrieved the [official Markdown version](https://code.claude.com/docs/en/tools-reference.md). Also distinguishes `ExitPlanMode` as presenting a plan for approval.
2. CSS Working Group, [CSS Scroll Anchoring Module Level 1](https://drafts.csswg.org/css-scroll-anchoring-1/), Abstract, Introduction, and Description. Retrieved official Editor's Draft dated 2026-09-30. Used only as work-in-progress rationale for reading-position stability.
3. W3C WAI, [APG Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), Keyboard Interaction and WAI-ARIA Roles, States, and Properties. The rendered W3C URL returned HTTP 403; claims above were verified against the [official W3C-maintained source](https://github.com/w3c/aria-practices/blob/main/content/patterns/dialog-modal/dialog-modal-pattern.html), retrieved through its [raw endpoint](https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/dialog-modal/dialog-modal-pattern.html).

The published W3C scroll-anchoring URL and WCAG status-messages page also returned HTTP 403. No claims here rely on reading those inaccessible pages. This note records design rationale, not implementation verification or a claim of WCAG conformance.
