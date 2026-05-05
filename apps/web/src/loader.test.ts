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
  MAX_REPLAY_INPUT_BYTES,
  loadReplayFromString,
  loadReplayFromValue,
} from './loader.js';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'loader-test-arena',
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
  id: 'loader-test-match',
  rulesetVersion: 'ruleset.v0.1',
  map: {
    id: 'loader-test-arena',
    version: '0.1.0',
    hash: VALID_HASH,
  },
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

describe('loadReplayFromString', () => {
  it('parses, validates, and builds a timeline from a valid replay JSON string', () => {
    const artifact = buildArtifact();
    const result = loadReplayFromString(JSON.stringify(artifact));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timeline.matchId).toBe(artifact.matchId);
    expect(result.timeline.frames.length).toBe(artifact.result.ticksElapsed + 1);
  });

  it('returns invalid-json error for empty input', () => {
    const result = loadReplayFromString('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-json');
    expect(result.error.message.toLowerCase()).toContain('empty');
  });

  it('returns invalid-json error for non-JSON text', () => {
    const result = loadReplayFromString('this is not json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-json');
    expect(result.error.message.toLowerCase()).toContain('json');
  });

  it('returns invalid-json error when input exceeds the size cap', () => {
    const oversized = 'x'.repeat(MAX_REPLAY_INPUT_BYTES + 1);
    const result = loadReplayFromString(oversized);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-json');
  });

  it('returns invalid-schema error for JSON that is not a replay artifact', () => {
    const result = loadReplayFromString(JSON.stringify({ hello: 'world' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-schema');
    expect(result.error.message).toMatch(/replaySafeArtifact|schema|invalid/i);
  });

  it('redacts local filesystem paths from any error message', () => {
    const result = loadReplayFromString('not json /Users/somebody/secret/file');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).not.toContain('/Users/');
    expect(result.error.message).not.toContain('secret');
  });
});

describe('loadReplayFromValue', () => {
  it('builds a timeline from a parsed object', () => {
    const artifact = buildArtifact();
    const parsed = JSON.parse(JSON.stringify(artifact)) as unknown;
    const result = loadReplayFromValue(parsed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timeline.matchId).toBe(artifact.matchId);
  });

  it('returns invalid-schema for objects missing required fields', () => {
    const result = loadReplayFromValue({ matchId: 'missing-the-rest' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-schema');
  });

  it('returns invalid-schema for primitive non-object values', () => {
    const result = loadReplayFromValue(42);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-schema');
  });

  it('returns invalid-timeline error when ticksElapsed disagrees with engine', () => {
    const artifact = buildArtifact();
    const tampered = JSON.parse(JSON.stringify(artifact)) as Record<string, unknown>;
    const result = (tampered.result as Record<string, unknown>);
    result.ticksElapsed = (result.ticksElapsed as number) + 50;
    const out = loadReplayFromValue(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.kind).toBe('invalid-timeline');
    expect(out.error.message.toLowerCase()).toContain('ticks');
  });

  it('returns invalid-schema when input is null', () => {
    const result = loadReplayFromValue(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-schema');
  });
});
