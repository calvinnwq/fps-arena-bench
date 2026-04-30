import {
  applyTick,
  createMatchState,
  hashMatchState,
  type AcceptedActionInput,
} from '@fps-arena-bench/core';
import type { Action } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it } from 'vitest';

import { MatchRecorder } from './recorder.js';
import { buildReplayTestMap, buildReplayTestMatchConfig } from './test-fixtures.js';

const noop = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });
const moveRight = (): Action => ({
  schemaVersion: SCHEMA_VERSION,
  type: 'move',
  direction: { x: 1, y: 0 },
});

describe('MatchRecorder', () => {
  it('builds a schema-valid artifact when given engine outputs', () => {
    const map = buildReplayTestMap();
    const config = buildReplayTestMatchConfig({
      mapId: map.id,
      mapVersion: map.version,
      maxTicks: 4,
    });
    const state = createMatchState({ config, map });
    const recorder = new MatchRecorder({
      matchId: config.id,
      config,
      map,
      initialPreTickHash: hashMatchState(state),
      timeoutBudgetMs: config.actionTimeoutMs,
    });

    for (let tick = 0; tick < 4; tick += 1) {
      const inputs: AcceptedActionInput[] = state.players
        .filter((player) => player.alive)
        .map((player) => ({ contenderId: player.contenderId, action: noop() }));
      const beforeTick = state.tick;
      const result = applyTick(state, inputs);
      const latencies = new Map(inputs.map((input, index) => [input.contenderId, 5 + index]));
      recorder.recordTick({ tick: beforeTick, inputs, result, latencyMsByContenderId: latencies });
    }

    const artifact = recorder.build({ state });
    expect(artifact.matchId).toBe(config.id);
    expect(artifact.acceptedActions.length).toBe(8);
    expect(artifact.stateHashes.length).toBe(5);
    expect(artifact.stateHashes[0]?.tick).toBe(0);
    expect(artifact.stateHashes.at(-1)?.tick).toBe(4);
    expect(artifact.result.ticksElapsed).toBe(4);
    expect(artifact.result.placements.map((entry) => entry.rank).sort()).toEqual([1, 2]);
  });

  it('records snapshots at the configured interval', () => {
    const map = buildReplayTestMap();
    const config = buildReplayTestMatchConfig({
      mapId: map.id,
      mapVersion: map.version,
      maxTicks: 6,
    });
    const state = createMatchState({ config, map });
    const recorder = new MatchRecorder({
      matchId: config.id,
      config,
      map,
      initialPreTickHash: hashMatchState(state),
      timeoutBudgetMs: config.actionTimeoutMs,
      snapshotIntervalTicks: 2,
    });

    for (let tick = 0; tick < 5; tick += 1) {
      const inputs = state.players
        .filter((player) => player.alive)
        .map((player) => ({ contenderId: player.contenderId, action: noop() }));
      const beforeTick = state.tick;
      const result = applyTick(state, inputs);
      recorder.recordTick({ tick: beforeTick, inputs, result });
    }

    const artifact = recorder.build({ state });
    expect(artifact.snapshots).toBeDefined();
    expect(artifact.snapshots?.map((entry) => entry.tick)).toEqual([0, 2, 4]);
  });

  it('rejects building twice', () => {
    const map = buildReplayTestMap();
    const config = buildReplayTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const state = createMatchState({ config, map });
    const recorder = new MatchRecorder({
      matchId: config.id,
      config,
      map,
      initialPreTickHash: hashMatchState(state),
      timeoutBudgetMs: config.actionTimeoutMs,
    });
    const inputs = state.players
      .filter((player) => player.alive)
      .map((player) => ({ contenderId: player.contenderId, action: moveRight() }));
    const beforeTick = state.tick;
    const result = applyTick(state, inputs);
    recorder.recordTick({ tick: beforeTick, inputs, result });
    recorder.build({ state });
    expect(() => recorder.recordTick({ tick: state.tick, inputs: [], result })).toThrow(
      /artifact has been built/,
    );
  });
});
