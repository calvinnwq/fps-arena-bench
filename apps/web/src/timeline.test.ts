import {
  applyTick,
  createMatchState,
  hashMatchState,
  type AcceptedActionInput,
} from '@fps-arena-bench/core';
import { MatchRecorder, parseReplaySafeArtifact } from '@fps-arena-bench/replay';
import type { Action, MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it } from 'vitest';

import { ReplayTimelineError, buildReplayTimeline, frameAtTick } from './timeline.js';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'timeline-test-arena',
  version: '0.1.0',
  width: 10,
  height: 10,
  spawns: [
    { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 5 }, headingDegrees: 0 },
    { id: 'bravo-spawn', contenderSlot: 1, position: { x: 8, y: 5 }, headingDegrees: 180 },
  ],
  walls: [],
  pickups: [
    {
      id: 'health-1',
      type: 'health',
      position: { x: 5, y: 5 },
      respawnTicks: 5,
    },
  ],
  symmetry: { kind: 'none' },
});

const buildTestConfig = (overrides: { readonly maxTicks?: number } = {}): MatchConfig => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'timeline-test-match',
  rulesetVersion: 'ruleset.v0.1',
  map: {
    id: 'timeline-test-arena',
    version: '0.1.0',
    hash: VALID_HASH,
  },
  seed: 1,
  maxTicks: overrides.maxTicks ?? 5,
  contenders: [
    { id: 'alpha', adapterId: 'mock-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'mock-bot', displayName: 'Bravo' },
  ],
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

const noop = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

interface BuildArtifactOptions {
  readonly maxTicks?: number;
  readonly forceShoot?: boolean;
}

const buildArtifact = (options: BuildArtifactOptions = {}) => {
  const map = buildTestMap();
  const maxTicks = options.maxTicks ?? 5;
  const config = buildTestConfig({ maxTicks });
  const state = createMatchState({ config, map });
  const recorder = new MatchRecorder({
    matchId: config.id,
    config,
    map,
    initialPreTickHash: hashMatchState(state),
    timeoutBudgetMs: config.actionTimeoutMs,
  });

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const inputs: AcceptedActionInput[] = state.players
      .filter((player) => player.alive)
      .map((player) => ({
        contenderId: player.contenderId,
        action: player.contenderId === 'alpha' ? moveRight() : moveLeft(),
      }));
    const beforeTick = state.tick;
    const result = applyTick(state, inputs);
    recorder.recordTick({ tick: beforeTick, inputs, result });
    if (state.status === 'finished') {
      break;
    }
  }

  return { config, map, artifact: recorder.build({ state }), finalState: state };
};

describe('buildReplayTimeline', () => {
  it('produces an initial frame at tick 0 reflecting spawn state', () => {
    const { artifact } = buildArtifact();
    const timeline = buildReplayTimeline(artifact);

    expect(timeline.matchId).toBe(artifact.matchId);
    expect(timeline.frames.length).toBe(artifact.result.ticksElapsed + 1);
    const initial = timeline.frames[0]!;
    expect(initial.tick).toBe(0);
    expect(initial.events).toEqual([]);
    expect(initial.status).toBe('in-progress');
    expect(initial.winner).toBeNull();
    expect(initial.players).toHaveLength(2);
    const alpha = initial.players.find((p) => p.contenderId === 'alpha')!;
    expect(alpha.x).toBe(2);
    expect(alpha.y).toBe(5);
    expect(alpha.headingDegrees).toBe(0);
    expect(alpha.alive).toBe(true);
    expect(alpha.health).toBeGreaterThan(0);
  });

  it('advances frames deterministically tick-by-tick with engine events', () => {
    const { artifact } = buildArtifact();
    const timeline = buildReplayTimeline(artifact);

    expect(timeline.frames.length).toBeGreaterThanOrEqual(2);
    const firstAdvance = timeline.frames[1]!;
    expect(firstAdvance.tick).toBe(1);
    expect(firstAdvance.events.length).toBeGreaterThan(0);
    const moves = firstAdvance.events.filter((event) => event.type === 'move');
    expect(moves.length).toBeGreaterThan(0);

    // Players advanced toward each other along x: alpha right, bravo left.
    const alphaT0 = timeline.frames[0]!.players.find((p) => p.contenderId === 'alpha')!;
    const alphaT1 = firstAdvance.players.find((p) => p.contenderId === 'alpha')!;
    expect(alphaT1.x).toBeGreaterThan(alphaT0.x);
    const bravoT0 = timeline.frames[0]!.players.find((p) => p.contenderId === 'bravo')!;
    const bravoT1 = firstAdvance.players.find((p) => p.contenderId === 'bravo')!;
    expect(bravoT1.x).toBeLessThan(bravoT0.x);
  });

  it('reports the same final winner and tick count as the artifact result', () => {
    const { artifact } = buildArtifact();
    const timeline = buildReplayTimeline(artifact);
    const final = timeline.frames[timeline.frames.length - 1]!;
    expect(final.tick).toBe(artifact.result.ticksElapsed);
    expect(final.winner).toBe(artifact.result.winner);
  });

  it('emits a pickup-collected event when a player steps onto a pickup', () => {
    // Alpha at x=2,y=5 walking right reaches x=5,y=5 (the pickup) at tick 3.
    const { artifact } = buildArtifact({ maxTicks: 4 });
    const timeline = buildReplayTimeline(artifact);
    const pickupEvents = timeline.frames.flatMap((frame) =>
      frame.events.filter((event) => event.type === 'pickup-collected'),
    );
    expect(pickupEvents.length).toBeGreaterThan(0);

    // The frame containing that event must show the pickup as unavailable.
    const collectedFrame = timeline.frames.find((frame) =>
      frame.events.some((event) => event.type === 'pickup-collected'),
    )!;
    const pickupAfter = collectedFrame.pickups.find((p) => p.id === 'health-1')!;
    expect(pickupAfter.available).toBe(false);
  });

  it('produces identical frames when invoked twice (deterministic)', () => {
    const { artifact } = buildArtifact();
    const a = buildReplayTimeline(artifact);
    const b = buildReplayTimeline(artifact);
    expect(JSON.stringify(b.frames)).toBe(JSON.stringify(a.frames));
  });

  it('round-trips through JSON serialization', () => {
    const { artifact } = buildArtifact();
    const serialized = JSON.stringify(artifact);
    const fromJson = buildReplayTimeline(serialized);
    const fromObject = buildReplayTimeline(parseReplaySafeArtifact(serialized));
    expect(JSON.stringify(fromJson.frames)).toBe(JSON.stringify(fromObject.frames));
  });

  it('rejects malformed artifacts via schema validation when given a string', () => {
    const { artifact } = buildArtifact();
    const broken = { ...artifact, matchId: '' };
    expect(() => buildReplayTimeline(JSON.stringify(broken))).toThrow();
  });

  it('frameAtTick returns the matching frame and rejects out-of-range ticks', () => {
    const { artifact } = buildArtifact();
    const timeline = buildReplayTimeline(artifact);

    expect(frameAtTick(timeline, 0).tick).toBe(0);
    const last = timeline.frames.length - 1;
    expect(frameAtTick(timeline, last).tick).toBe(last);

    expect(() => frameAtTick(timeline, -1)).toThrow(RangeError);
    expect(() => frameAtTick(timeline, timeline.frames.length)).toThrow(RangeError);
    expect(() => frameAtTick(timeline, 1.5)).toThrow(RangeError);
  });

  it('throws ReplayTimelineError when ticksElapsed exceeds engine completion', () => {
    const { artifact } = buildArtifact({ maxTicks: 3 });
    const tampered = JSON.parse(JSON.stringify(artifact));
    tampered.result.ticksElapsed = artifact.result.ticksElapsed + 2;
    const parsed = parseReplaySafeArtifact(tampered);
    expect(() => buildReplayTimeline(parsed)).toThrow(ReplayTimelineError);
  });
});
