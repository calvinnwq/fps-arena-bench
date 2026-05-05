import {
  applyTick,
  createMatchState,
  hashMatchState,
  type AcceptedActionInput,
} from '@fps-arena-bench/core';
import { MatchRecorder } from '@fps-arena-bench/replay';
import type { Action, MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PLAYER_SPEED,
  PLAYER_MAX_SPEED,
  PLAYER_MIN_SPEED,
  ReplayPlayer,
  type ReplayPlayerSnapshot,
} from './player.js';
import { buildReplayTimeline, type ReplayTimeline } from './timeline.js';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'player-test-arena',
  version: '0.1.0',
  width: 10,
  height: 10,
  spawns: [
    { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 5 }, headingDegrees: 0 },
    { id: 'bravo-spawn', contenderSlot: 1, position: { x: 8, y: 5 }, headingDegrees: 180 },
  ],
  walls: [],
  pickups: [],
  symmetry: { kind: 'none' },
});

const buildTestConfig = (maxTicks = 6): MatchConfig => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'player-test-match',
  rulesetVersion: 'ruleset.v0.1',
  map: { id: 'player-test-arena', version: '0.1.0', hash: VALID_HASH },
  seed: 1,
  maxTicks,
  contenders: [
    { id: 'alpha', adapterId: 'mock-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'mock-bot', displayName: 'Bravo' },
  ],
  actionTimeoutMs: 1_000,
  invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
  capture: { safeReplay: true, privateDebug: false },
});

const noop = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

const buildTimeline = (maxTicks = 6): ReplayTimeline => {
  const map = buildTestMap();
  const config = buildTestConfig(maxTicks);
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
      .filter((p) => p.alive)
      .map((p) => ({ contenderId: p.contenderId, action: noop() }));
    const beforeTick = state.tick;
    const result = applyTick(state, inputs);
    recorder.recordTick({ tick: beforeTick, inputs, result });
    if (state.status === 'finished') {
      break;
    }
  }
  const artifact = recorder.build({ state });
  return buildReplayTimeline(artifact);
};

describe('ReplayPlayer', () => {
  describe('initial state', () => {
    it('starts paused at tick 0 with default speed and the first frame', () => {
      const timeline = buildTimeline();
      const player = new ReplayPlayer(timeline);
      const snap = player.getSnapshot();
      expect(snap.tick).toBe(0);
      expect(snap.isPlaying).toBe(false);
      expect(snap.speed).toBe(DEFAULT_PLAYER_SPEED);
      expect(snap.atStart).toBe(true);
      expect(snap.atEnd).toBe(false);
      expect(snap.frame).toBe(timeline.frames[0]);
    });

    it('honors initialTick and initialSpeed (clamped)', () => {
      const timeline = buildTimeline();
      const last = timeline.frames.length - 1;
      const player = new ReplayPlayer(timeline, {
        initialTick: 9_999,
        initialSpeed: 9_999,
      });
      const snap = player.getSnapshot();
      expect(snap.tick).toBe(last);
      expect(snap.atEnd).toBe(true);
      expect(snap.speed).toBe(PLAYER_MAX_SPEED);
    });

    it('clamps negative initialTick to 0 and tiny initialSpeed to PLAYER_MIN_SPEED', () => {
      const timeline = buildTimeline();
      const player = new ReplayPlayer(timeline, { initialTick: -42, initialSpeed: 0.0001 });
      const snap = player.getSnapshot();
      expect(snap.tick).toBe(0);
      expect(snap.speed).toBe(PLAYER_MIN_SPEED);
    });

    it('rejects non-finite options', () => {
      const timeline = buildTimeline();
      expect(() => new ReplayPlayer(timeline, { initialTick: Number.NaN })).toThrow(RangeError);
      expect(() => new ReplayPlayer(timeline, { initialSpeed: Number.POSITIVE_INFINITY })).toThrow(
        RangeError,
      );
    });

    it('rejects an empty timeline defensively', () => {
      const timeline = buildTimeline();
      const empty: ReplayTimeline = { ...timeline, frames: [] };
      expect(() => new ReplayPlayer(empty)).toThrow(RangeError);
    });
  });

  describe('play / pause / toggle', () => {
    it('play() sets isPlaying=true and pause() sets it false', () => {
      const player = new ReplayPlayer(buildTimeline());
      player.play();
      expect(player.getSnapshot().isPlaying).toBe(true);
      player.pause();
      expect(player.getSnapshot().isPlaying).toBe(false);
    });

    it('togglePlayPause flips isPlaying', () => {
      const player = new ReplayPlayer(buildTimeline());
      player.togglePlayPause();
      expect(player.getSnapshot().isPlaying).toBe(true);
      player.togglePlayPause();
      expect(player.getSnapshot().isPlaying).toBe(false);
    });

    it('does not start playing when already at the end', () => {
      const timeline = buildTimeline();
      const last = timeline.frames.length - 1;
      const player = new ReplayPlayer(timeline, { initialTick: last });
      player.play();
      expect(player.getSnapshot().isPlaying).toBe(false);
    });
  });

  describe('step', () => {
    it('step() advances by one tick and stays paused', () => {
      const player = new ReplayPlayer(buildTimeline());
      player.step();
      const snap = player.getSnapshot();
      expect(snap.tick).toBe(1);
      expect(snap.isPlaying).toBe(false);
      expect(snap.atStart).toBe(false);
    });

    it('step(n) advances by n and step(-n) rewinds', () => {
      const player = new ReplayPlayer(buildTimeline());
      player.step(3);
      expect(player.getSnapshot().tick).toBe(3);
      player.step(-2);
      expect(player.getSnapshot().tick).toBe(1);
    });

    it('clamps at start and end and auto-pauses', () => {
      const timeline = buildTimeline();
      const last = timeline.frames.length - 1;
      const player = new ReplayPlayer(timeline);
      player.play();
      player.step(last + 5);
      expect(player.getSnapshot().tick).toBe(last);
      expect(player.getSnapshot().atEnd).toBe(true);
      expect(player.getSnapshot().isPlaying).toBe(false);
      player.step(-9999);
      expect(player.getSnapshot().tick).toBe(0);
      expect(player.getSnapshot().atStart).toBe(true);
    });

    it('rejects non-integer or non-finite delta', () => {
      const player = new ReplayPlayer(buildTimeline());
      expect(() => player.step(1.5)).toThrow(RangeError);
      expect(() => player.step(Number.NaN)).toThrow(RangeError);
    });
  });

  describe('seek', () => {
    it('seek(t) sets the tick exactly and pauses', () => {
      const player = new ReplayPlayer(buildTimeline());
      player.play();
      player.seek(2);
      const snap = player.getSnapshot();
      expect(snap.tick).toBe(2);
      expect(snap.isPlaying).toBe(false);
    });

    it('clamps out-of-range targets', () => {
      const timeline = buildTimeline();
      const last = timeline.frames.length - 1;
      const player = new ReplayPlayer(timeline);
      player.seek(-5);
      expect(player.getSnapshot().tick).toBe(0);
      player.seek(last + 5);
      expect(player.getSnapshot().tick).toBe(last);
    });

    it('rejects non-finite or non-integer values', () => {
      const player = new ReplayPlayer(buildTimeline());
      expect(() => player.seek(Number.NaN)).toThrow(RangeError);
      expect(() => player.seek(1.5)).toThrow(RangeError);
    });
  });

  describe('setSpeed', () => {
    it('clamps to [PLAYER_MIN_SPEED, PLAYER_MAX_SPEED]', () => {
      const player = new ReplayPlayer(buildTimeline());
      player.setSpeed(PLAYER_MAX_SPEED * 100);
      expect(player.getSnapshot().speed).toBe(PLAYER_MAX_SPEED);
      player.setSpeed(0.000001);
      expect(player.getSnapshot().speed).toBe(PLAYER_MIN_SPEED);
    });

    it('rejects non-positive or non-finite values', () => {
      const player = new ReplayPlayer(buildTimeline());
      expect(() => player.setSpeed(0)).toThrow(RangeError);
      expect(() => player.setSpeed(-1)).toThrow(RangeError);
      expect(() => player.setSpeed(Number.NaN)).toThrow(RangeError);
    });
  });

  describe('reset', () => {
    it('returns to tick 0, paused, default speed', () => {
      const player = new ReplayPlayer(buildTimeline());
      player.play();
      player.step(3);
      player.setSpeed(PLAYER_MAX_SPEED);
      player.reset();
      const snap = player.getSnapshot();
      expect(snap.tick).toBe(0);
      expect(snap.isPlaying).toBe(false);
      expect(snap.speed).toBe(DEFAULT_PLAYER_SPEED);
      expect(snap.atStart).toBe(true);
    });
  });

  describe('advance', () => {
    it('does nothing when paused', () => {
      const player = new ReplayPlayer(buildTimeline());
      player.advance(10_000);
      expect(player.getSnapshot().tick).toBe(0);
    });

    it('advances floor(speed * deltaMs / 1000) ticks when playing', () => {
      const player = new ReplayPlayer(buildTimeline(), { initialSpeed: 10 });
      player.play();
      player.advance(250);
      expect(player.getSnapshot().tick).toBe(2);
    });

    it('preserves fractional progress across calls', () => {
      const player = new ReplayPlayer(buildTimeline(), { initialSpeed: 10 });
      player.play();
      player.advance(60);
      expect(player.getSnapshot().tick).toBe(0);
      player.advance(60);
      expect(player.getSnapshot().tick).toBe(1);
    });

    it('auto-pauses when reaching the end of the timeline', () => {
      const timeline = buildTimeline();
      const last = timeline.frames.length - 1;
      const player = new ReplayPlayer(timeline, { initialSpeed: PLAYER_MAX_SPEED });
      player.play();
      player.advance(60_000);
      const snap = player.getSnapshot();
      expect(snap.tick).toBe(last);
      expect(snap.isPlaying).toBe(false);
      expect(snap.atEnd).toBe(true);
    });

    it('rejects negative or non-finite deltaMs', () => {
      const player = new ReplayPlayer(buildTimeline());
      expect(() => player.advance(-1)).toThrow(RangeError);
      expect(() => player.advance(Number.NaN)).toThrow(RangeError);
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on state changes and respects unsubscribe', () => {
      const player = new ReplayPlayer(buildTimeline());
      const events: ReplayPlayerSnapshot[] = [];
      const unsubscribe = player.subscribe((snap) => events.push(snap));

      player.play();
      player.step();
      player.pause();
      player.seek(2);

      expect(events.map((e) => e.tick)).toEqual([0, 1, 1, 2]);
      expect(events[0]?.isPlaying).toBe(true);
      expect(events[2]?.isPlaying).toBe(false);

      unsubscribe();
      player.step();
      // No additional event after unsubscribe.
      expect(events).toHaveLength(4);
    });

    it('does not fire when state is unchanged (idempotent pause / no-op step)', () => {
      const player = new ReplayPlayer(buildTimeline());
      const events: ReplayPlayerSnapshot[] = [];
      player.subscribe((snap) => events.push(snap));
      player.pause(); // already paused
      player.step(0); // zero-step is a no-op
      expect(events).toHaveLength(0);
    });
  });
});
