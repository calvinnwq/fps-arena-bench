# Benchmark Methodology

FPS Arena Bench starts as a watchable diagnostic benchmark. Results should be interpreted as local, config-specific evidence until seed suites, spawn permutations, prompt versions, model settings, and timeout policies mature.

MVP outputs should keep these metric families separate:

- tactical outcomes: winner, placements, kills, deaths, damageDealt, damageTaken, survivalTicks, pickupsCollected
- reliability: invalidJson, schemaFailures, repairAttempts, repairSuccesses, timeouts, fallbackActions
- latency: averageMs, p50Ms, p95Ms, timeoutBudgetMs

No composite score in MVP.

## Ruleset v0.1

`ruleset.v0.1` is deterministic for the same engine, map, config, seed, and accepted actions. Each tick applies alive contenders in sorted `contenderId` order through turn, move, shoot, damage/elimination, pickup, noop, survival increment, pickup respawn, and end-condition phases.

Movement advances one tile per non-zero direction axis, so diagonal moves may change both `x` and `y` in one tick, and is blocked by map bounds, wall interiors, and occupied live-player positions. Visibility uses a closed 90-degree field-of-view cone centered on cardinal headings; walls block line of sight only when the segment enters a wall's open interior.

Weapons start with 12 ammo, spend 1 ammo per shot, hit the nearest live opponent collinear with the target direction within 10 tiles and clear line of sight, and deal 25 damage. Health starts at 100; health and armor pickups restore up to 100 by 50 and 25 respectively, ammo pickups restore 8 up to 24, and default pickup respawn is 50 ticks.

Eliminations award one kill and one score point to the last non-self shooter. Matches end on last survivor, mutual elimination, or `maxTicks`; max-tick winners are selected by live-player score then health, with unresolved ties recorded as draws.

## Batch runs (v0.2)

Batch configs (see [configs.md](./configs.md#batch-configs)) drive a deterministic matrix of `seeds × maps × matchups × spawnPermutations`. The runner expands the matrix in declared order, synthesizes one `MatchConfigSchema`-valid match config per cell, and writes the per-match `replay.safe.json`/`result.json` next to a `manifest.json` recording the batch config snapshot, ordered runs, and per-run terminal status. Match ids are derived from the batch id, map id, matchup id, spawn permutation index, and seed so the same batch config produces the same plan on every run. Spawn permutations exist to spread positional advantage across matchups; pair `[0,1]` with `[1,0]` (or any full set of permutations of `[0..n-1]`) to balance spawn assignments before drawing tactical conclusions.

Failures are recorded as `{status: 'failed', error: {code, message}}` rows in the manifest. With `failurePolicy.onMatchFailure: continue` the runner moves on and successful artifacts written before or after the failure remain untouched. With `onMatchFailure: stop` remaining planned matches are recorded as `skipped` rows so the manifest still describes the full plan. Batch outputs are local-only and contain no raw prompts, raw model outputs, credentials, auth paths, absolute paths, or environment details; only relative artifact paths are persisted.

## v0.2 Methodology Notes

These fields must be reported alongside any shared batch results for fair comparison:

- **Prompt/schema version**: `ACTION_PROMPT_TEMPLATE_VERSION` from `@fps-arena-bench/contracts` (currently `action-prompt.v0.1`) and `SCHEMA_VERSION` from `@fps-arena-bench/schemas` (currently `fps-arena-bench.schema.v0.1`). Results across different prompt or schema versions are not directly comparable.
- **Ruleset version**: `ruleset.v0.1` (see above). Engine changes invalidate comparisons.
- **Adapter ids**: The `adapterId` and `displayName` from each contender's `AdapterMetadata`. Include CLI tool version where available (e.g. `claude --version` output).
- **Model/CLI settings**: Any non-default `command`, `args`, `requestTimeoutMs`, or `envAllowlist` values passed to harness adapters.
- **Timeout budget**: `requestTimeoutMs` per adapter (default 60 000 ms). Comparisons between different timeout budgets are not meaningful.
- **Fallback policy**: Whether a `fallbackAction` was configured. Fallback actions may mask reliability differences.
- **Seed suite**: The exact `seeds` array from the batch config. Small seed suites have high variance.
- **Spawn permutations**: The exact `spawnPermutations` array from the batch config. Without balancing spawn assignments, positional advantage skews tactical outcomes.
- **Hardware / local-run caveats**: Harness adapters invoke local CLI subprocesses. Latency metrics reflect the local machine and concurrent load, not model-intrinsic speed.
- **No composite score**: FPS Arena Bench does not produce a composite ranking or leaderboard score. The project is a diagnostic/watchable benchmark, not an authoritative evaluation.

Public artifacts (replays, results, aggregates) produced by this tool contain no raw prompts, raw model outputs, credentials, auth paths, absolute paths, or full environment variable values.
