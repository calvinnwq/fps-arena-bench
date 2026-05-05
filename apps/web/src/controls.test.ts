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
  DEFAULT_SPEED_PRESETS,
  buildViewerControlsViewModel,
  formatSpeedLabel,
} from './controls.js';
import { DEFAULT_PLAYER_SPEED } from './player.js';
import { buildReplaySummary } from './summary.js';
import { buildReplayTimeline } from './timeline.js';
import type { ViewerSnapshot } from './viewer.js';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'controls-test-arena',
  version: '0.2.0',
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

const buildTestConfig = (): MatchConfig => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'controls-test-match',
  rulesetVersion: 'ruleset.v0.1',
  map: { id: 'controls-test-arena', version: '0.2.0', hash: VALID_HASH },
  seed: 1,
  maxTicks: 4,
  contenders: [
    { id: 'alpha', adapterId: 'mock-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'mock-bot', displayName: 'Bravo' },
  ],
  actionTimeoutMs: 1_000,
  invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
  capture: { safeReplay: true, privateDebug: false },
});

const noop = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

const buildArtifact = () => {
  const map = buildTestMap();
  const config = buildTestConfig();
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
      .filter((p) => p.alive)
      .map((p) => ({ contenderId: p.contenderId, action: noop() }));
    const beforeTick = state.tick;
    const result = applyTick(state, inputs);
    recorder.recordTick({ tick: beforeTick, inputs, result });
    if (state.status === 'finished') break;
  }
  return recorder.build({ state });
};

const buildReadySnapshot = (overrides: {
  tick: number;
  isPlaying: boolean;
  speed?: number;
}): Extract<ViewerSnapshot, { status: 'ready' }> => {
  const artifact = buildArtifact();
  const timeline = buildReplayTimeline(artifact);
  const summary = buildReplaySummary(timeline);
  const totalTicks = timeline.frames.length - 1;
  const tick = overrides.tick;
  const frame = timeline.frames[tick]!;
  return {
    status: 'ready',
    timeline,
    summary,
    frame,
    tick,
    totalTicks,
    isPlaying: overrides.isPlaying,
    speed: overrides.speed ?? DEFAULT_PLAYER_SPEED,
    atStart: tick === 0,
    atEnd: tick === totalTicks,
  };
};

describe('formatSpeedLabel', () => {
  it('renders integer speeds without decimals', () => {
    expect(formatSpeedLabel(1)).toBe('1x');
    expect(formatSpeedLabel(8)).toBe('8x');
  });

  it('renders fractional speeds with up to two decimals, trimming trailing zeros', () => {
    expect(formatSpeedLabel(0.5)).toBe('0.5x');
    expect(formatSpeedLabel(0.25)).toBe('0.25x');
    expect(formatSpeedLabel(1.5)).toBe('1.5x');
  });
});

describe('buildViewerControlsViewModel', () => {
  it('renders an idle snapshot with all controls disabled and no error/summary', () => {
    const vm = buildViewerControlsViewModel({ status: 'idle' });
    expect(vm.status).toBe('idle');
    expect(vm.statusLabel).toBe('Idle');
    expect(vm.playPauseDisabled).toBe(true);
    expect(vm.playPauseLabel).toBe('Play');
    expect(vm.stepBackDisabled).toBe(true);
    expect(vm.stepForwardDisabled).toBe(true);
    expect(vm.resetDisabled).toBe(true);
    expect(vm.scrubber.disabled).toBe(true);
    expect(vm.scrubber.min).toBe(0);
    expect(vm.scrubber.max).toBe(0);
    expect(vm.scrubber.value).toBe(0);
    expect(vm.tickLabel).toBe('No replay loaded');
    expect(vm.speedDisabled).toBe(true);
    expect(vm.error).toBeNull();
    expect(vm.summary).toBeNull();
    expect(vm.eventFeed).toEqual([]);
  });

  it('renders an error snapshot with redacted message and disabled controls', () => {
    const vm = buildViewerControlsViewModel({
      status: 'error',
      error: { kind: 'invalid-json', message: 'Replay file is not valid JSON.' },
    });
    expect(vm.status).toBe('error');
    expect(vm.statusLabel).toBe('Error');
    expect(vm.playPauseDisabled).toBe(true);
    expect(vm.scrubber.disabled).toBe(true);
    expect(vm.speedDisabled).toBe(true);
    expect(vm.error).toEqual({
      kind: 'invalid-json',
      message: 'Replay file is not valid JSON.',
    });
    expect(vm.summary).toBeNull();
    expect(vm.eventFeed).toEqual([]);
  });

  it('renders a paused ready snapshot at tick 0 with stepBack disabled', () => {
    const snap = buildReadySnapshot({ tick: 0, isPlaying: false });
    const vm = buildViewerControlsViewModel(snap);
    expect(vm.status).toBe('ready');
    expect(vm.statusLabel).toBe('Paused');
    expect(vm.playPauseDisabled).toBe(false);
    expect(vm.playPauseLabel).toBe('Play');
    expect(vm.stepBackDisabled).toBe(true);
    expect(vm.stepForwardDisabled).toBe(false);
    expect(vm.resetDisabled).toBe(true);
    expect(vm.scrubber.disabled).toBe(false);
    expect(vm.scrubber.min).toBe(0);
    expect(vm.scrubber.max).toBe(snap.totalTicks);
    expect(vm.scrubber.value).toBe(0);
    expect(vm.tickLabel).toBe(`Tick 0 / ${snap.totalTicks}`);
    expect(vm.error).toBeNull();
  });

  it('renders a playing ready snapshot mid-timeline with all step controls enabled', () => {
    const snap = buildReadySnapshot({ tick: 2, isPlaying: true });
    const vm = buildViewerControlsViewModel(snap);
    expect(vm.statusLabel).toBe('Playing');
    expect(vm.playPauseLabel).toBe('Pause');
    expect(vm.stepBackDisabled).toBe(false);
    expect(vm.stepForwardDisabled).toBe(false);
    expect(vm.resetDisabled).toBe(false);
    expect(vm.scrubber.value).toBe(2);
    expect(vm.tickLabel).toBe(`Tick 2 / ${snap.totalTicks}`);
  });

  it('renders a ready snapshot at end with stepForward disabled and reset enabled', () => {
    const total = buildReadySnapshot({ tick: 0, isPlaying: false }).totalTicks;
    const snap = buildReadySnapshot({ tick: total, isPlaying: false });
    const vm = buildViewerControlsViewModel(snap);
    expect(vm.stepBackDisabled).toBe(false);
    expect(vm.stepForwardDisabled).toBe(true);
    expect(vm.resetDisabled).toBe(false);
    expect(vm.scrubber.value).toBe(total);
  });

  it('marks the matching default preset as selected and includes labels', () => {
    const snap = buildReadySnapshot({ tick: 1, isPlaying: false, speed: 1 });
    const vm = buildViewerControlsViewModel(snap);
    expect(vm.speedDisabled).toBe(false);
    const values = vm.speedOptions.map((o) => o.value);
    expect(values).toEqual([...DEFAULT_SPEED_PRESETS]);
    const selected = vm.speedOptions.filter((o) => o.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.value).toBe(1);
    expect(selected[0]!.label).toBe('1x');
  });

  it('appends a custom speed option when current speed is not a preset', () => {
    const snap = buildReadySnapshot({ tick: 1, isPlaying: false, speed: 3 });
    const vm = buildViewerControlsViewModel(snap);
    const values = vm.speedOptions.map((o) => o.value);
    expect(values).toContain(3);
    const selected = vm.speedOptions.filter((o) => o.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.value).toBe(3);
    expect(selected[0]!.label).toBe('3x');
  });

  it('uses provided preset overrides and rebuilds labels accordingly', () => {
    const snap = buildReadySnapshot({ tick: 1, isPlaying: false, speed: 0.5 });
    const vm = buildViewerControlsViewModel(snap, { speedPresets: [0.5, 2] });
    expect(vm.speedOptions.map((o) => o.value)).toEqual([0.5, 2]);
    expect(vm.speedOptions.map((o) => o.label)).toEqual(['0.5x', '2x']);
    const selected = vm.speedOptions.filter((o) => o.selected);
    expect(selected[0]!.value).toBe(0.5);
  });

  it('emits a summary with map label, winner label, and placement rows', () => {
    const snap = buildReadySnapshot({ tick: 1, isPlaying: false });
    const vm = buildViewerControlsViewModel(snap);
    expect(vm.summary).not.toBeNull();
    const summary = vm.summary!;
    expect(summary.matchId).toBe(snap.summary.matchId);
    expect(summary.mapLabel).toBe(`${snap.summary.mapId} @ ${snap.summary.mapVersion}`);
    expect(summary.placements).toHaveLength(snap.summary.placements.length);
    const ranks = summary.placements.map((p) => p.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    if (snap.summary.winner === null) {
      expect(summary.winnerLabel).toBe('No winner');
    } else {
      expect(summary.winnerLabel).toBe(snap.summary.winner.displayName);
    }
  });

  it('formats finished status with end reason', () => {
    const snap = buildReadySnapshot({ tick: 1, isPlaying: false });
    const finished: ViewerSnapshot = {
      ...snap,
      summary: { ...snap.summary, status: 'finished', endReason: 'last-survivor' },
    };
    const vm = buildViewerControlsViewModel(finished);
    expect(vm.summary!.statusLabel).toBe('Finished — last-survivor');
  });

  it('formats in-progress status without end reason', () => {
    const snap = buildReadySnapshot({ tick: 1, isPlaying: false });
    const inProgress: ViewerSnapshot = {
      ...snap,
      summary: { ...snap.summary, status: 'in-progress', endReason: null },
    };
    const vm = buildViewerControlsViewModel(inProgress);
    expect(vm.summary!.statusLabel).toBe('In progress');
  });

  it('builds an event feed from the current frame using contender display names', () => {
    const snap = buildReadySnapshot({ tick: 1, isPlaying: false });
    const vm = buildViewerControlsViewModel(snap);
    expect(vm.eventFeed.length).toBe(snap.frame.events.length);
    for (let i = 0; i < snap.frame.events.length; i += 1) {
      const entry = vm.eventFeed[i]!;
      expect(entry.tick).toBe(snap.frame.tick);
      expect(entry.text.length).toBeGreaterThan(0);
      expect(typeof entry.isKey).toBe('boolean');
    }
    const idAlpha = vm.eventFeed.find((e) => e.text.includes('alpha'));
    expect(idAlpha).toBeUndefined();
    const named = vm.eventFeed.find((e) => e.text.includes('Alpha') || e.text.includes('Bravo'));
    expect(named).toBeDefined();
  });
});
