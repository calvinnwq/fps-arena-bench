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
import { findUnsafeStrings } from './redaction.js';
import { buildReplayTestMap, buildReplayTestMatchConfig } from './test-fixtures.js';
import { buildResultSummary, type FinalStateSnapshot } from './writer.js';

const noop = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

const runRecordedMatch = (
  options: {
    readonly maxTicks?: number;
    readonly displayName?: string;
    readonly seed?: number;
  } = {},
) => {
  const map = buildReplayTestMap();
  const config = buildReplayTestMatchConfig({
    mapId: map.id,
    mapVersion: map.version,
    maxTicks: options.maxTicks ?? 4,
    seed: options.seed ?? 1,
    ...(options.displayName !== undefined
      ? {
          contenders: [
            { id: 'alpha', adapterId: 'mock-bot', displayName: options.displayName },
            { id: 'bravo', adapterId: 'mock-bot', displayName: 'Bravo' },
          ],
        }
      : {}),
  });
  const state = createMatchState({ config, map });
  const recorder = new MatchRecorder({
    matchId: config.id,
    config,
    map,
    initialPreTickHash: hashMatchState(state),
    timeoutBudgetMs: config.actionTimeoutMs,
  });

  for (let tick = 0; tick < (options.maxTicks ?? 4); tick += 1) {
    const inputs: AcceptedActionInput[] = state.players
      .filter((player) => player.alive)
      .map((player) => ({ contenderId: player.contenderId, action: noop() }));
    const beforeTick = state.tick;
    const result = applyTick(state, inputs);
    const latencies = new Map(inputs.map((input, index) => [input.contenderId, 10 + index * 2]));
    recorder.recordTick({ tick: beforeTick, inputs, result, latencyMsByContenderId: latencies });
  }

  return { config, map, state, recorder };
};

describe('buildResultSummary', () => {
  const baseStats = {
    kills: 0,
    deaths: 0,
    damageDealt: 0,
    damageTaken: 0,
    survivalTicks: 0,
    pickupsCollected: 0,
  };

  it('places the engine winner at rank 1 even with worse score tiebreak', () => {
    const config = buildReplayTestMatchConfig();
    const state: FinalStateSnapshot = {
      tick: 10,
      winner: 'bravo',
      score: { alpha: 3, bravo: 1 },
      stats: { alpha: baseStats, bravo: baseStats },
      aliveByContenderId: { alpha: false, bravo: true },
    };
    const summary = buildResultSummary({
      matchId: 'match-1',
      config,
      state,
      latenciesMs: [],
      reliability: {
        invalidJson: 0,
        schemaFailures: 0,
        repairAttempts: 0,
        repairSuccesses: 0,
        timeouts: 0,
        fallbackActions: 0,
      },
      timeoutBudgetMs: 1_000,
    });
    expect(summary.placements[0]?.contenderId).toBe('bravo');
    expect(summary.winner).toBe('bravo');
    expect(summary.placements.map((entry) => entry.rank)).toEqual([1, 2]);
  });

  it('produces contiguous unique ranks even on tie', () => {
    const config = buildReplayTestMatchConfig();
    const state: FinalStateSnapshot = {
      tick: 10,
      winner: null,
      score: { alpha: 0, bravo: 0 },
      stats: { alpha: baseStats, bravo: baseStats },
      aliveByContenderId: { alpha: true, bravo: true },
    };
    const summary = buildResultSummary({
      matchId: 'match-1',
      config,
      state,
      latenciesMs: [],
      reliability: {
        invalidJson: 0,
        schemaFailures: 0,
        repairAttempts: 0,
        repairSuccesses: 0,
        timeouts: 0,
        fallbackActions: 0,
      },
      timeoutBudgetMs: 1_000,
    });
    const ranks = summary.placements.map((entry) => entry.rank).sort();
    expect(ranks).toEqual([1, 2]);
  });

  it('computes latency p50 <= p95 and timeout budget passthrough', () => {
    const config = buildReplayTestMatchConfig();
    const state: FinalStateSnapshot = {
      tick: 4,
      winner: 'alpha',
      score: { alpha: 1, bravo: 0 },
      stats: { alpha: baseStats, bravo: baseStats },
      aliveByContenderId: { alpha: true, bravo: false },
    };
    const summary = buildResultSummary({
      matchId: 'match-1',
      config,
      state,
      latenciesMs: [10, 12, 14, 16, 200],
      reliability: {
        invalidJson: 0,
        schemaFailures: 0,
        repairAttempts: 0,
        repairSuccesses: 0,
        timeouts: 0,
        fallbackActions: 0,
      },
      timeoutBudgetMs: 1_000,
    });
    expect(summary.latency.p50Ms).toBeLessThanOrEqual(summary.latency.p95Ms);
    expect(summary.latency.timeoutBudgetMs).toBe(1_000);
    expect(summary.latency.averageMs).toBeCloseTo((10 + 12 + 14 + 16 + 200) / 5, 6);
  });
});

describe('buildReplaySafeArtifact', () => {
  it('contains accepted actions, events, and per-tick state hashes', () => {
    const { recorder, state } = runRecordedMatch({ maxTicks: 3 });
    const artifact = recorder.build({ state });
    expect(artifact.acceptedActions.length).toBeGreaterThan(0);
    expect(artifact.stateHashes.length).toBe(4); // tick 0..3
    expect(artifact.stateHashes[0]?.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(artifact.events.some((event) => event.type === 'noop')).toBe(true);
  });

  it('has zero unsafe strings in a normal artifact', () => {
    const { recorder, state } = runRecordedMatch();
    const artifact = recorder.build({ state });
    const matches = findUnsafeStrings(artifact);
    expect(matches).toEqual([]);
  });

  it('rejects artifacts whose config metadata leaks an absolute path', () => {
    const { recorder, state } = runRecordedMatch({
      displayName: 'Alpha (cwd=/Users/alice/secret)',
    });
    expect(() => recorder.build({ state })).toThrow(/unsafe material/);
  });
});
