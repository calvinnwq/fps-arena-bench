# ADR 0001: Harness Process Model for MVP

## Status

Accepted for MVP.

## Context

FPS Arena Bench v0.1 needs harness adapters for local CLIs, including Claude CLI, Codex CLI, and OpenCode CLI. These adapters run tools that may read local authenticated CLI state, emit malformed output, hang, or leave child processes behind. The benchmark also needs reliable latency and timeout metrics, safe replay artifacts, and a zero-surprise boundary around what local context is exposed.

The main process model options are:

- Cold subprocess: spawn a fresh CLI process for each adapter action request.
- Persistent session or server: keep a CLI process, shell, daemon, or session alive across requests.

## Decision

MVP harness adapters must use a cold subprocess per action request.

Persistent sessions and server modes are deferred until the benchmark has adapter doctor checks, per-provider diagnostics, and enough replay evidence to prove they improve throughput without weakening isolation or cleanup guarantees.

## Rationale

Cold subprocesses add startup latency to every action, but they give the MVP stronger isolation and clearer failure boundaries. A single bad action can be timed out, aborted, capped, classified, and cleaned up without carrying hidden state into the next decision. This keeps early benchmark results easier to interpret even when absolute latency is worse than a warm session.

Persistent sessions could reduce p50 and p95 action latency after warmup, but they introduce session state, prompt bleed, harder cleanup, provider-specific recovery paths, and more ambiguous timeout behavior. Those tradeoffs are not worth hardening into the first adapter interface.

## Adapter Lifecycle Semantics

Each harness action request is a single isolated run:

1. `start`: create an isolated temporary working directory, materialize only the prompt/input files required for the request, build an explicit environment allowlist, and spawn one CLI subprocess.
2. `timeout`: enforce a per-action wall-clock timeout. A timeout records elapsed time and returns a timeout error; callers apply the configured invalid-action fallback policy outside the adapter.
3. `abort`: support external cancellation through an abort signal. Abort must terminate the subprocess tree and classify the result separately from timeout.
4. `cleanup`: remove temporary files and directories after success, timeout, abort, parse failure, or process failure. Cleanup failures are reported as diagnostics and must not expose local paths in replay artifacts.
5. `output caps`: cap stdout and stderr independently. Exceeding a cap terminates the run and returns an `output-cap` error. Byte counts and cap names belong in opt-in private diagnostics until a versioned safe replay field supports them; safe replay artifacts must not include raw prompt text, raw model output, credentials, auth paths, or local environment details.
6. `classification`: map every terminal state into the `AdapterErrorSchema` taxonomy before result summaries or replay metadata are written.

## Cwd and Environment

Harness subprocesses must run from a per-request temporary directory, not from the repository root or the user's broader workspace. The adapter may pass only the tactical prompt, schema version, ruleset version, and observation payload needed for the action request.

Environment variables must be allowlisted per adapter. The default allowlist should be empty except for variables that are required for the target CLI to execute in the local environment. Adapters must not copy the parent environment wholesale and must not record raw environment values in replay artifacts.

The MVP must not pass repo or workspace context to harnesses, and must not add permissive coding-agent flags that grant file editing, shell execution, network access, or workspace traversal unless a future issue explicitly scopes and accepts that behavior.

## Error Taxonomy

Adapter implementations classify every terminal state into one of the codes defined by `AdapterErrorSchema` in `@fps-arena-bench/schemas`:

- `invalid-json`: output could not be parsed as JSON.
- `schema-failure`: parsed JSON did not match the action schema.
- `timeout`: the per-action timeout elapsed.
- `aborted`: the run was canceled externally by abort signal.
- `output-cap`: stdout or stderr exceeded its configured byte cap.
- `process-error`: any other subprocess failure, including spawn failure, non-zero exit before a valid action was produced, cleanup failure after a primary terminal state, and unclassified adapter errors. Adapters should expose the underlying cause in the error `message` field and in opt-in private diagnostics.

Provider-specific stderr, raw model text, and local paths may be retained only in opt-in private diagnostics, not in safe replay artifacts.

## Interface Implications

Adapter authors can implement against this minimum contract:

- A harness adapter receives one action request and returns either one schema-valid action or one classified adapter error.
- The lifecycle boundary is per action request, not per match, bot, tournament, or CLI session.
- Timeout, abort, cleanup, output cap, and error classification behavior belongs inside the adapter, so callers do not need provider-specific process handling.
- Result and replay metadata may record schema-supported adapter ids, elapsed time, timeout budget usage, and stable error categories; prompt versions, adapter kind, byte counts, and cap names belong only in diagnostics or future versioned fields that explicitly support them.
- Public contracts should not expose a persistent session handle in MVP. If a future persistent implementation is added, it must sit behind the same request/response contract or introduce a versioned lifecycle contract.

## Future Migration Path

A later milestone may add persistent session or server mode as an adapter capability after the cold subprocess interface is proven. Migration should be explicit and versioned:

1. Keep cold subprocess as the compatibility baseline.
2. Add an adapter capability flag for persistent lifecycle support.
3. Require doctor checks that prove session startup, reset, timeout recovery, abort, and cleanup behavior.
4. Record process model and warm/cold state in result metadata so latency comparisons remain interpretable.
5. Preserve safe replay constraints: no raw prompts, raw outputs, credentials, auth paths, local paths, or copied workspace context.

Until that migration is accepted, MVP harness adapters must use cold subprocess execution only.
