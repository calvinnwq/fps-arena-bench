import {
  applyTick,
  createMatchState,
  hashMatchState,
  type AcceptedActionInput,
  type TickEvent,
} from '@fps-arena-bench/core';
import { MatchRecorder } from '@fps-arena-bench/replay';
import type { Action, MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it } from 'vitest';

import { buildReplayTimeline } from './timeline.js';
import { buildReplaySummary, formatTickEvent, isKeyTickEvent } from './summary.js';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'summary-test-arena',
  version: '0.1.0',
  width: 10,
  height: 10,
  spawns: [
    { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 5 }, headingDegrees: 0 },
    { id: 'bravo-spawn', contenderSlot: 1, position: { x: 8, y: 5 }, headingDegrees: 180 },
  ],
  walls: [],
  pickups: [{ id: 'health-1', type: 'health', position: { x: 5, y: 5 }, respawnTicks: 5 }],
  symmetry: { kind: 'none' },
});

interface BuildConfigOptions {
  readonly maxTicks?: number;
  readonly contenders?: ReadonlyArray<{
    readonly id: string;
    readonly adapterId: string;
    readonly displayName?: string;
  }>;
}

const buildTestConfig = (options: BuildConfigOptions = {}): MatchConfig => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'summary-test-match',
  rulesetVersion: 'ruleset.v0.1',
  map: { id: 'summary-test-arena', version: '0.1.0', hash: VALID_HASH },
  seed: 1,
  maxTicks: options.maxTicks ?? 5,
  contenders: (
    options.contenders ?? [
      { id: 'alpha', adapterId: 'mock-bot', displayName: 'Alpha' },
      { id: 'bravo', adapterId: 'mock-bot', displayName: 'Bravo' },
    ]
  ).map((entry) => ({
    id: entry.id,
    adapterId: entry.adapterId,
    ...(entry.displayName !== undefined ? { displayName: entry.displayName } : {}),
  })),
  actionTimeoutMs: 1_000,
  invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
  capture: { safeReplay: true, privateDebug: false },
});

const moveRight = (): Action => ({
  schemaVersion: SCHEMA_VERSION,
  type: 'move',
  direction: { x: 1, y: 0 },
});

const moveLeft = (): Action => ({
  schemaVersion: SCHEMA_VERSION,
  type: 'move',
  direction: { x: -1, y: 0 },
});

interface BuildArtifactOptions extends BuildConfigOptions {}

const buildArtifact = (options: BuildArtifactOptions = {}) => {
  const map = buildTestMap();
  const config = buildTestConfig(options);
  const state = createMatchState({ config, map });
  const recorder = new MatchRecorder({
    matchId: config.id,
    config,
    map,
    initialPreTickHash: hashMatchState(state),
    timeoutBudgetMs: config.actionTimeoutMs,
  });

  for (let tick = 0; tick < config.maxTicks; tick += 1) {
    const inputs: AcceptedActionInput[] = state.players
      .filter((player) => player.alive)
      .map((player) => ({
        contenderId: player.contenderId,
        action: player.contenderId === 'alpha' ? moveRight() : moveLeft(),
      }));
    const beforeTick = state.tick;
    const result = applyTick(state, inputs);
    recorder.recordTick({ tick: beforeTick, inputs, result });
    if (state.status === 'finished') break;
  }

  return { config, map, artifact: recorder.build({ state }), finalState: state };
};

describe('buildReplaySummary', () => {
  it('surfaces matchId, mapId, durationTicks, status, endReason from the timeline', () => {
    const { artifact } = buildArtifact({ maxTicks: 4 });
    const timeline = buildReplayTimeline(artifact);
    const summary = buildReplaySummary(timeline);

    expect(summary.matchId).toBe(artifact.matchId);
    expect(summary.mapId).toBe(artifact.map.id);
    expect(summary.mapVersion).toBe(artifact.map.version);
    expect(summary.durationTicks).toBe(artifact.result.ticksElapsed);
    const finalFrame = timeline.frames[timeline.frames.length - 1]!;
    expect(summary.status).toBe(finalFrame.status);
    expect(summary.endReason).toBe(finalFrame.endReason);
  });

  it('preserves contenderOrder from the config and exposes adapterId per placement', () => {
    const { artifact } = buildArtifact({
      contenders: [
        { id: 'zeta', adapterId: 'adapter-z', displayName: 'Zeta' },
        { id: 'alpha', adapterId: 'adapter-a', displayName: 'Alpha' },
      ],
    });
    const timeline = buildReplayTimeline(artifact);
    const summary = buildReplaySummary(timeline);

    expect(summary.contenderOrder).toEqual(['zeta', 'alpha']);
    const alphaPlacement = summary.placements.find((p) => p.contenderId === 'alpha')!;
    expect(alphaPlacement.adapterId).toBe('adapter-a');
    const zetaPlacement = summary.placements.find((p) => p.contenderId === 'zeta')!;
    expect(zetaPlacement.adapterId).toBe('adapter-z');
  });

  it('sorts placements by ascending rank and tags the rank-1 winner', () => {
    const { artifact } = buildArtifact();
    const timeline = buildReplayTimeline(artifact);
    const summary = buildReplaySummary(timeline);

    expect(summary.placements.length).toBe(artifact.result.placements.length);
    for (let i = 1; i < summary.placements.length; i += 1) {
      expect(summary.placements[i]!.rank).toBeGreaterThan(summary.placements[i - 1]!.rank);
    }
    const winners = summary.placements.filter((p) => p.isWinner);
    if (artifact.result.winner === null) {
      expect(winners).toEqual([]);
      expect(summary.winner).toBeNull();
    } else {
      expect(winners).toHaveLength(1);
      expect(winners[0]!.contenderId).toBe(artifact.result.winner);
      expect(summary.winner?.contenderId).toBe(artifact.result.winner);
    }
  });

  it('uses displayName when present and falls back to contenderId otherwise', () => {
    const { artifact } = buildArtifact({
      contenders: [
        { id: 'alpha', adapterId: 'mock-bot', displayName: 'Alpha One' },
        { id: 'bravo', adapterId: 'mock-bot' },
      ],
    });
    const timeline = buildReplayTimeline(artifact);
    const summary = buildReplaySummary(timeline);

    const alpha = summary.placements.find((p) => p.contenderId === 'alpha')!;
    expect(alpha.displayName).toBe('Alpha One');
    const bravo = summary.placements.find((p) => p.contenderId === 'bravo')!;
    expect(bravo.displayName).toBe('bravo');
  });

  it('exposes per-contender stats from the result summary', () => {
    const { artifact } = buildArtifact({ maxTicks: 4 });
    const timeline = buildReplayTimeline(artifact);
    const summary = buildReplaySummary(timeline);

    for (const placement of summary.placements) {
      const expectedStats = artifact.result.stats[placement.contenderId]!;
      expect(placement.stats).toEqual(expectedStats);
    }
  });

  it('passes through reliability and latency from the result summary', () => {
    const { artifact } = buildArtifact();
    const timeline = buildReplayTimeline(artifact);
    const summary = buildReplaySummary(timeline);

    expect(summary.reliability).toEqual(artifact.result.reliability);
    expect(summary.latency).toEqual(artifact.result.latency);
  });
});

describe('isKeyTickEvent', () => {
  it('recognizes combat, pickup, and match-end events as key', () => {
    const samples: readonly TickEvent[] = [
      {
        type: 'shoot',
        contenderId: 'alpha',
        target: { x: 5, y: 5 },
        hitContenderId: 'bravo',
        damage: 25,
        ammoSpent: 1,
      },
      { type: 'shoot-no-ammo', contenderId: 'alpha' },
      {
        type: 'pickup-collected',
        contenderId: 'alpha',
        pickupId: 'h-1',
        pickupType: 'health',
        amount: 25,
      },
      { type: 'pickup-respawned', pickupId: 'h-1' },
      { type: 'elimination', contenderId: 'bravo', killerContenderId: 'alpha' },
      { type: 'match-ended', winner: 'alpha', reason: 'last-survivor' },
    ];
    for (const sample of samples) {
      expect(isKeyTickEvent(sample)).toBe(true);
    }
  });

  it('treats turn, move, and noop as non-key events', () => {
    const samples: readonly TickEvent[] = [
      { type: 'turn', contenderId: 'alpha', fromHeading: 0, toHeading: 90 },
      {
        type: 'move',
        contenderId: 'alpha',
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
        blocked: false,
      },
      { type: 'noop', contenderId: 'alpha' },
    ];
    for (const sample of samples) {
      expect(isKeyTickEvent(sample)).toBe(false);
    }
  });
});

describe('formatTickEvent', () => {
  const names = { displayNameByContenderId: { alpha: 'Alpha', bravo: 'Bravo' } };

  it('formats a shoot hit with damage and target name', () => {
    const event: TickEvent = {
      type: 'shoot',
      contenderId: 'alpha',
      target: { x: 5, y: 5 },
      hitContenderId: 'bravo',
      damage: 25,
      ammoSpent: 1,
    };
    expect(formatTickEvent(event, names)).toBe('Alpha hit Bravo for 25 damage');
  });

  it('formats a shoot miss', () => {
    const event: TickEvent = {
      type: 'shoot',
      contenderId: 'alpha',
      target: { x: 9, y: 9 },
      hitContenderId: null,
      damage: 0,
      ammoSpent: 1,
    };
    expect(formatTickEvent(event, names)).toBe('Alpha shot and missed');
  });

  it('formats a no-ammo shot', () => {
    const event: TickEvent = { type: 'shoot-no-ammo', contenderId: 'alpha' };
    expect(formatTickEvent(event, names)).toBe('Alpha tried to shoot (no ammo)');
  });

  it('formats a pickup-collected event with type and amount', () => {
    const event: TickEvent = {
      type: 'pickup-collected',
      contenderId: 'alpha',
      pickupId: 'h-1',
      pickupType: 'health',
      amount: 25,
    };
    expect(formatTickEvent(event, names)).toBe('Alpha picked up health (+25)');
  });

  it('formats an elimination with and without a killer', () => {
    const withKiller: TickEvent = {
      type: 'elimination',
      contenderId: 'bravo',
      killerContenderId: 'alpha',
    };
    expect(formatTickEvent(withKiller, names)).toBe('Alpha eliminated Bravo');

    const noKiller: TickEvent = {
      type: 'elimination',
      contenderId: 'bravo',
      killerContenderId: null,
    };
    expect(formatTickEvent(noKiller, names)).toBe('Bravo was eliminated');
  });

  it('formats a match-ended event with the reason and winner', () => {
    const withWinner: TickEvent = {
      type: 'match-ended',
      winner: 'alpha',
      reason: 'last-survivor',
    };
    expect(formatTickEvent(withWinner, names)).toBe('Match ended (last-survivor): Alpha won');

    const noWinner: TickEvent = {
      type: 'match-ended',
      winner: null,
      reason: 'max-ticks-reached',
    };
    expect(formatTickEvent(noWinner, names)).toBe('Match ended (max-ticks-reached): no winner');
  });

  it('falls back to contenderId when no displayName mapping is provided', () => {
    const event: TickEvent = {
      type: 'pickup-collected',
      contenderId: 'gamma',
      pickupId: 'a-1',
      pickupType: 'ammo',
      amount: 10,
    };
    expect(formatTickEvent(event)).toBe('gamma picked up ammo (+10)');
  });
});
