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

The CLI currently registers `baseline-random`/`random-bot` for uniformly random legal actions, `baseline-chaser`/`chaser-bot` for pursuing and shooting visible opponents, `baseline-pickup-seeker`/`pickup-seeker-bot` for prioritizing visible pickups before opportunistic shots, and `mock`/`mock-adapter` for the deterministic mock adapter that exercises the same `renderActionPrompt` → JSON → `parseActionResponse` loop a real model adapter would use. Use one of those ids in `contenders[].adapterId` for built-in matches; see `configs/examples/mock-duel.json` for a zero-credential mock-vs-mock example.

The Ollama local adapter (`@fps-arena-bench/adapters` `OllamaAdapter`) targets a locally configured Ollama HTTP endpoint (default `http://localhost:11434/api/generate`) and applies the same parse loop, with timeout/abort/HTTP-failure/output-cap classification and an optional `fallbackAction`. Because it requires a per-instance `model` plus optional `baseUrl`, `requestTimeoutMs`, and `fallbackAction`, it is not auto-registered by `adapterId` alone — instead, applications can construct `OllamaAdapter` directly and inject it via `runMatchCommand`'s `providerOverrides`. Live Ollama is never required by CI; tests mock `fetch` end-to-end. See `packages/adapters/src/ollama.ts` for options and error classification.

Adapter privacy: safe replay artifacts never include raw prompts, raw model outputs, credentials, auth paths, local filesystem paths, or environment details. Adapter error messages are run through `redactString` before reaching consumers, and the Ollama adapter declares `kind: 'local'` so reliability counters (timeouts, fallbackActions, schemaFailures) reflect any classification path back into the result/replay summary.

MVP harness adapters use a cold subprocess per action request. See [ADR 0001: Harness Process Model for MVP](adr/0001-harness-process-model.md) for the lifecycle contract, error taxonomy, cwd/env rules, and future migration path.
