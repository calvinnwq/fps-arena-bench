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
