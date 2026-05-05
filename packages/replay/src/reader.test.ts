import {
  applyTick,
  createMatchState,
  hashMatchState,
  type AcceptedActionInput,
} from '@fps-arena-bench/core';
import type { Action } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it } from 'vitest';

import {
  ReplayReconstructionError,
  parseReplaySafeArtifact,
  reconstructFromReplaySafeArtifact,
} from './reader.js';
import { MatchRecorder } from './recorder.js';
import { buildReplayTestMap, buildReplayTestMatchConfig } from './test-fixtures.js';

const noop = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });
const moveLeft = (): Action => ({
  schemaVersion: SCHEMA_VERSION,
  type: 'move',
  direction: { x: -1, y: 0 },
});

const buildArtifactFromMatch = (matchOptions: { readonly maxTicks?: number } = {}) => {
  const map = buildReplayTestMap();
  const maxTicks = matchOptions.maxTicks ?? 5;
  const config = buildReplayTestMatchConfig({
    mapId: map.id,
    mapVersion: map.version,
    maxTicks,
  });
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
      .map((player, index) => ({
        contenderId: player.contenderId,
        action: index === 0 ? moveLeft() : noop(),
      }));
    const beforeTick = state.tick;
    const result = applyTick(state, inputs);
    recorder.recordTick({ tick: beforeTick, inputs, result });
  }

  const artifact = recorder.build({ state });
  return { config, map, state, artifact };
};

describe('reconstructFromReplaySafeArtifact', () => {
  it('reproduces the final state and validates every recorded hash', () => {
    const { artifact, state: original } = buildArtifactFromMatch();
    const reconstruction = reconstructFromReplaySafeArtifact(artifact);
    expect(reconstruction.mismatches).toEqual([]);
    expect(reconstruction.hashesVerified).toBe(artifact.stateHashes.length);
    expect(hashMatchState(reconstruction.state)).toBe(hashMatchState(original));
    expect(reconstruction.state.tick).toBe(original.tick);
    expect(reconstruction.state.winner).toBe(original.winner);
  });

  it('round-trips through JSON serialization', () => {
    const { artifact } = buildArtifactFromMatch();
    const serialized = JSON.stringify(artifact);
    const parsed = parseReplaySafeArtifact(serialized);
    const reconstruction = reconstructFromReplaySafeArtifact(parsed);
    expect(reconstruction.mismatches).toEqual([]);
  });

  it('throws ReplayReconstructionError when a recorded hash is tampered', () => {
    const { artifact } = buildArtifactFromMatch();
    const tampered = JSON.parse(JSON.stringify(artifact));
    tampered.stateHashes[1].hash = `sha256:${'b'.repeat(64)}`;
    const parsed = parseReplaySafeArtifact(tampered);
    expect(() => reconstructFromReplaySafeArtifact(parsed)).toThrow(ReplayReconstructionError);
  });

  it('returns mismatches without throwing when throwOnMismatch is false', () => {
    const { artifact } = buildArtifactFromMatch();
    const tampered = JSON.parse(JSON.stringify(artifact));
    tampered.stateHashes[2].hash = `sha256:${'c'.repeat(64)}`;
    const parsed = parseReplaySafeArtifact(tampered);
    const reconstruction = reconstructFromReplaySafeArtifact(parsed, { throwOnMismatch: false });
    expect(reconstruction.mismatches.length).toBeGreaterThan(0);
  });

  it('rejects malformed safe artifacts via schema validation', () => {
    const { artifact } = buildArtifactFromMatch();
    const broken = { ...artifact, matchId: '' };
    expect(() => parseReplaySafeArtifact(broken)).toThrow();
  });

  it('detects a forged final-tick winner', () => {
    const { artifact } = buildArtifactFromMatch();
    const tampered = JSON.parse(JSON.stringify(artifact));
    tampered.result.winner = 'alpha';
    tampered.result.placements = [
      { contenderId: 'alpha', rank: 1 },
      { contenderId: 'bravo', rank: 2 },
    ];
    const parsed = parseReplaySafeArtifact(tampered);
    expect(() => reconstructFromReplaySafeArtifact(parsed)).toThrow(ReplayReconstructionError);
  });
});
