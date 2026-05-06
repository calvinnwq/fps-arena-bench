import {
  applyTick,
  createMatchState,
  hashMatchState,
  type AcceptedActionInput,
} from '@fps-arena-bench/core';
import { MatchRecorder } from '@fps-arena-bench/replay';
import type { Action, MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_PLAYER_SPEED } from './player.js';
import { ReplayViewer, type ViewerSnapshot } from './viewer.js';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'viewer-test-arena',
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

const buildTestConfig = (): MatchConfig => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'viewer-test-match',
  rulesetVersion: 'ruleset.v0.1',
  map: { id: 'viewer-test-arena', version: '0.1.0', hash: VALID_HASH },
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

const expectReady = (snap: ViewerSnapshot): Extract<ViewerSnapshot, { status: 'ready' }> => {
  if (snap.status !== 'ready') {
    throw new Error(`expected ready snapshot, got ${snap.status}`);
  }
  return snap;
};

describe('ReplayViewer', () => {
  it('starts idle', () => {
    const viewer = new ReplayViewer();
    expect(viewer.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('loadFromString returns a ready snapshot for a valid replay JSON string', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    const snap = viewer.loadFromString(JSON.stringify(artifact));
    const ready = expectReady(snap);
    expect(ready.tick).toBe(0);
    expect(ready.totalTicks).toBe(artifact.result.ticksElapsed);
    expect(ready.isPlaying).toBe(false);
    expect(ready.speed).toBe(DEFAULT_PLAYER_SPEED);
    expect(ready.atStart).toBe(true);
    expect(ready.atEnd).toBe(false);
    expect(ready.frame.tick).toBe(0);
    expect(ready.timeline.matchId).toBe(artifact.matchId);
    expect(ready.summary.matchId).toBe(artifact.matchId);
  });

  it('loadFromValue returns a ready snapshot for a parsed artifact value', () => {
    const artifact = buildArtifact();
    const parsed = JSON.parse(JSON.stringify(artifact)) as unknown;
    const viewer = new ReplayViewer();
    const ready = expectReady(viewer.loadFromValue(parsed));
    expect(ready.timeline.matchId).toBe(artifact.matchId);
  });

  it('returns an error snapshot for invalid input and exposes the categorized error', () => {
    const viewer = new ReplayViewer();
    const snap = viewer.loadFromString('not json');
    expect(snap.status).toBe('error');
    if (snap.status !== 'error') return;
    expect(snap.error.kind).toBe('invalid-json');
  });

  it('notifies subscribers on load', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    const listener = vi.fn();
    viewer.subscribe(listener);
    viewer.loadFromString(JSON.stringify(artifact));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].status).toBe('ready');
  });

  it('forwards play/pause/togglePlayPause through the underlying player and emits ready snapshots', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromString(JSON.stringify(artifact));
    const listener = vi.fn();
    viewer.subscribe(listener);

    viewer.play();
    expect(expectReady(viewer.getSnapshot()).isPlaying).toBe(true);
    viewer.pause();
    expect(expectReady(viewer.getSnapshot()).isPlaying).toBe(false);
    viewer.togglePlayPause();
    expect(expectReady(viewer.getSnapshot()).isPlaying).toBe(true);

    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('step advances the tick and updates atStart/atEnd flags', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromString(JSON.stringify(artifact));
    viewer.step(2);
    const ready = expectReady(viewer.getSnapshot());
    expect(ready.tick).toBe(2);
    expect(ready.atStart).toBe(false);
    expect(ready.atEnd).toBe(false);
    expect(ready.frame.tick).toBe(2);
  });

  it('seek jumps to the given tick and pauses', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromString(JSON.stringify(artifact));
    viewer.play();
    viewer.seek(artifact.result.ticksElapsed);
    const ready = expectReady(viewer.getSnapshot());
    expect(ready.tick).toBe(artifact.result.ticksElapsed);
    expect(ready.isPlaying).toBe(false);
    expect(ready.atEnd).toBe(true);
  });

  it('setSpeed forwards to the player and surfaces the clamped speed', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromString(JSON.stringify(artifact));
    viewer.setSpeed(2);
    expect(expectReady(viewer.getSnapshot()).speed).toBe(2);
  });

  it('reset returns to tick 0, paused, default speed', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromString(JSON.stringify(artifact));
    viewer.setSpeed(4);
    viewer.step(2);
    viewer.play();
    viewer.reset();
    const ready = expectReady(viewer.getSnapshot());
    expect(ready.tick).toBe(0);
    expect(ready.isPlaying).toBe(false);
    expect(ready.speed).toBe(DEFAULT_PLAYER_SPEED);
  });

  it('advance forwards time-based progress while playing', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromString(JSON.stringify(artifact));
    viewer.setSpeed(2);
    viewer.play();
    viewer.advance(1000);
    expect(expectReady(viewer.getSnapshot()).tick).toBe(2);
  });

  it('unload returns the viewer to idle and notifies subscribers', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromString(JSON.stringify(artifact));
    const listener = vi.fn();
    viewer.subscribe(listener);
    viewer.unload();
    expect(viewer.getSnapshot()).toEqual({ status: 'idle' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0]).toEqual({ status: 'idle' });
  });

  it('control calls before any replay is loaded are no-ops and do not emit', () => {
    const viewer = new ReplayViewer();
    const listener = vi.fn();
    viewer.subscribe(listener);
    viewer.play();
    viewer.pause();
    viewer.togglePlayPause();
    viewer.step(1);
    viewer.seek(0);
    viewer.setSpeed(2);
    viewer.reset();
    viewer.advance(1000);
    expect(listener).not.toHaveBeenCalled();
    expect(viewer.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('control calls in error state are no-ops and do not emit', () => {
    const viewer = new ReplayViewer();
    viewer.loadFromString('not json');
    const listener = vi.fn();
    viewer.subscribe(listener);
    viewer.play();
    viewer.step(1);
    viewer.seek(0);
    viewer.setSpeed(2);
    viewer.reset();
    viewer.advance(1000);
    expect(listener).not.toHaveBeenCalled();
    expect(viewer.getSnapshot().status).toBe('error');
  });

  it('loading a new replay after an error transitions cleanly to ready', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromString('not json');
    expect(viewer.getSnapshot().status).toBe('error');
    viewer.loadFromString(JSON.stringify(artifact));
    expect(viewer.getSnapshot().status).toBe('ready');
  });

  it('unsubscribe stops further notifications', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromString(JSON.stringify(artifact));
    const listener = vi.fn();
    const unsubscribe = viewer.subscribe(listener);
    unsubscribe();
    viewer.play();
    expect(listener).not.toHaveBeenCalled();
  });

  it('loading a second replay replaces the first and unsubscribes from the previous player', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromString(JSON.stringify(artifact));
    viewer.step(2);
    viewer.loadFromString(JSON.stringify(artifact));
    const ready = expectReady(viewer.getSnapshot());
    expect(ready.tick).toBe(0);
  });
});
