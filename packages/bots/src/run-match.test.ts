import type { ActionProvider, ActionRequest } from '@fps-arena-bench/contracts';
import { hashMatchState } from '@fps-arena-bench/core';
import type { Action, AdapterMetadata } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it } from 'vitest';

import { ChaserBot } from './chaser-bot.js';
import { PickupSeekerBot } from './pickup-seeker-bot.js';
import { RandomBot } from './random-bot.js';
import { runBotMatch } from './run-match.js';
import { buildBotTestMap, buildBotTestMatchConfig } from './test-fixtures.js';

const noopAction = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

class StaticBot implements ActionProvider {
  readonly metadata: AdapterMetadata = {
    schemaVersion: SCHEMA_VERSION,
    adapterId: 'static-bot',
    kind: 'bot',
    displayName: 'Static Bot',
    supportedActionSchema: SCHEMA_VERSION,
  };
  decide(_request: ActionRequest): Action {
    return noopAction();
  }
}

class ThrowingBot implements ActionProvider {
  readonly metadata: AdapterMetadata = {
    schemaVersion: SCHEMA_VERSION,
    adapterId: 'throwing-bot',
    kind: 'bot',
    displayName: 'Throwing Bot',
    supportedActionSchema: SCHEMA_VERSION,
  };
  decide(_request: ActionRequest): Action {
    throw new Error('boom');
  }
}

class ThrowingFallbackBot implements ActionProvider {
  readonly metadata: AdapterMetadata = {
    schemaVersion: SCHEMA_VERSION,
    adapterId: 'throwing-fallback-bot',
    kind: 'bot',
    displayName: 'Throwing Fallback Bot',
    supportedActionSchema: SCHEMA_VERSION,
  };

  decide(_request: ActionRequest): Action {
    const error = new Error('boom') as Error & { fallbackAction: Action };
    error.fallbackAction = { schemaVersion: SCHEMA_VERSION, type: 'turn', degrees: 90 };
    throw error;
  }
}

class InvalidAfterValidBot implements ActionProvider {
  readonly metadata: AdapterMetadata = {
    schemaVersion: SCHEMA_VERSION,
    adapterId: 'invalid-after-valid-bot',
    kind: 'bot',
    displayName: 'Invalid After Valid Bot',
    supportedActionSchema: SCHEMA_VERSION,
  };
  private calls = 0;

  decide(_request: ActionRequest): Action {
    this.calls += 1;
    if (this.calls === 1) {
      return { schemaVersion: SCHEMA_VERSION, type: 'move', direction: { x: 1, y: 0 } };
    }
    return { schemaVersion: SCHEMA_VERSION, type: 'move', direction: { x: 0, y: 0 } } as Action;
  }
}

class InvalidFirstBot implements ActionProvider {
  readonly metadata: AdapterMetadata = {
    schemaVersion: SCHEMA_VERSION,
    adapterId: 'invalid-first-bot',
    kind: 'bot',
    displayName: 'Invalid First Bot',
    supportedActionSchema: SCHEMA_VERSION,
  };

  decide(_request: ActionRequest): Action {
    return { schemaVersion: SCHEMA_VERSION, type: 'move', direction: { x: 0, y: 0 } } as Action;
  }
}

class NeverResolvingBot implements ActionProvider {
  readonly metadata: AdapterMetadata = {
    schemaVersion: SCHEMA_VERSION,
    adapterId: 'never-resolving-bot',
    kind: 'bot',
    displayName: 'Never Resolving Bot',
    supportedActionSchema: SCHEMA_VERSION,
  };
  aborted = false;

  decide(request: ActionRequest): Promise<Action> {
    request.signal?.addEventListener('abort', () => {
      this.aborted = true;
    });
    return new Promise<Action>(() => {});
  }
}

describe('runBotMatch', () => {
  it('runs to a terminal state without schema violations using only bots', async () => {
    const map = buildBotTestMap();
    const config = buildBotTestMatchConfig({
      mapId: map.id,
      mapVersion: map.version,
      seed: 1,
      maxTicks: 100,
    });
    const providers = new Map<string, ActionProvider>([
      ['alpha', new ChaserBot({ seed: 11 })],
      ['bravo', new PickupSeekerBot({ seed: 22 })],
    ]);
    const result = await runBotMatch({ config, map, providers });

    expect(result.schemaViolations).toBe(0);
    expect(result.providerErrors).toBe(0);
    expect(result.ticks.length).toBeGreaterThan(0);
    expect(['finished', 'in-progress']).toContain(result.state.status);
  });

  it('stops at maxTicks even if no terminal condition fires', async () => {
    const map = buildBotTestMap();
    const config = buildBotTestMatchConfig({
      mapId: map.id,
      mapVersion: map.version,
      seed: 7,
      maxTicks: 5,
    });
    const providers = new Map<string, ActionProvider>([
      ['alpha', new StaticBot()],
      ['bravo', new StaticBot()],
    ]);
    const result = await runBotMatch({ config, map, providers });
    // The engine itself terminates at maxTicks via end-condition; ticks may equal maxTicks.
    expect(result.state.tick).toBeLessThanOrEqual(5);
    expect(result.state.status).toBe('finished');
  });

  it('produces deterministic match hashes across two identical runs', async () => {
    const map = buildBotTestMap();
    const buildRun = async () => {
      const config = buildBotTestMatchConfig({
        mapId: map.id,
        mapVersion: map.version,
        seed: 4,
        maxTicks: 80,
      });
      const providers = new Map<string, ActionProvider>([
        ['alpha', new RandomBot({ seed: 100 })],
        ['bravo', new RandomBot({ seed: 200 })],
      ]);
      return runBotMatch({ config, map, providers });
    };
    const left = await buildRun();
    const right = await buildRun();
    expect(hashMatchState(left.state)).toBe(hashMatchState(right.state));
    expect(left.events).toEqual(right.events);
  });

  it('catches provider errors and substitutes the fallback action', async () => {
    const map = buildBotTestMap();
    const config = buildBotTestMatchConfig({
      mapId: map.id,
      mapVersion: map.version,
      seed: 1,
      maxTicks: 3,
    });
    const providers = new Map<string, ActionProvider>([
      ['alpha', new ThrowingBot()],
      ['bravo', new StaticBot()],
    ]);
    const result = await runBotMatch({ config, map, providers });
    expect(result.providerErrors).toBeGreaterThan(0);
    expect(result.schemaViolations).toBe(0);
  });

  it('uses surfaced provider fallback actions while counting provider errors', async () => {
    const map = buildBotTestMap();
    const config = buildBotTestMatchConfig({
      mapId: map.id,
      mapVersion: map.version,
      seed: 1,
      maxTicks: 1,
    });
    const providers = new Map<string, ActionProvider>([
      ['alpha', new ThrowingFallbackBot()],
      ['bravo', new StaticBot()],
    ]);
    const result = await runBotMatch({ config, map, providers });
    expect(result.providerErrors).toBe(1);
    expect(result.schemaViolations).toBe(0);
    expect(result.ticks[0]?.inputs.find((input) => input.contenderId === 'alpha')?.action).toEqual({
      schemaVersion: SCHEMA_VERSION,
      type: 'turn',
      degrees: 90,
    });
  });

  it('times out providers and substitutes the fallback action', async () => {
    const map = buildBotTestMap();
    const config = {
      ...buildBotTestMatchConfig({
        mapId: map.id,
        mapVersion: map.version,
        seed: 1,
        maxTicks: 1,
      }),
      actionTimeoutMs: 1,
    };
    const slowBot = new NeverResolvingBot();
    const providers = new Map<string, ActionProvider>([
      ['alpha', slowBot],
      ['bravo', new StaticBot()],
    ]);

    const result = await runBotMatch({ config, map, providers });

    expect(result.timeouts).toBe(1);
    expect(result.providerErrors).toBe(0);
    expect(slowBot.aborted).toBe(true);
    expect(result.ticks[0]?.latencyMsByContenderId.get('alpha')).toBe(1);
    expect(result.ticks[0]?.inputs.find((input) => input.contenderId === 'alpha')?.action).toEqual(
      noopAction(),
    );
  });

  it('repeats the last valid action when configured as the fallback policy', async () => {
    const map = buildBotTestMap();
    const config = {
      ...buildBotTestMatchConfig({
        mapId: map.id,
        mapVersion: map.version,
        seed: 1,
        maxTicks: 2,
      }),
      invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'repeat-last-valid' as const },
    };
    const providers = new Map<string, ActionProvider>([
      ['alpha', new InvalidAfterValidBot()],
      ['bravo', new StaticBot()],
    ]);

    const result = await runBotMatch({ config, map, providers });

    expect(result.schemaViolations).toBe(1);
    expect(result.ticks[0]?.inputs.find((input) => input.contenderId === 'alpha')?.action).toEqual({
      schemaVersion: SCHEMA_VERSION,
      type: 'move',
      direction: { x: 1, y: 0 },
    });
    expect(result.ticks[1]?.inputs.find((input) => input.contenderId === 'alpha')?.action).toEqual({
      schemaVersion: SCHEMA_VERSION,
      type: 'move',
      direction: { x: 1, y: 0 },
    });
  });

  it('uses noop for repeat-last-valid when no prior valid action exists', async () => {
    const map = buildBotTestMap();
    const config = {
      ...buildBotTestMatchConfig({
        mapId: map.id,
        mapVersion: map.version,
        seed: 1,
        maxTicks: 1,
      }),
      invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'repeat-last-valid' as const },
    };
    const providers = new Map<string, ActionProvider>([
      ['alpha', new InvalidFirstBot()],
      ['bravo', new StaticBot()],
    ]);

    const result = await runBotMatch({ config, map, providers });

    expect(result.schemaViolations).toBe(1);
    expect(result.ticks[0]?.inputs.find((input) => input.contenderId === 'alpha')?.action).toEqual(
      noopAction(),
    );
  });

  it('throws when a contender has no registered provider', async () => {
    const map = buildBotTestMap();
    const config = buildBotTestMatchConfig({
      mapId: map.id,
      mapVersion: map.version,
      seed: 1,
    });
    const providers = new Map<string, ActionProvider>([['alpha', new StaticBot()]]);
    await expect(runBotMatch({ config, map, providers })).rejects.toThrow(
      /No ActionProvider registered for contender bravo/,
    );
  });
});
