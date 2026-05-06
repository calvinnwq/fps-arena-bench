import type { ActionProvider } from '@fps-arena-bench/contracts';
import {
  applyTick,
  createMatchState,
  generateObservation,
  type AcceptedActionInput,
  type MatchState,
  type TickEvent,
  type TickResult,
} from '@fps-arena-bench/core';
import type { Action, MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';
import { validateAction } from '@fps-arena-bench/schemas';

export interface BotMatchOptions {
  readonly config: MatchConfig;
  readonly map: MapDefinition;
  readonly providers: ReadonlyMap<string, ActionProvider>;
  /**
   * Optional override for the maximum number of ticks to advance. Defaults to
   * the match config's `maxTicks`.
   */
  readonly maxTicks?: number;
  /**
   * Optional fallback action used if a provider throws. Defaults to noop.
   */
  readonly onProviderError?: (contenderId: string, error: unknown) => Action;
  /** Optional schema validator hook. Defaults to validateAction from @fps-arena-bench/schemas. */
  readonly validate?: (action: unknown) => Action;
}

export interface BotMatchTickRecord {
  readonly tick: number;
  readonly inputs: readonly AcceptedActionInput[];
  readonly latencyMsByContenderId: ReadonlyMap<string, number>;
  readonly result: TickResult;
}

export interface BotMatchResult {
  readonly state: MatchState;
  readonly ticks: readonly BotMatchTickRecord[];
  readonly events: readonly TickEvent[];
  readonly schemaViolations: number;
  readonly providerErrors: number;
  readonly timeouts: number;
}

const NOOP_FALLBACK = (): Action => ({
  schemaVersion: 'fps-arena-bench.schema.v0.1',
  type: 'noop',
});

const defaultFallbackAction = (
  config: MatchConfig,
  contenderId: string,
  lastValidActions: ReadonlyMap<string, Action>,
): Action => {
  if (config.invalidActionPolicy.fallbackAction === 'repeat-last-valid') {
    return lastValidActions.get(contenderId) ?? NOOP_FALLBACK();
  }
  return NOOP_FALLBACK();
};

class ProviderTimeoutError extends Error {
  constructor() {
    super('ActionProvider decision timed out.');
  }
}

class ProviderDecisionError extends Error {
  readonly latencyMs: number;
  readonly originalError: unknown;

  constructor(error: unknown, latencyMs: number) {
    super(error instanceof Error ? error.message : String(error));
    this.latencyMs = latencyMs;
    this.originalError = error;
  }
}

const isPromiseLike = <T>(value: T | PromiseLike<T>): value is PromiseLike<T> =>
  typeof (value as PromiseLike<T>).then === 'function';

const getFallbackAction = (error: unknown): Action | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const fallback = (error as { fallbackAction?: unknown }).fallbackAction;
  try {
    return fallback === undefined ? undefined : validateAction(fallback);
  } catch {
    return undefined;
  }
};

const requestProviderAction = async (
  provider: ActionProvider,
  request: Parameters<ActionProvider['decide']>[0],
  timeoutMs: number,
): Promise<{ candidate: unknown; latencyMs: number; timedOut: boolean }> => {
  const controller = new AbortController();
  const startedAt = performance.now();
  let decision: ReturnType<ActionProvider['decide']>;
  try {
    decision = provider.decide({ ...request, signal: controller.signal });
  } catch (error) {
    throw new ProviderDecisionError(error, Math.max(0, performance.now() - startedAt));
  }

  if (!isPromiseLike(decision)) {
    return { candidate: decision, latencyMs: 0, timedOut: false };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const candidate = await Promise.race([
      decision,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new ProviderTimeoutError());
        }, timeoutMs);
      }),
    ]);
    return { candidate, latencyMs: Math.max(0, performance.now() - startedAt), timedOut: false };
  } catch (error) {
    if (error instanceof ProviderTimeoutError) {
      return { candidate: undefined, latencyMs: timeoutMs, timedOut: true };
    }
    throw new ProviderDecisionError(error, Math.max(0, performance.now() - startedAt));
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};

export async function runBotMatch(options: BotMatchOptions): Promise<BotMatchResult> {
  const validate = options.validate ?? validateAction;
  const lastValidActions = new Map<string, Action>();
  const onError =
    options.onProviderError ??
    ((contenderId: string) => defaultFallbackAction(options.config, contenderId, lastValidActions));
  const state = createMatchState({ config: options.config, map: options.map });

  for (const contender of options.config.contenders) {
    if (!options.providers.has(contender.id)) {
      throw new Error(`No ActionProvider registered for contender ${contender.id}.`);
    }
  }

  const ticks: BotMatchTickRecord[] = [];
  const events: TickEvent[] = [];
  let schemaViolations = 0;
  let providerErrors = 0;
  let timeouts = 0;

  const limit = options.maxTicks ?? options.config.maxTicks;

  while (state.status === 'in-progress' && state.tick < limit) {
    const inputs: AcceptedActionInput[] = [];
    const latencyMsByContenderId = new Map<string, number>();
    for (const player of state.players) {
      if (!player.alive) {
        continue;
      }
      const provider = options.providers.get(player.contenderId);
      if (provider === undefined) {
        continue;
      }
      const observation = generateObservation(state, player.contenderId);
      let candidate: unknown;
      try {
        const decision = await requestProviderAction(
          provider,
          {
            observation,
            contenderId: player.contenderId,
            tick: state.tick,
          },
          options.config.actionTimeoutMs,
        );
        latencyMsByContenderId.set(player.contenderId, decision.latencyMs);
        if (decision.timedOut) {
          timeouts += 1;
          candidate = onError(player.contenderId, new ProviderTimeoutError());
        } else {
          candidate = decision.candidate;
        }
      } catch (error) {
        providerErrors += 1;
        if (error instanceof ProviderDecisionError) {
          latencyMsByContenderId.set(player.contenderId, error.latencyMs);
          candidate =
            getFallbackAction(error.originalError) ?? onError(player.contenderId, error.originalError);
        } else {
          latencyMsByContenderId.set(player.contenderId, 0);
          candidate = getFallbackAction(error) ?? onError(player.contenderId, error);
        }
      }
      let action: Action;
      try {
        action = validate(candidate);
        lastValidActions.set(player.contenderId, action);
      } catch (error) {
        schemaViolations += 1;
        action = onError(player.contenderId, error);
      }
      inputs.push({ contenderId: player.contenderId, action });
    }

    const result = applyTick(state, inputs);
    ticks.push({ tick: state.tick - 1, inputs, latencyMsByContenderId, result });
    for (const event of result.events) {
      events.push(event);
    }
  }

  return { state, ticks, events, schemaViolations, providerErrors, timeouts };
}
