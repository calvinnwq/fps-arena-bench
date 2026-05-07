# Aggregate Summaries

After running a batch (`fps-arena-bench batch`), you can generate machine-readable and spreadsheet-friendly aggregate output with:

```sh
fps-arena-bench summarize --manifest <path/to/manifest.json>
```

This reads the batch manifest and each completed match's `result.json` to produce two files in the same directory as the manifest (or in `--out <dir>` if specified):

- `aggregate.json` — structured summary with per-adapter and per-matchup breakdowns
- `aggregate.csv` — flat export suitable for spreadsheet inspection

## Usage

```
fps-arena-bench summarize --manifest <path> [--out|-o <dir>] [--strict] [--overwrite] [--quiet]
```

| Flag                | Description                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- |
| `--manifest <path>` | Path to `manifest.json` produced by a batch run (required)                              |
| `--out <dir>`       | Output directory for `aggregate.json` and `aggregate.csv` (default: manifest directory) |
| `--strict`          | Fail if any completed run is missing or has a corrupt `result.json`                     |
| `--overwrite`       | Overwrite existing `aggregate.json` / `aggregate.csv`                                   |
| `--quiet` / `-q`    | Suppress stdout summary                                                                 |

Exit code is `0` on success with all results loaded, `1` if any results were missing or an error occurred.

## JSON Summary (`aggregate.json`)

Schema version: `fps-arena-bench.aggregate.v0.1`

### Top-level fields

| Field              | Type   | Description                                                         |
| ------------------ | ------ | ------------------------------------------------------------------- |
| `schemaVersion`    | string | Always `fps-arena-bench.aggregate.v0.1`                             |
| `generatedAt`      | string | ISO 8601 timestamp of when the aggregate was generated              |
| `batchId`          | string | Batch identifier from the manifest                                  |
| `rulesetVersion`   | string | Ruleset version used for the batch                                  |
| `runCounts`        | object | High-level run count summary (see below)                            |
| `byAdapter`        | object | Per-adapter aggregates keyed by `adapterId` (alphabetically sorted) |
| `byMatchup`        | object | Per-matchup aggregates keyed by `matchupId` (alphabetically sorted) |
| `matchReliability` | object | Match-wide reliability totals across all completed runs             |
| `matchLatency`     | object | Match-wide latency sums across all completed runs                   |
| `failures`         | array  | Records for failed, skipped, or unreadable match runs               |

### `runCounts`

| Field            | Type    | Description                                               |
| ---------------- | ------- | --------------------------------------------------------- |
| `total`          | integer | Total planned runs                                        |
| `completed`      | integer | Runs that completed (from manifest)                       |
| `failed`         | integer | Runs that failed (from manifest)                          |
| `skipped`        | integer | Runs that were skipped (from manifest)                    |
| `resultsLoaded`  | integer | Completed runs whose `result.json` was successfully read  |
| `resultsMissing` | integer | Completed runs where `result.json` was missing or corrupt |

### `byAdapter[adapterId]`

| Field                       | Type    | Description                                 |
| --------------------------- | ------- | ------------------------------------------- |
| `adapterId`                 | string  | Adapter identifier                          |
| `displayName`               | string? | Optional display name (from first seen run) |
| `matchesPlayed`             | integer | Total matches this adapter participated in  |
| `wins`                      | integer | Matches won                                 |
| `draws`                     | integer | Matches ending in a draw (no winner)        |
| `losses`                    | integer | Matches lost                                |
| `tactical.kills`            | integer | Total kills across all matches              |
| `tactical.deaths`           | integer | Total deaths across all matches             |
| `tactical.damageDealt`      | number  | Total damage dealt across all matches       |
| `tactical.damageTaken`      | number  | Total damage taken across all matches       |
| `tactical.survivalTicks`    | integer | Total survival ticks across all matches     |
| `tactical.pickupsCollected` | integer | Total pickups collected across all matches  |

**Caveat:** Tactical stats are cumulative raw sums — they do not account for map size, match length, or opponent count. Do not use them as a composite performance score.

### `byMatchup[matchupId]`

| Field                                        | Type    | Description                                       |
| -------------------------------------------- | ------- | ------------------------------------------------- |
| `matchesPlayed`                              | integer | Total matches played for this matchup             |
| `contenderOutcomes[adapterId]`               | object  | Per-adapter win/draw/loss counts for this matchup |
| `contenderOutcomes[adapterId].matchesPlayed` | integer | Matches played by this adapter in this matchup    |
| `contenderOutcomes[adapterId].wins`          | integer | Wins                                              |
| `contenderOutcomes[adapterId].draws`         | integer | Draws                                             |
| `contenderOutcomes[adapterId].losses`        | integer | Losses                                            |

### `matchReliability`

Match-wide reliability counters summed across all completed runs with loaded results. These are not broken down per adapter because the per-match `result.json` schema does not attribute violations to individual contenders.

| Field                  | Type    | Description                                              |
| ---------------------- | ------- | -------------------------------------------------------- |
| `totalInvalidJson`     | integer | Sum of `reliability.invalidJson` across all result files |
| `totalSchemaFailures`  | integer | Sum of `reliability.schemaFailures`                      |
| `totalRepairAttempts`  | integer | Sum of `reliability.repairAttempts`                      |
| `totalRepairSuccesses` | integer | Sum of `reliability.repairSuccesses`                     |
| `totalTimeouts`        | integer | Sum of `reliability.timeouts`                            |
| `totalFallbackActions` | integer | Sum of `reliability.fallbackActions`                     |

**Note:** `invalidJson` and `repairAttempts` are v0 stubs in the current engine and will be zero; `schemaFailures` and `fallbackActions` are the meaningful reliability counters. See `packages/cli/src/run-match-command.ts` for context.

### `matchLatency`

Latency values are averages and percentiles recorded per match. The aggregate stores raw sums to avoid double-averaging.

| Field              | Type    | Description                                      |
| ------------------ | ------- | ------------------------------------------------ |
| `matchCount`       | integer | Number of matches contributing to the sums       |
| `sumAverageMeanMs` | number  | Sum of per-match `latency.averageMs` values (ms) |
| `sumAverageP50Ms`  | number  | Sum of per-match `latency.p50Ms` values (ms)     |
| `sumAverageP95Ms`  | number  | Sum of per-match `latency.p95Ms` values (ms)     |

To compute a mean-of-means: divide each sum by `matchCount`. These numbers have no statistical significance guarantee — treat them as directional indicators only.

### `failures`

Each entry describes a run that could not contribute to the aggregate:

| Field     | Type    | Description                                                |
| --------- | ------- | ---------------------------------------------------------- |
| `matchId` | string  | Match identifier                                           |
| `status`  | string  | `failed`, `skipped`, `result-missing`, or `result-corrupt` |
| `code`    | string? | Error code (for `failed` runs from manifest)               |
| `message` | string? | Human-readable error description                           |

## CSV Export (`aggregate.csv`)

The CSV has one row per (match, contender) pair from completed runs with loaded results. Failed, skipped, and unreadable runs are omitted from the CSV (they appear in `aggregate.json`'s `failures` array).

Columns are stable across versions and documented below. Values containing commas, double quotes, or newlines are RFC 4180 quoted.

### CSV Columns

| Column                 | Type    | Description                                                |
| ---------------------- | ------- | ---------------------------------------------------------- |
| `matchId`              | string  | Match identifier                                           |
| `matchupId`            | string  | Matchup identifier from the batch config                   |
| `mapId`                | string  | Map identifier                                             |
| `seed`                 | integer | RNG seed used for the match                                |
| `contenderId`          | string  | Contender identifier within this match                     |
| `adapterId`            | string  | Adapter identifier for this contender                      |
| `displayName`          | string  | Display name (empty if not set)                            |
| `rank`                 | integer | Final placement rank (1 = first place)                     |
| `win`                  | 0/1     | 1 if this contender won, 0 otherwise                       |
| `draw`                 | 0/1     | 1 if the match ended in a draw, 0 otherwise                |
| `kills`                | integer | Kills in this match                                        |
| `deaths`               | integer | Deaths in this match                                       |
| `damageDealt`          | number  | Damage dealt in this match                                 |
| `damageTaken`          | number  | Damage taken in this match                                 |
| `survivalTicks`        | integer | Number of ticks the contender survived                     |
| `pickupsCollected`     | integer | Number of pickups collected                                |
| `ticksElapsed`         | integer | Total ticks in the match                                   |
| `matchInvalidJson`     | integer | `reliability.invalidJson` for the whole match              |
| `matchSchemaFailures`  | integer | `reliability.schemaFailures` for the whole match           |
| `matchRepairAttempts`  | integer | `reliability.repairAttempts` for the whole match           |
| `matchRepairSuccesses` | integer | `reliability.repairSuccesses` for the whole match          |
| `matchTimeouts`        | integer | `reliability.timeouts` for the whole match                 |
| `matchFallbackActions` | integer | `reliability.fallbackActions` for the whole match          |
| `matchAvgLatencyMs`    | number  | `latency.averageMs` for the whole match (ms)               |
| `matchP50LatencyMs`    | number  | `latency.p50Ms` for the whole match (ms)                   |
| `matchP95LatencyMs`    | number  | `latency.p95Ms` for the whole match (ms)                   |
| `matchTimeoutBudgetMs` | number  | `latency.timeoutBudgetMs` — the action timeout budget (ms) |

**Caveats:**

- Reliability columns (`matchInvalidJson`, `matchSchemaFailures`, etc.) reflect the whole match, not an individual contender's behaviour.
- Latency columns are match-wide percentiles, not per-contender measurements.
- Do not create a composite score from these columns without understanding what each measures.

## Safety Notes

- Aggregate output is derived exclusively from `manifest.json` and per-match `result.json` files — not from raw prompts, raw model outputs, or private debug traces.
- No absolute local paths or environment-specific data appear in aggregate output.
- Use `--overwrite` deliberately; without it, `summarize` refuses to overwrite existing aggregate files to prevent accidental data loss.
