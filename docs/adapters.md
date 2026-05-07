# Adapters

Adapters convert an observation into a strict JSON action.

Actions use `schemaVersion` `fps-arena-bench.schema.v0.1` and one of `move`, `turn`, `shoot`, or `noop`. Positions are strict objects with finite numeric `x` and `y` fields. `move.direction.x` and `move.direction.y` must each be `-1`, `0`, or `1`, and cannot both be `0`; `turn.degrees` is `-90`, `0`, `90`, or `180`; `shoot.target` is a position; `noop` has no payload.

Observations use `schemaVersion` `fps-arena-bench.schema.v0.1` and include non-empty `rulesetVersion`, non-empty `matchId`, nonnegative integer `tick`, `self`, visible players/pickups/walls, and `score`. `visiblePlayers`, `visiblePickups`, and `visibleWalls` are optional arrays that default to `[]`; in ruleset v0.1, players and available pickups are FOV/LOS gated, while `visibleWalls` includes all static map walls because map geometry is known to all contenders. `self` and visible players include non-empty `contenderId`, `position`, `headingDegrees` from `0` to `359`, integer `health` from `0` to `100`, optional nonnegative integer `ammo`, and optional non-empty `team`; pickups include non-empty `id`, `position`, type `health`, `ammo`, or `armor`, and optional positive integer `respawnTicks`; walls use non-empty `id`, finite numeric `x`/`y`, and positive numeric `width`/`height`; `score` maps non-empty contender ids to integer scores.

Adapter metadata must include `schemaVersion`, `adapterId`, `kind`, `displayName`, and `supportedActionSchema`; `schemaVersion` and `supportedActionSchema` must equal `fps-arena-bench.schema.v0.1`, `adapterId` and `displayName` must be non-empty, and `kind` is one of `bot`, `mock`, `local`, `harness`, or `api`. `description` is optional when non-empty.

Adapter errors must include `schemaVersion`, `adapterId`, `code`, `message`, and `retryable`; `schemaVersion` must equal `fps-arena-bench.schema.v0.1`, `adapterId` and `message` must be non-empty, `retryable` must be boolean, and `code` is one of `invalid-json`, `schema-failure`, `timeout`, `aborted`, `output-cap`, or `process-error`.

Adapter authors should use `renderActionPrompt` from `@fps-arena-bench/contracts` as the canonical action prompt renderer. `ACTION_PROMPT_TEMPLATE_VERSION` is `action-prompt.v0.1`; record it with schema and ruleset versions in diagnostics or replay fields that explicitly support those values, not in strict adapter metadata.

The prompt requires exactly one JSON action object and no chain-of-thought, rationale, markdown, or prose. Use `actionPromptDryRunObservations` for offline smoke tests of prompt rendering and response parsing.

Programmatic adapters implement `ActionProvider` from `@fps-arena-bench/contracts`: expose `metadata: AdapterMetadata` and a sync or async `decide(request: ActionRequest)` method returning an `Action`. `ActionRequest` contains `observation`, `contenderId`, `tick`, and optional `signal` for cancellation.

Initial adapter order:

1. baseline bots and mock adapter
2. mock/Ollama local path
3. Claude CLI harness adapter
4. Codex CLI and OpenCode CLI harness adapters

Harness adapters must use isolated working directories, explicit environment allowlists, output caps, timeouts, redaction, and safe replay metadata. They must not persist OAuth tokens, raw credentials, or local auth paths.

The CLI currently registers `baseline-random`/`random-bot` for uniformly random legal actions, `baseline-chaser`/`chaser-bot` for pursuing and shooting visible opponents, `baseline-pickup-seeker`/`pickup-seeker-bot` for prioritizing visible pickups before opportunistic shots, and `mock`/`mock-adapter` for the deterministic mock adapter that exercises the same `renderActionPrompt` → JSON → `parseActionResponse` loop a real model adapter would use. Use one of those ids in `contenders[].adapterId` for built-in matches and `contenders[].adapterId` entries in batch configs; see `configs/examples/mock-duel.json` and `configs/examples/bot-batch.json` for zero-credential examples.

Batch runs use the same built-in registry and packaged CLI environment overrides as single-match runs. Programmatic callers can pass a custom `registry` or `providerOverrides` to `runBatchCommand`.

The Ollama local adapter (`@fps-arena-bench/adapters` `OllamaAdapter`) targets a locally configured Ollama HTTP endpoint (default `http://localhost:11434/api/generate`) and applies the same parse loop, with timeout/abort/HTTP-failure/output-cap classification and an optional `fallbackAction`. Because it requires a per-instance `model` plus optional `baseUrl`, `requestTimeoutMs`, and `fallbackAction`, it is not auto-registered by `adapterId` alone. Applications can construct `OllamaAdapter` directly or inject `createOllamaProviderFactory({ model: 'llama3' })` via `runMatchCommand` or `runBatchCommand` `providerOverrides` under the `ollama` adapter id. The packaged CLI also builds that override from environment for both `run` and `batch` when `FPS_ARENA_OLLAMA_MODEL` is set, with optional `FPS_ARENA_OLLAMA_BASE_URL` and `FPS_ARENA_OLLAMA_TIMEOUT_MS`. See `configs/examples/ollama-vs-baseline.json` for the config side of a local Ollama-vs-baseline run; the model and endpoint are supplied by the factory/environment, not by the strict match config. Live Ollama is never required by CI; tests mock `fetch` end-to-end. See `packages/adapters/src/ollama.ts` and `packages/adapters/src/ollama-factory.ts` for options and error classification.

The Claude CLI harness adapter (`@fps-arena-bench/adapters` `ClaudeCliAdapter`) implements ADR 0001's cold-subprocess model: per request it creates a fresh temp directory, spawns a single `claude --print` subprocess inside it with a minimal explicit env allowlist (default `PATH`, `HOME`), pipes the rendered action prompt into stdin, enforces a per-request timeout plus stdout/stderr byte caps, parses exactly one JSON action object from stdout, and removes the temp directory on success and failure. Spawn or filesystem failures, non-zero exits, output-cap hits, abort signals, timeouts, invalid JSON, and schema-failures are mapped to the standard adapter error taxonomy with `/Users`/`/home`/`/private` paths redacted from messages. The framework-agnostic `ClaudeCliAdapter` accepts an injectable `SpawnLike` and `ClaudeCliFileSystem` so all CI tests run against fakes; the production-ready `createNodeSpawnLike` and `createNodeClaudeCliFileSystem` factories bind to `node:child_process.spawn` and `node:fs/promises`. To select Claude CLI by `adapterId` in match config, pass a `ClaudeCliProviderFactory` via `runMatchCommand`'s `providerOverrides` — the helper `createNodeClaudeCliProviderFactory()` wires the Node-backed defaults so the consumer only supplies optional `command`, `args`, `requestTimeoutMs`, etc. The packaged CLI enables the same Node-backed provider when `FPS_ARENA_ENABLE_CLAUDE_CLI=1`, with optional `FPS_ARENA_CLAUDE_COMMAND` and `FPS_ARENA_CLAUDE_TIMEOUT_MS`. See `configs/examples/claude-cli-vs-baseline.json` for a Claude-vs-baseline duel config; running it requires the user to have a working authenticated `claude` CLI on `PATH`, and the registry will reject the run with a clear adapter-not-registered message unless `claude-cli` is injected via `providerOverrides` or enabled through the environment. Safe replay artifacts never include raw prompts or model output; reliability counters reflect any timeout/schema-failure/fallback path.

The Codex CLI harness adapter (`@fps-arena-bench/adapters` `CodexCliAdapter`) follows the same cold-subprocess lifecycle as the Claude CLI adapter: per request it creates a fresh temp directory, spawns a single `codex exec --full-auto --quiet <prompt>` subprocess inside it with a minimal explicit env allowlist (default `PATH`, `HOME`), passes the rendered action prompt as the final command argument with empty stdin, enforces a per-request timeout plus stdout/stderr byte caps, parses exactly one JSON action object from stdout, and removes the temp directory on success and failure. The same error taxonomy applies: spawn/filesystem failures, non-zero exits, output-cap hits, abort signals, timeouts, invalid JSON, and schema-failures are mapped and redacted. The framework-agnostic `CodexCliAdapter` accepts an injectable `SpawnLike` and `CodexCliFileSystem` so all CI tests run against fakes; the production-ready `createNodeCodexCliProviderFactory()` wires the Node-backed defaults. To select Codex CLI by `adapterId` in match config, pass a `CodexCliProviderFactory` via `runMatchCommand`'s `providerOverrides`. The packaged CLI enables the same Node-backed provider when `FPS_ARENA_ENABLE_CODEX_CLI=1`, with optional `FPS_ARENA_CODEX_COMMAND` and `FPS_ARENA_CODEX_TIMEOUT_MS`. See `configs/examples/codex-cli-vs-baseline.json` for a Codex-vs-baseline duel config; running it requires a working authenticated `codex` CLI on `PATH` (install via `npm i -g @openai/codex`), and the registry will reject the run with a clear adapter-not-registered message unless `codex-cli` is injected via `providerOverrides` or enabled through the environment. Safe replay artifacts never include raw prompts or model output.

Optional live Codex CLI smoke: if `codex` is not installed or not authenticated, the run will fail with a clear `process-error` (ENOENT or non-zero exit). Skip reason: `codex` CLI unavailable or unauthenticated.

The OpenCode CLI harness adapter (`@fps-arena-bench/adapters` `OpenCodeCliAdapter`) follows the same cold-subprocess lifecycle as the Claude and Codex CLI adapters: per request it creates a fresh temp directory, spawns a single `opencode run <prompt>` subprocess inside it with a minimal explicit env allowlist (default `PATH`, `HOME`), passes the rendered action prompt as the final command argument with empty stdin, enforces a per-request timeout plus stdout/stderr byte caps, parses exactly one JSON action object from stdout, and removes the temp directory on success and failure. The same error taxonomy applies: spawn/filesystem failures, non-zero exits, output-cap hits, abort signals, timeouts, invalid JSON, and schema-failures are mapped and redacted. The framework-agnostic `OpenCodeCliAdapter` accepts an injectable `SpawnLike` and `OpenCodeCliFileSystem` so all CI tests run against fakes; the production-ready `createNodeOpenCodeCliProviderFactory()` wires the Node-backed defaults. To select OpenCode CLI by `adapterId` in match config, pass an `OpenCodeCliProviderFactory` via `runMatchCommand`'s `providerOverrides`. The packaged CLI enables the same Node-backed provider when `FPS_ARENA_ENABLE_OPENCODE_CLI=1`, with optional `FPS_ARENA_OPENCODE_COMMAND` and `FPS_ARENA_OPENCODE_TIMEOUT_MS`. See `configs/examples/opencode-cli-vs-baseline.json` for an OpenCode-vs-baseline duel config; running it requires a working authenticated `opencode` CLI on `PATH`, and the registry will reject the run with a clear adapter-not-registered message unless `opencode-cli` is injected via `providerOverrides` or enabled through the environment. Safe replay artifacts never include raw prompts or model output.

Optional live OpenCode CLI smoke: if `opencode` is not installed or not authenticated, the run will fail with a clear `process-error` (ENOENT or non-zero exit). Skip reason: `opencode` CLI unavailable or unauthenticated.

Example local CLI smoke commands:

```bash
FPS_ARENA_OLLAMA_MODEL=llama3 \
node packages/cli/dist/index.js run \
  --config configs/examples/ollama-vs-baseline.json \
  --map maps/default-arena.json \
  --out replays/ollama-vs-baseline

FPS_ARENA_ENABLE_CLAUDE_CLI=1 \
node packages/cli/dist/index.js run \
  --config configs/examples/claude-cli-vs-baseline.json \
  --map maps/default-arena.json \
  --out replays/claude-cli-vs-baseline

FPS_ARENA_ENABLE_CODEX_CLI=1 \
node packages/cli/dist/index.js run \
  --config configs/examples/codex-cli-vs-baseline.json \
  --map maps/default-arena.json \
  --out replays/codex-cli-vs-baseline

FPS_ARENA_ENABLE_OPENCODE_CLI=1 \
node packages/cli/dist/index.js run \
  --config configs/examples/opencode-cli-vs-baseline.json \
  --map maps/default-arena.json \
  --out replays/opencode-cli-vs-baseline
```

## Adapter doctor and diagnostics

Run the lightweight doctor after `pnpm build` when setting up local harnesses:

```bash
node packages/cli/dist/index.js doctor
```

The doctor checks baseline/mock built-ins plus the Claude, Codex, and OpenCode CLI harnesses. Public output is limited to installed/unavailable/misconfigured status, concise remediation, CLI registration flags, and timeout-budget notes. It does not run full benchmark matches, does not invoke model prompts, and ignores CLI probe output so raw prompts, raw model output, credentials, auth paths, absolute paths, and full environment values stay out of public-safe diagnostics and artifacts.

Harness-specific packaged CLI registration is still explicit: set `FPS_ARENA_ENABLE_CLAUDE_CLI=1`, `FPS_ARENA_ENABLE_CODEX_CLI=1`, or `FPS_ARENA_ENABLE_OPENCODE_CLI=1` before `run`/`batch` when you want those adapters registered. Optional command and timeout variables (`FPS_ARENA_*_COMMAND`, `FPS_ARENA_*_TIMEOUT_MS`) affect both local runs and the doctor probe. Invalid timeout values are reported as misconfigured. `doctor --private` prints opt-in local troubleshooting details to the terminal; keep that output local.

Doctor exit codes are stable for automation: `0` when all harness probes are installed/ready, `1` when any harness is unavailable or misconfigured, and `2` for CLI argument errors.

Adapter privacy: safe replay artifacts never include raw prompts, raw model outputs, credentials, auth paths, local filesystem paths, or environment details. Adapter error messages are run through `redactString` before reaching consumers, and the Ollama adapter declares `kind: 'local'` so reliability counters (timeouts, fallbackActions, schemaFailures) reflect any classification path back into the result/replay summary.

MVP harness adapters use a cold subprocess per action request. See [ADR 0001: Harness Process Model for MVP](adr/0001-harness-process-model.md) for the lifecycle contract, error taxonomy, cwd/env rules, and future migration path.
