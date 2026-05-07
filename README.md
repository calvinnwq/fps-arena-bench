# FPS Arena Bench

A local arena-FPS benchmark where LLMs fight for survival.

FPS Arena Bench is a deterministic, replayable, local benchmark inspired by classic arena shooters. It is designed to make model comparison watchable and debuggable: tactical outcomes, structured-output reliability, latency, and replay artifacts instead of just spreadsheet scores.

> Status: pre-alpha scaffold. The repo is public from day one, but no benchmark claims should be treated as authoritative yet.

## Release cuts

### v0.1 — local replayable benchmark spine

A clean checkout should support:

- bot-only CLI match from config
- safe replay artifact and match result JSON
- top-down local web replay viewer for saved replays
- zero-credential demo path with baseline bots and/or mock adapter
- mock/Ollama local adapter path
- Claude, Codex, and OpenCode CLI harness adapters using the user's already-authenticated local CLI state
- raw tactical, reliability, and latency metrics reported separately

### v0.2 — multi-harness scored batch

- scored batch/tournament mode across seed suites and spawn permutations
- JSON and CSV summaries
- adapter doctor checks and harness diagnostics
- benchmark methodology notes for fairness, prompt/schema versions, model settings, timeout budgets, and fallback policy

### v0.3 — publishable polish

- first-person spectator
- minimal map editor
- polished demo replay/result package
- richer docs/examples and publishable project presentation

## Public-readiness contract

- This is a watchable diagnostic benchmark, not an authoritative leaderboard until methodology matures.
- Engine determinism means the same engine, rules, map, config, seed, and non-LLM actions should produce the same replay/result. LLM outputs may still vary.
- OAuth-backed harnesses depend on the user's local authenticated CLI state. This repo does not implement provider OAuth flows.
- Safe replay files must not include raw prompts, raw model outputs, credentials, auth paths, or local environment details. Raw diagnostics belong only in opt-in private debug artifacts.

## Monorepo shape

```text
apps/web                 Local replay viewer and future dashboard
packages/schemas         Zod/JSON schema source of truth
packages/contracts       Public provider/action contracts
packages/core            Deterministic simulation engine
packages/bots            Baseline non-LLM contenders
packages/replay          Event log, replay reconstruction, summaries
packages/adapters        Mock/local/harness adapters
packages/cli             CLI entrypoint
configs/examples         Example match/tournament configs
maps                     Hand-authored maps
replays                  Local generated replay output, ignored by git
docs                     Human-facing docs
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

CI runs the same local quality gates on every push and pull request:

CI uses Node.js 24.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

This branch includes the deterministic core engine, baseline bots, local adapters, safe replay writer/reader, and
CLI runner. A local bot duel can be generated with:

```bash
pnpm build
node packages/cli/dist/index.js run \
  --config configs/examples/bot-duel.json \
  --map maps/default-arena.json \
  --out replays/bot-duel
```

`run` also accepts `-c`, `-m`, `-o`/`--out-dir`, `--snapshot-interval <ticks>` to include hash-only replay snapshots, and `--quiet`/`-q` to suppress the stdout summary. Use `help`, `--help`, or `-h` for usage. The output directory contains `replay.safe.json` and `result.json`; CLI exit codes are `0` for success/help, `1` for match execution failures, and `2` for argument errors.

A multi-match batch can be generated with:

```bash
node packages/cli/dist/index.js batch \
  --config configs/examples/bot-batch.json \
  --out replays/batches
```

`batch` also accepts `-c`/`--config`, `-o`/`--out-dir`, `--snapshot-interval <ticks>`, `--overwrite` to replace an existing batch manifest, and `--quiet`/`-q`. It produces a `<outDir>/<batchId>/` tree containing per-match `matches/<matchId>/{config.json,replay.safe.json,result.json}` artifacts plus a top-level `manifest.json` recording the batch config snapshot, ordered runs, terminal status, and relative artifact paths. CLI exit codes are `0` when all runs complete or for help, `1` when any batch run fails or batch execution fails, and `2` for argument errors. See [docs/configs.md](docs/configs.md#batch-configs) for the batch config shape and [docs/benchmark-methodology.md](docs/benchmark-methodology.md) for fairness, ordering, and partial-failure semantics.

The generated `replay.safe.json` can be opened in the local top-down web replay viewer at `apps/web`. After `pnpm build`, open `apps/web/index.html` in a modern browser (or serve `apps/web` over a simple local HTTP server) and use the file picker to load the artifact. See [docs/web-viewer.md](docs/web-viewer.md) for the full flow, controls, error handling, and privacy guarantees.

The zero-credential adapter path is `configs/examples/mock-duel.json`, which runs the deterministic mock adapter through the same prompt -> JSON -> action-schema parse loop used by local model adapters. Ollama, Claude CLI, Codex CLI, and OpenCode CLI examples live in `configs/examples/`; all use strict match configs plus provider factory injection or CLI environment variables for local runtime details. See [docs/adapters.md](docs/adapters.md) for the Ollama factory/env path, the Claude/Codex/OpenCode CLI harness lifecycles, and the optional local smoke patterns for an already-authenticated `claude`, `codex`, or `opencode` CLI.

## Non-goals for v0.1

- no hosted service, accounts, or leaderboard
- no provider OAuth implementation
- no pixel/screenshot perception
- no projectile physics, teams, chat, or alliances
- no composite score
- no map editor or first-person spectator until later polish

## License

MIT
