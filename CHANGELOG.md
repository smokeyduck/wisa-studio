# Changelog

All notable changes to WISA STUDIO. Version numbers continue from the GUI this
build is based on, so `0.9.46` here is the first WISA STUDIO release and also
the point where the upstream GUI's history ends in this file. Release notes for
earlier versions belong to that project; see [NOTICE](NOTICE).

## [Unreleased]

Work merged after the 0.9.46 tag lands here until the next release moves it
into a version section.

### Changed

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
