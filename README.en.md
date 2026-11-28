# Wisa

**Desktop application based on oh-my-pi (MIT), developed by WISA.**

Vietnamese-first desktop GUI for oh-my-pi (omp) — an install-and-go coding agent with parallel sessions in one window and a pre-wired WISA gateway so a single API key reaches every model. Electron, for macOS, Windows and Linux.

<img src="docs/screenshots/en/01-conversation.png" alt="WISA STUDIO with a conversation and the Overview tab" width="100%">

## Download

| Platform | Package |
|---|---|
| macOS Apple Silicon | `wisa-studio-1.1.8-arm64.dmg` — [release page](https://github.com/smokeyduck/wisa-studio/releases/tag/v1.1.8) |
| macOS Intel | `wisa-studio-1.1.8-x64.dmg` — [release page](https://github.com/smokeyduck/wisa-studio/releases/tag/v1.1.8) |
| Windows x64 | [`wisa-studio-1.1.8-setup.exe`](https://github.com/smokeyduck/wisa-studio/releases/download/v1.1.8/wisa-studio-1.1.8-setup.exe) |
| Linux x64 | [`wisa-studio-1.1.8.AppImage`](https://github.com/smokeyduck/wisa-studio/releases/download/v1.1.8/wisa-studio-1.1.8.AppImage) |

[All releases](https://github.com/smokeyduck/wisa-studio/releases) · [Install guide (vi)](docs/vi/cai-dat.md)

macOS builds are ad-hoc signed (not notarized) and Windows builds are unsigned, so the first launch may need confirmation: macOS → right-click → **Open**, or System Settings → Privacy & Security → **Open Anyway**; Windows → **More info** → **Run anyway**.

**Windows requirements:** Windows 10 x64 version 1809 (build 17763) or later, including Windows 11, and an x86-64-v2 CPU with SSE4.2. This minimum comes from the Electron, Bun and native-addon runtime requirements; it is not a claim that this release was tested on a Windows 10 machine.

### What's new in 1.1.8

Create HTML/CSS/JavaScript Notch mini-apps after explicitly enabling `/customize-notch`; apps run in an isolated sandbox with trusted permission prompts and revision restore. Native Notch helpers exit with Wisa, including force-quit. This release also adds Claude/ChatGPT imports, full conversation history, wallpapers, a first-use tour and Liquid Glass controls. Actions reuse verified build inputs and avoid an extra installer transfer while retaining every runtime/updater gate. See the [changelog](CHANGELOG.md#118---2026-11-29).

## Get an API key

WISA STUDIO seeds a `wisa` provider pointing at `https://api.askwisa.com/v1`. One key covers every model the gateway serves, and the model list is fetched automatically once the key is saved.

**[Get an API key at askwisa.com →](https://askwisa.com/?utm_source=github&utm_medium=readme)**

Optional: Anthropic, OpenAI, DeepSeek, OpenRouter, Gemini and anything else the upstream agent supports still work. See the [provider guide (vi)](docs/vi/nha-cung-cap-wisa.md) and the [FAQ (vi)](docs/vi/faq.md).

<div align="center">

[![Release](https://img.shields.io/github/v/release/smokeyduck/wisa-studio?style=flat&colorA=222222&colorB=3FB950)](https://github.com/smokeyduck/wisa-studio/releases)
[![Downloads](https://img.shields.io/endpoint?url=https%3A%2F%2Fsmokeyduck.github.io%2Fwisa-studio%2Fdownloads.json&style=flat&cacheSeconds=3600)](https://github.com/smokeyduck/wisa-studio/releases)
[![License scope](https://img.shields.io/badge/license-scope-BE185D?style=flat)](./LICENSE-SCOPE.md)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-222222?style=flat)
![Electron](https://img.shields.io/badge/Electron-35-47848F?style=flat&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white)

[English](README.en.md) · [Tiếng Việt](README.md)

</div>

---

## How WISA STUDIO differs from omp

The oh-my-pi agent reads files, runs commands, edits code and calls tools, MCP and Skills. WISA STUDIO bundles the agent from the WISA fork commit pinned in [`sidecar-source.json`](sidecar-source.json); the fork includes changes for the app. The desktop app also adds:

- **Name and identity:** Wisa in window titles, the tray and permission prompts; release artifact names remain `wisa-studio-*`.
- **Vietnamese by default:** five interface languages (Tiếng Việt, English, 中文, Русский, ไทย); this build opens in Vietnamese.
- **WISA gateway:** the `wisa` provider is pre-seeded and offered first in onboarding.
- **Releases:** published from this repository.

WISA STUDIO keeps its own agent data under `~/.wisa-studio/agent` (not `~/.omp`), so sessions and settings are not shared with the omp CLI.

## What the interface does

- **Parallel sessions:** each tab is its own agent process; background work keeps running while you switch, and restored tabs start only when opened.
- **Conversation history:** Core's full display transcript on the current branch, including messages before compaction/handoff. Model context maintenance does not truncate the visible session history.
- **Split panes and multiple windows:** two sessions side by side or stacked, a draggable divider, layout restored across restarts.
- **Workspace:** directory tree, file tabs, edit with `⌘S`, Markdown source/preview, diffs and logs.
- **Scheduled tasks:** cron or interval, running in the background with run history, reports and a verification step.
- **Session overview:** context by category, cost, cache, speed, running subagents and MCP servers.
- **MCP, Skills, plugins, hooks:** managed from Settings instead of hand-edited JSON.
- **Jev / TypeSafe:** connect TypeSafe or enter its API key in **Model Roles**, choose a native Judge from the catalog, then click **Enable Jev routing**. Core routes unpinned subagent tasks among approved chat models without changing chat/Default assignments. Enabling shares a short assignment excerpt with TypeSafe, not conversation history or shared context. Turning routing off preserves the key and Judge role.
- **SSH hosts, custom themes, command palette, voice mode, relay collaboration.**
- **Work mode:** read, search, track tasks and control the desktop by default, without shell or general-purpose eval. The global **Computer** setting and input approval still apply.

Known limits: separate tabs are not an OS security boundary; a split holds two panes, not an unlimited grid; approvals and security scans are not a sandbox. Model requests still go to the provider you configure.

### Wallpapers and the first-use tour

Use **Wallpaper** at the lower-left of the composer to select a local image or muted looping video spanning the transcript and composer. Files are copied into the app profile, not uploaded to a provider. Pause or reset the background; hidden conversations pause playback and Reduced Motion disables autoplay by default.

After a provider and model are verified, Wisa offers a 24-step tour of the real interface. The tour navigates without sending messages, changing models or enabling features, and restores the prior page when closed. Reopen it with `/tutorial` or the command palette. The display name is now **Wisa** (`Wisa.app` / `Wisa.exe`); app IDs, profile locations, deep links, sidecar names and release filenames are unchanged.

### Notch and background lifecycle

**Settings → Notch** controls appearance, behavior and session/clock/note/activity widgets, with explicit save/discard and versioned preset import/export. macOS uses the MIT-derived native [Notch Island](https://github.com/MANISH007700/notch-island) panel at commit `6217ed2360ad4c0887abc725f9cd9e6e2ea02427`; Windows/Linux use an isolated floating Electron panel. Presets do not carry secrets, installed hooks or permissions.

Run **`/customize-notch`** in an Agent session to load `notch_app` and its SDK instructions. Create arbitrary HTML/CSS/JavaScript mini-apps, save revisions, preview and request activation. Wisa confirms the exact app/revision before applying it. `/customize-notch off`, a session switch or sidecar restart revokes the tool without deleting saved apps. **Settings → Notch → Mini-apps** manages preview, apply/restore and stopping the app; the applied revision returns on restart.

Mini-apps have no direct Node/Electron, filesystem, network or system access. The SDK provides private state storage; privileged session, clipboard, notification, URL and system-program requests require confirmation for the exact action. Permissions never travel with saved HTML or revisions. Do not embed secrets in shared HTML.

External agent connections are opt-in: Claude Code/Codex permission hooks support request-bound allow/deny; Cursor, Gemini CLI, Copilot and OpenCode send activity/notifications without taking over approval. Wisa backs up and merges configuration without granting trust. Failed, cancelled or timed-out requests fall back to the original agent prompt.

Closing a window keeps tabs, drafts and sidecars in the background; restore via Dock/tray/shortcuts. Explicit Quit retains active-work and unsaved-file confirmation. Native helpers exit when their owning Wisa process ends, including force-quit. On macOS, building the universal helper requires Xcode Command Line Tools; sources and MIT notices are in `native/notch-island/`, never committed binaries.

### Split Agent sessions

Open two Agent tabs in the same workspace, right-click a tab, and choose **Split right** or **Split below**. In a narrow window the panes stack without changing the saved layout. Ask either agent to check its peer or leave a handoff with `workspace_peer`. A handoff stays in memory and is read only when the recipient calls `receive`; it does not start or interrupt a turn. Unlinking the pair, switching sessions, or closing a tab discards unread messages.

The right sidebar overlays the selected pane. **Shift+Tab** changes Plan mode in the composer without opening the sidebar. **Terminal** in the sidebar launches the operating system terminal at the selected tab's workspace. Interactive commands run by the agent still use Studio's terminal panel.

### Work and Coding tools

Coding uses the Core tool configuration and `edit.mode` / `edit.modelVariants`. Studio no longer reads the old GUI Tool Profiles preferences. Work uses a smaller tool set with `computer` on by default; `computer.enabled: false`, tool approvals and `--no-tools` still apply.

`task.judgeRouting` is off by default. Turning it on allows the configured native Judge to see a bounded excerpt of each unpinned subagent assignment, not the parent transcript. It can only choose an already approved route. Explicit pins and the normal Core fallback still apply.

### Project Knowledge in Obsidian

In Memory → Project Knowledge, choose an existing Obsidian Vault after enabling `vault.enabled`. The selected project stores reviewed notes and lessons as Markdown in the vault, without writing a duplicate to local Memory. If the vault is disabled or unavailable, Studio reports it instead of silently changing sources. Automatic Memory remains separate; selecting a vault does not copy or delete past data.

### Vietnamese dictation and read-aloud

Studio defaults to local Whisper Small with Vietnamese for dictation unless you configure a model or language. Cloud dictation requires explicitly selecting a cloud model; a local error does not send the recording to a cloud service.

In Settings → Providers → Services, choose the Vietnamese voice and use **Preview** to hear it. VAIS-1000 is a Northern Vietnamese voice that may need a one-time download; text is synthesized locally. The system option uses an installed Vietnamese voice or reports that one is missing. Read-aloud plays new messages in order, can be stopped for the current run, and does not replay loaded history.

### Import Claude and ChatGPT data

Open the import dialog, choose an official export, and select the downloaded ZIP or JSON. Preview conversations, filter, select individual chats or all chats, then import and continue them in WISA. Claude Code and Codex remain separate local-session sources, not history from the Claude or ChatGPT apps.

- Claude: **Settings → Privacy → Export data**; see the [official instructions](https://support.claude.com/en/articles/9450526-export-your-claude-data).
- ChatGPT: **Settings → Data controls → Export data**; see the [official instructions](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data).
- Import runs locally without source-account cookies or sign-in. WISA leaves the source unchanged, keeps a private copy in its agent profile, and provides a reference workspace for projects, documents, files and metadata present in the export. Source settings, memories and instructions never become active WISA configuration or permissions automatically.
- This is not full account migration: Anthropic excludes original uploaded files from Claude exports. A standalone JSON file does not include its sibling files either. Data that cannot become chat is retained as reference with reported limitations; missing files cannot be recovered. Continuing a conversation still sends model requests to your configured provider.

### Browse with Browser Use

Enter a request in the Agent tab, for example: “Use `browser_use` to open https://example.com and tell me the page title.” The agent calls OMP’s `browser_use` tool; there is no longer a toolbar globe or an embedded WISA Browser window.

Studio ships the official [Browser Use](https://github.com/browser-use/browser-use) Python package and local Chromium. When the agent starts browsing, Chromium opens a separate window where you can click, type, and switch tabs yourself. Each browsing session uses a temporary profile, not a cloud browser or your personal Chrome profile. Studio neither imports nor deletes the old WISA Browser’s data.

Studio checks GitHub for the latest stable release at startup and each day it remains open. After the install and a Chromium check succeed, new agent sessions use the upgrade; existing sessions keep their version. You do not need Python or a Chromium download on first launch. Offline or failed updates leave the working version in place.

For offline or deterministic runs, start Studio with `WISA_BROWSER_USE_AUTO_UPDATE=0` to disable Browser Use updates without disabling browsing.

## Install

Download the package above, open it, paste an API key (or pick another provider) and you are working. No Node, Bun or omp CLI install is required — the agent ships inside the app.

Per-platform details, resetting data and first-launch troubleshooting: [docs/vi/cai-dat.md](docs/vi/cai-dat.md).

## Data locations and coexistence

WISA STUDIO keeps its own data and does not read or write `~/.omp`. Nothing is migrated automatically from earlier builds.

| Data | macOS | Windows | Linux |
|---|---|---|---|
| App settings, tabs, scheduler, conversation index, `logs/gui-runtime.jsonl` | `~/Library/Application Support/wisa-studio` | `%APPDATA%\wisa-studio` | `~/.config/wisa-studio` |
| Agent config: `models.yml`, MCP, skills, sessions | `~/.wisa-studio/agent` | `%USERPROFILE%\.wisa-studio\agent` | `~/.wisa-studio/agent` |
| Agent logs | `~/.wisa-studio/logs` | `%USERPROFILE%\.wisa-studio\logs` | `~/.wisa-studio/logs` |
| Project settings (inside a workspace) | `.wisa-studio/` | `.wisa-studio\` | `.wisa-studio/` |

Development runs (`bun run dev`) use `wisa-studio-dev` and `~/.wisa-studio-dev/agent`. The agent's temp folder is `~/.wisa-studio-dev/tmp`.

Tests and automation may set `WISA_PROFILE_ROOT` (an absolute path) to move all of the above under `<root>/appData/wisa-studio` and `<root>/.wisa-studio/agent`. This variable exists for tests; it is not a way to pick an arbitrary data directory.

Earlier builds stored data in `…/omp` (userData) and `~/.omp` (agent). WISA STUDIO does not copy, move, or delete that data. Saved API keys must be re-entered in the new app.

Coexistence:

- Against the upstream `omp` builds (`productName: omp`, `appId: sh.omp.gui`) the new build installs separately: different bundle or install folder, different identity.
- Against earlier WISA STUDIO builds (`appId: sh.omp.gui`), the display name is now Wisa (`Wisa.app` on macOS). The old app and data are not removed automatically; verify Wisa opens the expected profile before removing the older application file. Do not delete its data folders.
- An earlier WISA STUDIO install reads the same release feed, so its auto-updater may install the new build in place. That update does not carry data over: the app then opens on the new data folder, and keys and macOS permissions tied to the old identity do not follow it.
- Upstream `nornzach/oh-my-pi-gui` installs read their own feed and do not receive WISA releases.
- WISA STUDIO is not a sandbox. It runs the agent with your login-shell environment, PATH, Git and SSH setup, and the workspace folders you open. These are shared with other programs on purpose.

## Development

This is the GUI repo. The agent in the OMP Core monorepo is compiled into a sidecar. Run these commands from `packages/gui` in the monorepo; for a standalone GUI checkout, set `WISA_CORE_ROOT` to the absolute path to the Core checkout when building the sidecar or running `scripts/sync-upstream.sh`:

```bash
bun install
bun run build:omp          # → resources/omp (arm64)
bun run build:omp:x64      # → resources/omp.x64 (Intel)
bun run build:omp:win      # → resources/omp.exe
bun run build              # → out/
bun run dev                # HMR; uses resources/omp[.exe], OMP_BUNDLED_OMP, or a source build
bun run dev --stop         # from another terminal: stops the dev GUI, Vite, and sidecars
```

Checks before a pull request:

```bash
bunx vitest run
bun run check:types
bunx biome check .
bun run check:locale       # ru + vi cover every setting the sidecar ships
bun run build
```

`bun run dev` is isolated from the installed app: `wisa-studio-dev` userData, `~/.wisa-studio-dev/agent` agent profile, no OS URL-scheme registration, no global shortcut.

`bun run dev --stop` stops only the processes started by `bun run dev` for the current checkout and profile, not the installed app. If you set `WISA_PROFILE_ROOT` at startup, use the same value when stopping. The command interrupts work running in that dev session.

Development-only overrides, unpackaged runs only: `OMP_BUNDLED_OMP=<path>` runs that binary instead of `resources/omp`, and `OMP_SIDECAR=source` runs the coding-agent source from a monorepo checkout through bun. Packaged builds ignore both. The app does not check that an override honors `PI_CONFIG_SOURCES` / `PI_PROJECT_CONFIG_DIR` or the isolated profile; using one is your responsibility.

## Packaging and releases

Run `bun run build:browser-use` on the target OS and architecture before packaging or testing browser actions in development. This stages the official Python package and a pinned, open-source Chromium build in `resources/browser-use`.

```bash
bun run package:mac:arm64 -- --publish never   # dist/wisa-studio-<ver>-arm64.dmg
bun run package:mac:x64   -- --publish never   # dist/wisa-studio-<ver>-x64.dmg
bun run package:win       -- --publish never   # NSIS + portable
bun run package:linux     -- --publish never   # AppImage + deb
```

The full release runbook, including sidecar build order and artifact checks, is in [AGENTS.md](AGENTS.md) — read it before cutting a build. The packaging identity and cutover steps are in [docs/vi/appid-va-cap-nhat.md](docs/vi/appid-va-cap-nhat.md).

Actions reuse dependency downloads and host-specific Browser Use payloads keyed by the build recipe and verified again before packaging. Native addons remain pinned to the exact Core commit; source rebuilds let Cargo revalidate cached intermediates. macOS proves DMG/ZIP packages on each build host before transferring artifacts; Windows uses 7z level 5 to reduce compression CPU. All runtime and updater gates remain mandatory; installers are never restored from cache.

## License and credits

Starting with v0.9.55, WinSell's contributions in two SEO Audit files are under PolyForm Strict 1.0.0; see the [license scope](LICENSE-SCOPE.md). The [MIT license](LICENSE), original copyright notices, and rights already granted under MIT remain intact.

- oh-my-pi (upstream): https://github.com/can1357/oh-my-pi
- The GUI layer this build is based on (MIT), with its original copyright lines: see [NOTICE](NOTICE).
- WISA STUDIO contributors: [GitHub contribution history](https://github.com/smokeyduck/wisa-studio/graphs/contributors). To help, [report a bug or suggest an improvement](https://github.com/smokeyduck/wisa-studio/issues), or [open a pull request](https://github.com/smokeyduck/wisa-studio/pulls).

WISA STUDIO is not affiliated with, endorsed by or sponsored by Anthropic, OpenAI, Google or any model provider. See [NOTICE](NOTICE).
