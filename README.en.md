# WISA STUDIO

**Desktop application based on oh-my-pi (MIT), developed by WISA.**

Vietnamese-first desktop GUI for oh-my-pi (omp) — an install-and-go coding agent with parallel sessions in one window and a pre-wired WISA gateway so a single API key reaches every model. Electron, for macOS, Windows and Linux.

<img src="docs/screenshots/en/01-conversation.png" alt="WISA STUDIO with a conversation and the Overview tab" width="100%">

## Download

| Platform | Package |
|---|---|
| macOS Apple Silicon | `wisa-studio-1.0.1-arm64.dmg` — [release page](https://github.com/smokeyduck/wisa-studio/releases/tag/v1.0.1) |
| macOS Intel | `wisa-studio-1.0.1-x64.dmg` — [release page](https://github.com/smokeyduck/wisa-studio/releases/tag/v1.0.1) |
| Windows x64 | [`wisa-studio-1.0.1-setup.exe`](https://github.com/smokeyduck/wisa-studio/releases/download/v1.0.1/wisa-studio-1.0.1-setup.exe) |
| Linux x64 | [`wisa-studio-1.0.1.AppImage`](https://github.com/smokeyduck/wisa-studio/releases/download/v1.0.1/wisa-studio-1.0.1.AppImage) |

[All releases](https://github.com/smokeyduck/wisa-studio/releases) · [Install guide (vi)](docs/vi/cai-dat.md)

macOS builds are ad-hoc signed (not notarized) and Windows builds are unsigned, so the first launch may need confirmation: macOS → right-click → **Open**, or System Settings → Privacy & Security → **Open Anyway**; Windows → **More info** → **Run anyway**.

**Windows requirements:** Windows 10 x64 version 1809 (build 17763) or later, including Windows 11, and an x86-64-v2 CPU with SSE4.2. This minimum comes from the Electron, Bun and native-addon runtime requirements; it is not a claim that this release was tested on a Windows 10 machine.

### What's new in 1.0.1

This release ships Core 19.2.1. Switching sessions no longer reorders projects in the left sidebar; drag and drop still sets their order. Queued input stays visible until it is recorded in the conversation. See the [changelog](CHANGELOG.md#101---2026-11-26).

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

- **Name and identity:** WISA STUDIO in window titles, the tray, macOS permission prompts and installer artifact names.
- **Vietnamese by default:** five interface languages (Tiếng Việt, English, 中文, Русский, ไทย); this build opens in Vietnamese.
- **WISA gateway:** the `wisa` provider is pre-seeded and offered first in onboarding.
- **Releases:** published from this repository.

WISA STUDIO keeps its own agent data under `~/.wisa-studio/agent` (not `~/.omp`), so sessions and settings are not shared with the omp CLI.

## What the interface does

- **Parallel sessions:** each tab is its own agent process; background work keeps running while you switch, and restored tabs start only when opened.
- **Split panes and multiple windows:** two sessions side by side or stacked, a draggable divider, layout restored across restarts.
- **Workspace:** directory tree, file tabs, edit with `⌘S`, Markdown source/preview, diffs and logs.
- **Scheduled tasks:** cron or interval, running in the background with run history, reports and a verification step.
- **Session overview:** context by category, cost, cache, speed, running subagents and MCP servers.
- **MCP, Skills, plugins, hooks:** managed from Settings instead of hand-edited JSON.
- **SSH hosts, custom themes, command palette, voice mode, relay collaboration.**
- **Work mode:** read, search, track tasks and control the desktop by default, without shell or general-purpose eval. The global **Computer** setting and input approval still apply.

Known limits: separate tabs are not an OS security boundary; a split holds two panes, not an unlimited grid; approvals and security scans are not a sandbox. Model requests still go to the provider you configure.

### Split Agent sessions (unreleased)

Open two Agent tabs in the same workspace, right-click a tab, and choose **Split right** or **Split below**. In a narrow window the panes stack without changing the saved layout. Ask either agent to check its peer or leave a handoff with `workspace_peer`. A handoff stays in memory and is read only when the recipient calls `receive`; it does not start or interrupt a turn. Unlinking the pair, switching sessions, or closing a tab discards unread messages.

The right sidebar overlays the selected pane. **Shift+Tab** changes Plan mode in the composer without opening the sidebar. **Terminal** in the sidebar launches the operating system terminal at the selected tab's workspace. Interactive commands run by the agent still use Studio's terminal panel.

### Work and Coding tools (unreleased)

Coding uses the Core tool configuration and `edit.mode` / `edit.modelVariants`. Studio no longer reads the old GUI Tool Profiles preferences. Work uses a smaller tool set with `computer` on by default; `computer.enabled: false`, tool approvals and `--no-tools` still apply.

`task.judgeRouting` is off by default. Turning it on allows the configured native Judge to see a bounded excerpt of each unpinned subagent assignment, not the parent transcript. It can only choose an already approved route. Explicit pins and the normal Core fallback still apply.

### Project Knowledge in Obsidian (unreleased)

In Memory → Project Knowledge, choose an existing Obsidian Vault after enabling `vault.enabled`. The selected project stores reviewed notes and lessons as Markdown in the vault, without writing a duplicate to local Memory. If the vault is disabled or unavailable, Studio reports it instead of silently changing sources. Automatic Memory remains separate; selecting a vault does not copy or delete past data.

### Vietnamese dictation and read-aloud (unreleased)

Studio defaults to local Whisper Small with Vietnamese for dictation unless you configure a model or language. Cloud dictation requires explicitly selecting a cloud model; a local error does not send the recording to a cloud service.

In Settings → Providers → Services, choose the Vietnamese voice and use **Preview** to hear it. VAIS-1000 is a Northern Vietnamese voice that may need a one-time download; text is synthesized locally. The system option uses an installed Vietnamese voice or reports that one is missing. Read-aloud plays new messages in order, can be stopped for the current run, and does not replay loaded history.

### Browse with Browser Use (unreleased)

Enter a request in the Agent tab, for example: “Use `browser_use` to open https://example.com and tell me the page title.” The agent calls OMP’s `browser_use` tool; there is no longer a toolbar globe or an embedded WISA Browser window.

Studio ships the official [Browser Use](https://github.com/browser-use/browser-use) Python package (initially 1.0.8) and local Chromium. Each browsing session uses a separate temporary profile. Browser Use does not require sign-in, use a cloud browser, or read your personal Chrome profile. Studio neither imports nor deletes the old WISA Browser’s history, cookies, or site data.

Studio checks GitHub for the latest stable release at startup and each day it remains open. After the install and a Chromium check succeed, new agent sessions use the upgrade; existing sessions keep their version. You do not need Python or a Chromium download on first launch. Offline or failed updates leave the working version in place.

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
- Against earlier WISA STUDIO builds (`appId: sh.omp.gui`, `productName: WISA STUDIO`) the new build has the same product name, so it lands on the same `WISA STUDIO.app` path (macOS) or install folder (Windows) and replaces the old app file. The old data folders are left untouched; use a different path only if you need both running.
- An earlier WISA STUDIO install reads the same release feed, so its auto-updater may install the new build in place. That update does not carry data over: the app then opens on the new data folder, and keys and macOS permissions tied to the old identity do not follow it.
- Upstream `nornzach/oh-my-pi-gui` installs read their own feed and do not receive WISA releases.
- WISA STUDIO is not a sandbox. It runs the agent with your login-shell environment, PATH, Git and SSH setup, and the workspace folders you open. These are shared with other programs on purpose.

## Development

This repository is the GUI repo. The agent lives in the upstream monorepo and is compiled into a sidecar; to build the sidecar from source, clone the monorepo as a sibling directory and run:

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

## License and credits

Starting with v0.9.55, WinSell's contributions in two SEO Audit files are under PolyForm Strict 1.0.0; see the [license scope](LICENSE-SCOPE.md). The [MIT license](LICENSE), original copyright notices, and rights already granted under MIT remain intact.

- oh-my-pi (upstream): https://github.com/can1357/oh-my-pi
- The GUI layer this build is based on (MIT), with its original copyright lines: see [NOTICE](NOTICE).
- WISA STUDIO contributors: [GitHub contribution history](https://github.com/smokeyduck/wisa-studio/graphs/contributors). To help, [report a bug or suggest an improvement](https://github.com/smokeyduck/wisa-studio/issues), or [open a pull request](https://github.com/smokeyduck/wisa-studio/pulls).

WISA STUDIO is not affiliated with, endorsed by or sponsored by Anthropic, OpenAI, Google or any model provider. See [NOTICE](NOTICE).
