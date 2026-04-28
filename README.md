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
- Claude CLI harness adapter using the user's already-authenticated local Claude CLI state
- raw tactical, reliability, and latency metrics reported separately

### v0.2 — multi-harness scored batch

- Codex CLI and OpenCode CLI adapters immediately after Claude
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

The initial scaffold includes concrete v0.1 schemas, a validated default arena, and action prompt contracts. Simulation logic, adapters, and CLI behavior land in later issues.

## Non-goals for v0.1

- no hosted service, accounts, or leaderboard
- no provider OAuth implementation
- no pixel/screenshot perception
- no projectile physics, teams, chat, or alliances
- no composite score
- no map editor or first-person spectator until later polish

## License

MIT
