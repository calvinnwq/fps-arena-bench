# Web replay viewer

`apps/web` is a local, top-down 2D spectator for `replay.safe.json` artifacts. It runs as a static HTML page backed by a single ESM browser bundle; there is no server, account, network call, or credential prompt. The viewer reuses `@fps-arena-bench/replay` for validation/reconstruction so it cannot accept artifacts that the CLI would reject.

## Generate a replay

The viewer reads any safe replay artifact written by the CLI. Generate one from a clean checkout with the bot-duel example:

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js run \
  --config configs/examples/bot-duel.json \
  --map maps/default-arena.json \
  --out replays/bot-duel
```

`replays/bot-duel/replay.safe.json` is the file the viewer expects. `replays/` is git-ignored, so generated artifacts stay local. See [configs.md](./configs.md) for the match config schema and [replays.md](./replays.md) for the safe replay schema and redaction guarantees.

## Build the viewer bundle

`pnpm build` already builds `apps/web` as part of the workspace. To rebuild only the viewer:

```bash
pnpm --filter @fps-arena-bench/web build
```

This produces `apps/web/dist/entry.bundle.js`, a single self-contained ESM bundle. The bundle resolves the `@fps-arena-bench/{core,replay,schemas}` workspace imports and aliases `node:crypto` to a browser-safe shim so the viewer never pulls Node-only code paths.

## Open the viewer

Open `apps/web/index.html` in a modern browser. ES module imports work over `file://` in Chromium and Firefox; if your browser blocks `file://` modules, serve `apps/web` over a local HTTP server, for example:

```bash
cd apps/web
python3 -m http.server 8080
# then open http://localhost:8080/
```

Use the "Open a replay" file picker to load a `replay.safe.json`. The viewer validates the artifact on load and either renders the match or shows a redacted error in the side panel.

## Controls and view

The top-down stage shows map bounds, walls, pickups (color-coded by type, dimmed when unavailable), and players (filled bodies with a heading line and a health bar). Players are colored deterministically by the configured contender order; eliminated contenders fall back to a uniform "dead" color and skip the heading and health bar.

The control bar exposes:

- **Play/Pause** — toggles deterministic playback. Auto-pauses at the final tick.
- **Step**, **Step ⟶** — single-tick scrub. Step backward is disabled at tick 0; step forward is disabled at the final tick.
- **Scrubber** — jump to any tick. Scrubbing pauses playback.
- **Speed** — playback speed in ticks per second. Defaults are `0.25, 0.5, 1, 2, 4, 8`; if the active speed does not match a preset, a custom option is inserted.
- **Reset** — return to tick 0 at the default speed, paused.

The side panel shows match id, map id/version, status, winner, duration, reliability counters (timeouts, fallback actions, invalid JSON, schema failures, repair attempts/successes), latency stats (avg/p50/p95 vs. timeout budget), ranked placements with per-contender stats, and a per-frame event feed (combat hits/misses, pickup collection, eliminations, match end).

## Errors

The viewer rejects unsafe or malformed input with a categorized, redacted error message and never logs raw paths or environment details to the user-facing UI:

- `invalid-json` — empty, non-JSON, or oversized input (>32 MiB cap).
- `invalid-schema` — fails `validateReplaySafeArtifact` from `@fps-arena-bench/schemas`.
- `invalid-timeline` — passes schema validation but the engine reconstruction disagrees with the recorded `result.ticksElapsed` or final state.
- `read-error` — the browser File API failed to read the selected file.

Every error message is run through `redactString` from `@fps-arena-bench/replay`, which strips absolute and home-relative paths, bearer tokens, JWTs, AWS/GitHub tokens, PEM blocks, and URLs with embedded credentials before it reaches the panel.

## Privacy and scope

The viewer only consumes safe replay artifacts. It cannot read `debug.private.jsonl` or any other private diagnostic, and it does not display raw prompts, raw model outputs, credentials, auth paths, or local environment details. There is no first-person spectator, map editor, hosted dashboard, account system, or leaderboard at this stage; those are explicitly out of scope for v0.1.
