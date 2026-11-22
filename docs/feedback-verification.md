# Feedback verification manifest

Recorded 2026-11-22. Exit codes are from direct commands, not piped through `tail`.

| Check | Result |
| --- | --- |
| `bun run build` (electron-vite + check-main-bundle) | exit 0; main bundle self-contained |
| `tsc --noEmit -p .` | exit 0 |
| Narrow vitest (rpc-client, use-rpc-events, provider-brand, InputArea queue-shorthand) | exit 0; 4 files, 119 tests passed |
| Full vitest, first run | exit 1; 44 failed, 2658 passed (3 files failing) |
| Full vitest failures after correction | All affected cases corrected: InputArea label `getComputedStyle` guard, provider-brand unknown-id casing, rpc-client paged/complete transcript. No full suite rerun since. |
| Biome, owned and released files | exit 0 after `--write` formatting |
| Browser smoke (throwaway Chromium, isolated harness) | exit 0. Limit: harness uses its own trigger markup with the real `components.css` and `fitLabel`; not the mounted composer. |

Performance: backend fixture, 20 builds 32.73 ms vs 1 build 0.84 ms. No end-to-end or ChatStream timing measured; no 4–5 s claim.

Not verified in the initial pass above: ChatStream reattach timing, mounted composer layout, full suite after the final corrections. The bounded-dock pass below subsequently exercises the mounted composer layout.

## Bounded execution dock

Real Chromium 1223, isolated Vite harness with the production `ChatStream`, `InputArea`, `WorkspaceDock`, cards, stores, graph/transcript components, and source CSS; only the desktop bridge and session data were fixtures. No Electron process or live profile was used.

- 44 layout states passed: 40 agents, 40 todos, and both together; full/focused lists, inline transcripts, graph and selected graph transcripts; 1920×973 with 480px of side panes, 831×837 and 831×600 with a 224px sidebar, and 600×500 with a 224px sidebar.
- Five additional states passed at 831×837: each/both cards in summary mode with Open details/Back to summary, plus each unmanaged card inside the shared dock layout.
- One shared `min(360px, 40cqh)` cap references the flex-sized transcript viewport, which already excludes the composer. At 831×837 both cards occupy 259.72px of a 649.31px transcript viewport, leaving 389px of visible conversation. At 1920×973 they occupy 314.13px of 785.31px, leaving 471px. The composer never moved between view states; document overflow remained absent.
- Card bodies retained all 40 rows, independently scrolled on wheel input, and did not chain wheel input into the conversation at their edges. Fixed headers remained outside body scrolling. Very short panes use an outer dock scroll fallback within the same cap so wrapped headers and a minimum scrollable body remain reachable.
- Screenshots and measured geometry: `/tmp/omp-dock-bounds/`; these are local proof artifacts, not shipped assets. The throwaway harness was removed after verification.
- Focus/summary and card behavior: 27 tests passed across `TodoDockCard`, `AgentsDockCard`, `AgentsDockCard.live-roster`, and `dock-summary`. Replaced prior source-class assertions for unbounded scrolling with behavior coverage that all focused tasks remain available and Back to summary restores the compact view.
- Scoped TypeScript compilation of the changed TSX roots and their imported dependencies passed using the repository renderer declaration files. Biome passed for the three touched TSX files; the repository Biome configuration does not include CSS files, so its invocation did not check `components.css`.
