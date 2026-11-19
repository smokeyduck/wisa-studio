# Changelog

All notable changes to WISA STUDIO. Version numbers continue from the GUI this
build is based on, so `0.9.46` here is the first WISA STUDIO release and also
the point where the upstream GUI's history ends in this file. Release notes for
earlier versions belong to that project; see [NOTICE](NOTICE).

## [Unreleased]

Nothing yet. Work merged after the 0.9.46 tag lands here until the next
release moves it into a version section.

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
