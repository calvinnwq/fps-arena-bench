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
