# Changelog

All notable changes to WISA STUDIO. Version numbers continue from the GUI this
build is based on, so `0.9.46` here is the first WISA STUDIO release and also
the point where the upstream GUI's history ends in this file. Release notes for
earlier versions belong to that project; see [NOTICE](NOTICE).

## [Unreleased]

- Reasoning starts at the model's declared default level when known. The composer only offers Off when the active route supports disabling reasoning.
- Workspace histories start expanded unless they were explicitly collapsed.
- New sessions use the last model successfully selected in the composer, even if that model is still being discovered when the session opens.
- Plan approval no longer reports failure when execution opens a fresh session. The inspector retains the approved plan, and the conversation shows a compact approval card instead of internal instructions.
- Auto-compaction now defaults to the model's reserve-based threshold. Explicit thresholds stay unchanged. Chat usage shows uncached input, cache reads, and cache writes separately.
- A slow startup RPC no longer permanently marks a live agent as failed. Studio recovers the session when Core answers again and uses lightweight idle health checks.
- Windows no longer boots a duplicate idle agent. Conversation indexing starts on search rather than launch, and long transcripts avoid rebuilding entrance state and coalesce resize-driven scrolling.
- Spaced out reasoning and execution disclosures in the conversation.
- The model picker shows the session model and cached choices without waiting for provider catalog discovery or forcing a refresh on every open.
- On Windows, switching between Work and Coding no longer reuses the wrong tool profile when a saved workspace path differs only in case or slash style. Coding tool profile settings identify the subagent tool as `task`.
- The sidebar keeps visited workspaces expanded when switching sessions, unless explicitly collapsed. Memory, Skills, Plugins, and Templates are pinned by default when no pin list exists; saved choices are preserved.
- Moved Wisa Capabilities, Providers & login, and Feedback from the sidebar to Settings → App & help, next to Keyboard shortcuts.
- Long filenames stay inside the Overview changes card. The Plugins catalog renders only rows near the viewport and preserves its scroll position when returning from a detail page.
- Installed plugins offer Upgrade only when the cached catalog advertises a newer release. Declarative plugins such as Cloudflare can open their settings without an npm manifest, and MCP servers that challenge for OAuth expose an authorization action directly on their card.
- The subagent dialog renders sent messages and replies as Markdown and lets you expand each long message independently.
- Subagent cards stay at their place in the conversation after finishing and fit their content within the transcript gutters. Matching background-task results appear inside the card's dialog instead of as duplicate transcript rows.
- The task list opens from a compact progress card at the top of its own session, including in split view.
- The Review panel has a larger toolbar control, a shortcut in each split session, and its own close button.
- WISA Browser waits for the originating agent connection before showing its window, with no sharing controls or confirmation. Its separate Chromium profile keeps cookies, site storage, and tab locations; query strings and fragments are not saved for tab restore.
- WISA Browser uses Electron 43 (Chromium 150) so agents can discover and call native WebMCP tools registered by secure pages, without affecting the user's Chrome profile.
- Keep Copy, Edit, and Fork in place below a user message when an execution group appears.
- The composer’s `/` menu localizes built-in command and subcommand descriptions. Hover a row marked `?` to read its full description without truncation.
- The orchestrator carries the conversation language into new subagent assignments, task card titles, and reports. Technical identifiers and quoted evidence stay unchanged.
- Composer questions fit a compact, adaptive card. Long questions scroll inside the card without hiding the reply buttons.
- Expanded execution groups keep the close control in view while scrolling. The long-paste preview is compact, matches the composer width, and wraps its actions on narrow panes.
- Review slides in from the right inside the current conversation, without covering the session headers or neighboring split pane. Its view switcher, close button, and Changes scope controls sit at the top; the repository summary and refresh sit below the file list.
- The tab context menu can close all inactive tabs while keeping the current conversation and both visible split panes.
- The new-agent tab button and shortcut follow the selected Code or Work mode. In Code mode, a Work tab opens the project picker instead of creating another Work session.

## [0.9.55] - 2026-11-24

Core source: `smokeyduck/oh-my-pi@4bf416b5dedfc7dde2730b51435d149fb4de1910` (Core 19.1.1).

### Added

- **SEO / GEO / AEO Audit** reviews the open website project for search visibility, AI citations, and answers. The report groups findings by impact and separates source checks from live-site checks; the model receives requested excerpts through scoped read tools, not shell or write access.
- **View older history** loads the messages before `/handoff` or `/compact` on demand, up to three boundaries and 48 messages per boundary. Older messages are not sent back to the model.
- **Side questions** can cite workspace text in compatible Agent tabs without changing files or the main transcript. Chat tabs stay tool-free.
- Both READMEs link to GitHub contributors and contribution routes. First-party telemetry is design only; this build does not collect it.

### Changed

- **Compaction strategy is per conversation.** New WISA sessions default to 20%; explicit Auto or percentage overrides survive reopening. Unsupported or rejected image inputs fall back to text without changing the saved transcript.
- The model picker opens on cached manufacturer groups and keeps usable rows while discovering models. Fast modes and reasoning controls only appear on supported routes.
- The composer, chat, task ribbon and plan inspector fit narrow panes. Long prompts collapse to a preview, child sessions start collapsed, and agent questions replace only their own composer.
- Work includes desktop control with existing approval rules; Coding and Work keep separate tool profiles. Agent Hub explains automatic role selection. Project memory and Auto-Learn are local by default without enabling automatic capture turns.
- Skills opens on Community. Plugin catalogs preload, support long paths on Windows and share the resource library with MCP, templates and project memory.
- Windows development launches respect explicit sidecars, show the window while loading, and restart cleanly after resetting settings. The native menu and renderer use the same startup language.
- The embedded browser was removed. Web links open in the system browser; an authenticated Chrome session requires an explicitly configured [external relay](README.en.md#use-your-own-chrome-session-optional).
- Công ty TNHH WinSell's contributions in two SEO Audit files use PolyForm Strict 1.0.0. The [license scope](https://github.com/smokeyduck/wisa-studio/blob/v0.9.55/LICENSE-SCOPE.md) preserves upstream and previously granted MIT rights.

## [0.9.54] - 2026-11-23

Core source: `smokeyduck/oh-my-pi@e256db57a616865c8768bdf83c649faa1c691de1` (Core 19.1.1), unchanged from the unpublished 0.9.53 candidate. This release includes its composer, hydration, scoped-store and startup-warning changes listed below.

### Fixed

- Russian and Vietnamese settings translations cover the bundled Core schema, including new enum choices, so the release locale gate checks the actual shipped settings.

### Release verification

- Packaged GUI gates require their own sidecar READY, settings IPC readback and persistence after restart, and a live renderer. Windows checks the installed NSIS payload and shortcuts plus the actual portable wrapper; macOS checks both native architectures in DMG and ZIP packages.
- Windows preflight passed on Windows Server 2025 for the unpacked app, the installed NSIS app with Unicode-path shortcuts, and the shipped portable wrapper. All three reached sidecar READY and retained a setting after restart.
- Windows requirements remain runtime-derived: Windows 10 x64 1809+ / Windows 11 and an x86-64-v2 CPU with SSE4.2. An actual Windows 10 host was unavailable; the reported Windows startup issue was not reproduced on Windows Server 2025 and is not claimed fixed.
- The failed 0.9.53 candidate remains unpublished; its tag is preserved rather than retagged.

## [0.9.53] - 2026-11-23

Core source: `smokeyduck/oh-my-pi@e256db57a616865c8768bdf83c649faa1c691de1`, including the mandatory upstream sync to Core 19.1.1 and the startup-warning fix. Wisa family routing, cached-roster restoration and explicit API overrides remain included.

### Fixed

- **Composer controls stay usable in narrow split panes.** Long model labels scale and then ellipsize at a readable minimum; lower-priority controls move into the existing overflow without displacing send/stop or active recording controls.
- **Tab accepts the active composer suggestion before changing reasoning.** Shift+Tab still toggles plan mode, and other screens keep normal Tab focus movement.
- **The startup "no model" diagnostic clears once a model selection completes.** Only that diagnostic clears: unrelated diagnostics remain, and auth or catalog availability alone does not clear it. An already-running older sidecar needs a safe restart before this takes effect.

### Changed

- **Session hydration shares in-flight work and avoids unnecessary transcript re-fetches.** Complete snapshots remain preferred, with paged loading as a size-bound fallback. Cold transcripts start at their pinned tail, and reasoning-only updates avoid rebuilding the answer wrapper. Isolated fixtures verify less repeated work; the reported live 5–10 second delay is not claimed fixed.
- Scoped session-store hooks use module-level bindings without changing per-pane subscription behavior.

## [0.9.52] - 2026-11-23

Core source: `smokeyduck/oh-my-pi@bf5f8a1eb86ccb737493358c1c716b7f62f973c6`, including the mandatory upstream sync and WISA isolation, routing, native-lock, and native-build variant-selection fixes.

### Changed

- **WISA runtime data is separated from `omp` CLI data.** Production uses `<appData>/wisa-studio` (userData) and `~/.wisa-studio/agent` (agent config, `models.yml`, MCP, skills, sessions); development uses `wisa-studio-dev` and `~/.wisa-studio-dev/agent`. The engine stays `omp` and still honours its `PI_*`/`OMP_*` variables. `WISA_PROFILE_ROOT` (absolute path, tests and automation only) relocates both data roots; `--user-data-dir` no longer has any effect. Nothing is migrated or deleted from `~/.omp`; saved API keys must be re-entered. Workspace source, Git and `AGENTS.md` are shared by both tools. Project settings are separate: `.omp/` for the `omp` CLI, `.wisa-studio/` for WISA, which does not read `.omp/`. Isolated release-sidecar probes verify project settings, settings persistence after restart, and unchanged legacy-profile sentinels.
- **WISA STUDIO has its own packaging identity (`org.wisa.studio`).** Linux executable and desktop id are `wisa-studio`; the OS URL scheme is `wisa-studio://`, while the engine's internal `omp://` URLs are unchanged. Data is not migrated automatically: saved API keys must be re-entered in the new profile, and old data stays where it is. Earlier WISA STUDIO builds share the product name, so the new build replaces their app file at the same path; the upstream `omp` builds install separately. Manual install is the recommended cutover; an earlier WISA install's auto-updater reads the same feed and may install this build in place, which then opens on the new data folder.
- **The 368px model picker opens directly on a manufacturer index.** Alphabetic sections are expanded initially, with larger bold headers, instead of hiding makers inside a Wisa connection group. The full reported gateway catalog is classified, including Codex, Qwen, and CapCut; unknown routes such as `auto` stay under their connection label. Manufacturer names are searchable, and explicit `vendor/name` namespaces retain their spelling. Rows show their actual connection and sign-in status; selection and keyboard navigation preserve the original provider/model pair.
- **The composer keeps its standard single-row toolbar, including split sessions.** Model names autoscale without wrapping; exceptionally long names ellipsize only at the legible minimum, with the full name available to screen readers and in the trigger tooltip. Each pane responds to its own width: control labels compact first, then workspace, advisor and run settings move into the existing overflow. Dictation remains available in the add menu, active recording controls stay visible, and send/stop keep their space. Queue indicators compact without losing their count or accessible description.
- **`/phone` opens the phone dialog from the composer.** The command works even when the backend does not advertise it.
- **Tab accepts the active composer suggestion; without a suggestion, it cycles reasoning.** Shift+Tab still toggles plan mode. Other screens keep normal Tab focus movement.
- **Wisa defaults use each model family's request protocol.** Claude uses Anthropic Messages, OpenAI models use Responses, and other models use Chat Completions. Discovery stays automatic; explicit provider/model APIs remain authoritative. Existing Wisa configurations keep their pinned API until you choose **Use API by model family** and save. The draft preview follows that policy instead of stale runtime metadata. Other gateways are unchanged. This requires a sidecar built with Wisa family routing; an already-running older sidecar must be restarted before the new routes take effect.
- **Changing Wisa's request API no longer discards its discovered model cache.** Existing rosters remain available through a failed refresh; family defaults and explicit overrides are applied when the roster is loaded. Discovery errors remain visible, without an incorrect instruction to sign in again.
- **Linux SQLite lock protection works when WISA is installed under a path containing spaces.** The native process-map parser retains the complete executable path, allowing the existing OFD-lock guard to activate instead of incorrectly reporting an unsupported Bun build.
- **macOS release checks bound GUI shutdown instead of hanging indefinitely.** Both DMG and ZIP packages still require native ARM64/Intel seal, sidecar, settings-persistence, isolation, and renderer checks before upload; teardown now escalates from TERM to KILL after a fixed grace period.
- **Switching sessions no longer rebuilds long transcripts page by page.** A complete transcript is requested in one call; paged loading remains the fallback when a response is too large. End-to-end timing has not been measured yet.
- **Unknown provider ids keep their configured spelling.** Only known names are re-cased; `wisa` displays as "Wisa".
- **Agent clarification questions appear inline in the session that asked them.** Answering keeps your place in the chat scroll.
- **Plans and approvals open in the right inspector, one per project.** The inspector reveals them automatically. While a plan streams, its content and intent drive whether the view follows new text.
- **Vibe, Goal, Loop, and starter setup use compact, responsive, centered modals.** They fit narrow windows and keep the same actions.
- **Discovered models are listed and editable separately from your saved list.** Only models you change are saved as overrides. Discovered models stay automatic.
- **The Agents dock lists only agents doing work.** Idle and parked agents are reusable history, not work, so they leave the dock whatever their age. Finished and failed rows of an earlier task call drop out with their batch-mates, and a row leaves as soon as its terminal frame arrives. The count covers only the listed working agents. History stays in the agent hub, the sidebar, and the drawer.
- **The conversation detail defaults to Compact.** A profile that has never chosen gets the folded view (reasoning and tool steps in one Process row); an explicit Full choice is kept as-is.
- **Agents and To-Do share a bounded dock instead of filling the chat.** Together they use at most 360px or 40% of the available transcript height, whichever is smaller. Lists and transcripts scroll inside each card beneath fixed headers; focused/full and graph views keep the same limit. Very short panes can scroll the dock itself to reach every header without moving the composer.
- Source and test details for these items are recorded in `docs/feedback-workflow-research.md`.

### Removed

- The Btw panel's Enter / Shift+Enter hint and its read-only footer line. The disclosure stays in the empty state.


## [0.9.51] - 2026-11-22

### Changed

- **A run of steps reads as one stack.** In full detail a reasoning-only step
  is its own row between two step chips, and the row carried `py-3` plus a
  24px footer reserved for its hover actions, so the chip above sat 19px away
  and the chip below 45px away while neighbouring chips sat about 15px apart.
  The row now tightens to its disclosure line and its copy/branch buttons float
  over that line's empty trailing edge instead of reserving height, and the
  chips themselves lose the padding their 26px touch target already covers:
  chip to reasoning and reasoning to chip both measure 4px, and a chip plus its
  reasoning row takes 66px instead of 118px. Hovering still never moves the
  transcript, and the reasoning row stays 2px at every density.

### Fixed

- **The word-completion options are translated in Chinese.** `zh` had no entry
  for the autocomplete engine options, so a Chinese Mac showed Off/Auto/N-gram/
  SmolLM/Apple and their descriptions in English. The Russian and Vietnamese
  tables also gain the `Apple` option: Core appends it to the schema on macOS
  only, so a Linux checkout never renders it, and the release check that reads
  the real schema from the sidecar failed the macOS build on both locales.

## [0.9.50] - 2026-11-21

### Added

- **macOS builds come from CI.** `.github/workflows/release-macos.yml` builds
  both architectures on a macOS runner, checks that each DMG bundles the
  sidecar for its own architecture, verifies the app seal, launches the packaged
  app to prove the renderer starts, and attaches both DMGs, both ZIPs and a
  `latest-mac.yml` listing both architectures. Releases before this one carried
  no macOS asset at all, so the updater had no feed to read.

### Changed

- **Mounted tools run as commands and still render as themselves.** The sidecar
  no longer routes a discoverable tool through `write xd://<tool>`: it mounts it
  as a bash command, and the transcript's one `bash` call carries the wrapped
  invocation in `details.toolCommands`. A call that ran exactly one executed
  command now renders through that tool's own card (a plan resolution as the
  resolve card, an MCP call as its MCP card) instead of as a shell run; a run
  that piped the command or bundled several keeps the shell card and lists each
  dispatched command under it with its own header, exit status and body. The
  older `write xd://<tool>` transport is still rendered: the bundled sidecar
  comes from a pinned monorepo commit, so a build whose binary predates the
  change keeps showing plan resolutions and MCP calls as the tools they are
  rather than as file writes.

## [0.9.49] - 2026-11-21

### Added

- **Phone access (`/phone`).** Every tab's collab room in one dialog: one QR code
  and link per session, host/stop per tab, and a `collab.autoStart` setting that
  hosts tabs as they open. Scanning a link puts the session on a phone browser ·
  the same relay and the same session as `/collab`, so the phone can send
  prompts, interrupt a run, and follow the transcript live, with progress and
  tool output streaming back. The GUI applies `collab.autoStart` itself because
  the sidecar only honors it in TUI mode, so an `rpc-ui` session would otherwise
  never open a room; the agent still owns the rooms, main only relays its
  `collab_start` / `collab_leave` / `get_collab_state` RPCs per tab.
- **Templates.** A page listing the web-template catalog (served by the
  `koda-templates-catalog` worker, cached, and bundled as a snapshot so it works
  offline). Installing downloads the entry's pinned tarball into the Work
  workspace and opens that folder as a session, so the agent takes it from
  there; each install seeds an `AGENTS.md` that names the upstream repo, its
  licence and the pinned commit, and asks for the Agentation overlay
  (https://www.agentation.com) to be wired in. The page runs nothing itself: no
  `npm install`, no dev server. Every card carries the template's own
  screenshot · the catalog's 65 thumbnails are bundled with the renderer, since
  the CSP allows no remote images and the page has to work offline · and the
  screenshot (or the title under it) opens the template's live demo in the
  built-in browser window.
- **Skills → Community.** The whole skills.sh catalogue, browsable offline. The
  three boards (all time, trending, hot) are cached on disk and listed with each
  skill's rank and install count; the first page of every board arrives at once
  and the rest pages in behind it at the index's rate limit, so the tab fills in
  while it is already usable. Filtering is local, a row can be previewed
  (its `SKILL.md` and file list) before installing, and installing writes the
  files into `~/.omp/agent/skills/<slug>` without running anything. Installs go
  through the index's download API, so what lands on disk is what the directory
  advertises.

### Changed

- **The model picker is grouped by vendor** with each provider's own mark, the
  composer label is formatted ("Claude Opus 5.5", not `claude-fable-5-2`), and
  the panel is taller so a long catalog stays readable. The intelligence tier
  gets a hover explanation instead of a bare `INT` pill.
- **A new session opens on the model you actually reach for.** The picker
  records each deliberate switch (`modelPicks`), and a session with no messages
  starts on the highest-count, most-recent pick that is still in the catalog.
  Resumed sessions keep the model they were saved with.
- **Work sessions start with desktop control on** (`/computer`), since the whole
  point of the lane is getting something done on this machine.
- **Skills opens in the right pane** like every other sidebar entry, instead of
  jumping into Settings → Skills. The session-search button is gone and the two
  remaining buttons split the row.
- **The Plugins page seeds more vendor catalogs on first run.** Alongside
  Anthropic's four, it now adds Cloudflare's, Sentry's, Hugging Face's,
  Microsoft's, OpenAI's Codex plugins and Supabase's agent skills · each
  verified to serve a `.claude-plugin/marketplace.json` with a `plugins` array on
  `main` · and keeps the community catalogs (wshobson, Trail of Bits,
  superpowers, pm-skills) last, since the earliest catalog wins when two list the
  same plugin.
- **Work and Code are told apart by more than a filter.** The lane follows the
  session that opens (a tab click, the picker, a deep link) instead of staying
  where it was, and the Work workspace gets its own `AGENTS.md`, an empty canvas
  and starter prompts for writing, planning and research rather than "understand
  this project", and a composer placeholder that matches. A saved lane is still
  the user's: only a change of session moves it.
- **Compaction threshold choices** are 80 / 60 / 40 / 20 (plus Auto), replacing
  70 / 80 / 90.
- **Compaction starts at 20% of the window by default.** The agent's own default
  is a reserve-based `-1` that the bar showed as "Auto"; the first launch of this
  build writes 20% to the global settings once (`compactionDefaults` pref) and
  never again, so a reader who picks Auto afterwards keeps it. "Keep recent"
  stays at its 20.0k default.
- **The strategy popover no longer recommends anything.** The "Recommended for
  this model" pill showed on every strategy and its only concrete effect was
  spending more tokens; the row, the reason paragraph and the warning dot are
  gone, and the popover names the vendor as a bold "Wisa" with the capability
  chips flush right.
- **The model picker's vendor groups read as index dividers:** a rule, the
  vendor mark and name, then a rule, so the collapsed list scans as sections
  instead of a run of rows.
- **Full detail no longer prints every command it ran.** A reply's shell and tool
  calls fold into one activity line per phase ("9 steps complete ›") in both
  details, so the transcript reads as the model's prose and reasoning with a
  collapsed summary of the work between paragraphs; Full and Compact now differ
  only in whether intermediate narration stays in the transcript or joins the
  summary. The transcript's line height and paragraph spacing are also tighter,
  so a long answer no longer reads as a series of separated blocks.
- **The thinking-level menu is read from the active model** and re-read when it
  opens: `off` and `auto` only appear for a model that reasons at all, the
  ladder is exactly what the sidecar reports, and a non-reasoning model gets an
  honest note instead of two dead rows.
- **The display defaults are the quiet ones.** A profile that has never chosen
  gets the emoji autocomplete off, agent reactions off, and plain session titles
  (`title.icons: boring`), seeded once alongside the dictation defaults · a
  choice made later, including turning any of them back on, is never rewritten.
  The conversation detail defaults to Full, and the drawer opens on Changes
  rather than Overview; both are preferences, so the first launch writes them
  and the setting then belongs to the reader.

### Fixed

- **The Templates page could not reach its catalog.** The worker the page fetched
  from (`wisa-templates-catalog`) answers 404 now, so every user saw "Không kết
  nối được máy chủ danh mục" and only ever got the snapshot bundled with the app.
  The catalog is served from `koda-templates-catalog` · same payload, same 65
  templates · and that is the address the app asks for.
- **A reopened session paints its transcript at once** instead of a spinner for
  the seconds the sidecar takes to boot: the last painted messages are kept per
  session file and shown until the fetch replaces them.
- **The model menu stays open when the Agentation overlay is activated.** The
  overlay put focus inside its shadow root, and every popover in the app treats
  a focus or pointer event from outside itself as a click-away · so Ctrl+Shift+F
  closed the very menu the user was about to annotate. Popovers now ignore
  events that originate in the overlay (`lib/dev-overlay.ts`). The earlier fix,
  which gave the overlay host a real box to cap its `z-index`, is reverted: that
  box became the containing block for the annotation markers (so numbered
  markers drew in the wrong place) and sank the overlay under the app's dialogs,
  which made those dialogs unselectable.
- **The composer says "Wisa", not "WISA STUDIO",** in its placeholder text, in
  all five locales.
- **Em dashes are gone from the interface.** Every user-facing string uses a
  plain hyphen where a separator or a placeholder was, and prose that read as a
  parenthetical now uses a comma; a character no keyboard produces should not be
  the app's punctuation.
- **The empty-canvas heading and subtitle are centred**, and the template editor
  no longer logs "Invalid task draft" on every open.
- **A compacted transcript clears the screen.** After `/compact` or `/handoff`
  the transcript showed a "Show N earlier messages" button and every todo
  snapshot archived before the compaction point, so the cleared history still
  filled the pane. The button is gone and only snapshots newer than the
  compaction point are drawn; earlier messages stay reachable through
  conversation search, which unfolds the history it finds.
- **Four Vietnamese strings were written without their diacritics**
  ("Am thanh thong bao", "Enter de hoi", "Mo trong cua so rieng"), which reads as
  neither language; the locale test now rejects a pure-ASCII value carrying
  Vietnamese function words.
- **Plural counters no longer render an English "s" in Vietnamese and Russian.**
  The `{plural}` suffix that English needs was left in the translated strings, so
  the reasoning footer read "21 dòngs" and "291 từs"; those locales now print the
  count and noun alone. Vietnamese and Thai also stop leaking the English word
  "Reasoning" into the reasoning toggle, which now reads "suy luận" and "การคิด".
- **The Templates page reads as a gallery.** The cards were too small and had no
  picture, and each carried an `MIT` pill and a "Featured" tag that said nothing
  the reader needed; the grid is wider, the screenshot fills the card, and the
  licence/attribution line moved to the page footer where it belongs.

## [0.9.48] - 2026-11-20

The bundled agent moves to Core 19 (omp 19.0.0), upstream's `2bf23c7`. The port
covers the RPC surface, the browser-window link model, paste collapsing, the
side-question prefix and session output files — plus one deliberate behaviour
change: **Handoff no longer starts a new session.**

### Changed

- **Handoff runs in the current session.** It used to summarize, then fork into
  a new session carrying the summary. Core 19 hands off in place in the
  background: the agent keeps answering while the summary is prepared, and the
  transcript you are reading is the one that continues. Stop cancels the
  maintenance only — it no longer aborts the live turn. This is not reversible
  once the sidecar pin moves: the old fork flow cannot come back.
- **Cache warming** is visible while it happens. The session info panel shows
  the phase, the provider and the model, and whether the refresh confirmed the
  cache, missed it, failed or was stopped; the transcript shows a status row
  with a Stop that cancels the refresh.
- **Usage** badges the subscription plan the provider reports (Claude plans
  included), so a plan-limited window is not mistaken for a broken account.
- **Daemon and job rows** follow Core 19's shape: queued jobs read as queued
  rather than running, and a daemon reports its label, exit code and whether it
  holds a persistent lease.
- The background-compaction state is tracked per tab, so a session doing
  context maintenance in the background shows a chip and is not treated as
  idle when you switch to it.

### Added

- **Link left-click opens in** — browser window (default) or your system
  browser; ⌘/Ctrl-click does the opposite. The built-in browser moved to its own
  window, and the wording now says so.
- **Collapse long pastes into markers** — pasted text over 10 lines or 1,000
  characters becomes a compact `[Paste #N]` marker instead of a wall of text.
  Turn it off to insert verbatim.
- **`?` at the start of a message** asks a side question: it reads the
  conversation without touching files or tools, and routes to the side-question
  panel of the tab you typed in.
- **Session output files** (`local://N.log`) are previewable. A path in that
  form opens in the file panel read-only; it never reveals or opens externally.
- File tabs are scoped per session: switching sessions drops tabs pointing at
  the previous session's output while keeping your project files.
- 23 more providers, with `singularityapi` split into `singularityapi-dev` and
  `singularityapi-tech`.
- Six new settings are translated in every locale: MCP built-in transforms and
  eval namespaces, the three cache-warming strategy knobs and cross-instance
  agent messages.

### Fixed

- The Vietnamese handoff strings still described the old fork-to-a-new-session
  flow; they now match what the dialog does.
- A missing Core 19 option string would have failed the locale gate in the
  release workflows; the Russian, Vietnamese and Chinese option tables carry it.

## [0.9.47] - 2026-11-20

### Changed

- Skills has its own sidebar entry instead of living only behind Settings, so
  turning one on no longer means finding the tab first. The Skills page gains
  **Enable all** / **Disable all** over the current filter, sending one toggle
  per skill that actually needs to change.
- The sidebar entry reads **Skills**, matching the sentence case of every
  neighbouring label; the shouting `SKILLS` form is gone from all five locales.
- The WISA ribbon replaces the π mark everywhere it was visible: the empty
  chat canvas, the transcript loading state, the app icon (dock, taskbar,
  window, installers), the menu-bar/tray mark and the favicon. One artwork
  file — `resources/icon-source.png` — is the only source; `bun run gen:icons`
  derives every size from it.
- The sidebar's **Code / Work** switch is back at the top, always visible:
  Code lists project sessions grouped by folder (plus folder-less chats under
  **Recent**), Work lists the default workspace's sessions. The lane decides
  what **New session** does — Code opens the folder picker in a centered
  dialog, Work starts an agent in the default workspace immediately — and it
  is remembered across restarts. Navigation entries can be pinned to the top
  of the sidebar.
- The built-in browser opens in its own window instead of a tab in the
  inspector, so it can sit beside the conversation at full size.
- Dictation is on for a new profile, with the speech model downloaded in the
  background while you work rather than on the first microphone press. The
  language setting now defaults to auto-detect: forcing English made Whisper
  transcribe Vietnamese speech as English, which is why the assistant replied
  in English to a Vietnamese question.
- The in-app brand reads **WISA STUDIO** in prose (menus, dialogs, tray
  tooltip, onboarding, settings copy) instead of shouting `WISA STUDIO`.
  `productName`, the bundle name, the Windows shortcut and every artifact name
  keep the full-caps form, so installed paths and the update feed are unchanged.
- Spoken replies in Vietnamese use a neural voice (Piper, downloaded once on
  first use) instead of `espeak-ng`, the formant synthesizer that pronounced
  the words correctly and sounded robotic. English keeps the bundled local
  voice; every other language keeps its platform engine, and a failed fetch
  falls back to it too.

### Fixed

- Signing in from the onboarding dialog opened the API-key form instead of the
  browser hand-off, so the flow it advertised could never complete.
- A Linux install never took over `omp://`, so the browser hand-off kept
  reaching an older omp build and sign-in silently did nothing. Electron asks
  `xdg-settings` for `<app name>.desktop`, which here was `WISA STUDIO.desktop`
  — a name no package installs, and one `xdg-settings` cannot even write
  because its space breaks the awk lookup. The app now registers under the id
  electron-builder actually installs (`omp-gui.desktop`), writes that entry for
  an AppImage whose copy lives inside the squashfs, and falls back to
  `xdg-mime` when the AppImage path itself contains a space.
- The first click on a sign-in link started the app and dropped the code: on
  Windows and Linux the launching URL arrives in the app's own argv, but only
  the macOS `open-url` event and the already-running `second-instance` event
  were read. A cold start now reads its own arguments, so signing in works
  whether or not the app was already open.
- A new profile listed 97 providers and no WISA gateway. The agent lists a
  provider only once it holds a credential and at least one model, so the
  freshly seeded `wisa` entry stayed invisible and the sign-in card — which
  required the provider to already be listed — never appeared. The card now
  reads the `models.yml` entry too, so the gateway this build ships for is
  reachable from a fresh install.

- The speed control disappears for a model whose request carries no service
  tier (a gateway model such as the WISA provider), instead of offering a knob
  that changed nothing.

### Added

- Speaking replies out loud: English through the sidecar's local TTS,
  Vietnamese and other languages through the OS voice, with automatic
  detection of which one the text is in.
- A notification chime plays with a desktop notification, since many Linux
  notification daemons have no sound theme configured and a finished turn was
  silent.
- The side-question panel says what a `/btw` answer can and cannot do: it reads
  the conversation, not files or tools.
- `bun run gen:icons` now writes the macOS `.icns` itself instead of shelling
  out to `iconutil`, so the icons are reproducible on Linux and Windows too.
- A dev-only visual feedback overlay (Agentation) behind the build-time `DEV`
  flag; it never enters a production bundle.

## [0.9.46] - 2026-11-19

First WISA STUDIO release. Display-layer rebrand of oh-my-pi's desktop GUI; the
agent, `omp://` deep links, `~/.omp` configuration and the `window.omp` bridge
keep the omp identity.

### Added

- Vietnamese interface: every UI key, native menu, tray label, setting
  label/description and enum option is translated, with a language-centre entry
  (`Tiếng Việt`) and zone-aware detection for machines whose browser locale is
  English (`Asia/Ho_Chi_Minh` → Vietnamese).
- WISA gateway provider (`askwisa.com`) seeded once per profile and offered
  first in first-run setup; models are discovered from `/v1/models` after the
  key is stored.
- `check:locale` gate: the Russian and Vietnamese settings tables are verified
  against the sidecar's full schema (635 settings and their options) in the
  release workflows, so a Core update cannot silently ship untranslated
  settings.
- Vietnamese documentation: installation guide, WISA provider guide and FAQ
  under [`docs/vi/`](docs/vi/).
- `llms.txt`, `robots.txt` and `sitemap.xml` for the landing page, plus
  `SoftwareApplication` and `FAQPage` structured data.

### Changed

- The app presents itself as WISA STUDIO everywhere it is visible — window
  title, dock label, tray tooltip, native menus, onboarding and artifact names
  (`wisa-studio-<version>-<arch>.dmg`, `-setup.exe`, `_<arch>.deb`).
- Release, update-check, feedback and in-app documentation links point at
  `smokeyduck/wisa-studio`.
- `bun run dev` works on a clean checkout: it probes for a sidecar (built
  `resources/omp`, then the one inside an installed bundle, then a global
  `omp` CLI) and runs isolated — `wisa-studio-dev` userData, `~/.omp-dev`
  profile, no protocol registration, no global shortcut.

### Fixed

- `check-schema-locale` no longer hangs when the sidecar cannot be spawned, and
  resolves its own sidecar instead of requiring a path.
- `scripts/test-locale.ts` pins the test time zone, so component tests no
  longer render Vietnamese/Thai UI on hosts whose IANA zone maps to a shipped
  language.
