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
  readonly result: TickResult;
}

export interface BotMatchResult {
  readonly state: MatchState;
  readonly ticks: readonly BotMatchTickRecord[];
  readonly events: readonly TickEvent[];
  readonly schemaViolations: number;
  readonly providerErrors: number;
}

const NOOP_FALLBACK = (): Action => ({
  schemaVersion: 'fps-arena-bench.schema.v0.1',
  type: 'noop',
});

export async function runBotMatch(options: BotMatchOptions): Promise<BotMatchResult> {
  const validate = options.validate ?? validateAction;
  const onError = options.onProviderError ?? NOOP_FALLBACK;
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

  const limit = options.maxTicks ?? options.config.maxTicks;

  while (state.status === 'in-progress' && state.tick < limit) {
    const inputs: AcceptedActionInput[] = [];
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
        candidate = await provider.decide({
          observation,
          contenderId: player.contenderId,
          tick: state.tick,
        });
      } catch (error) {
        providerErrors += 1;
        candidate = onError(player.contenderId, error);
      }
      let action: Action;
      try {
        action = validate(candidate);
      } catch (error) {
        schemaViolations += 1;
        action = onError(player.contenderId, error);
      }
      inputs.push({ contenderId: player.contenderId, action });
    }

    const result = applyTick(state, inputs);
    ticks.push({ tick: state.tick - 1, inputs, result });
    for (const event of result.events) {
      events.push(event);
    }
  }

  return { state, ticks, events, schemaViolations, providerErrors };
}
