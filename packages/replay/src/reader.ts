import type { AcceptedActionInput, MatchState } from '@fps-arena-bench/core';
import { applyTick, createMatchState, hashMatchState } from '@fps-arena-bench/core';
import type { ReplaySafeArtifact } from '@fps-arena-bench/schemas';
import { validateReplaySafeArtifact } from '@fps-arena-bench/schemas';

export interface HashMismatch {
  readonly tick: number;
  readonly expected: string;
  readonly actual: string;
}

export interface ReplayReconstructionResult {
  readonly state: MatchState;
  readonly hashesVerified: number;
  readonly mismatches: readonly HashMismatch[];
}

export class ReplayReconstructionError extends Error {
  readonly mismatches: readonly HashMismatch[];

  constructor(message: string, mismatches: readonly HashMismatch[]) {
    super(message);
    this.name = 'ReplayReconstructionError';
    this.mismatches = mismatches;
  }
}

export function parseReplaySafeArtifact(serialized: string | unknown): ReplaySafeArtifact {
  const value = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  return validateReplaySafeArtifact(value);
}

const groupAcceptedActionsByTick = (
  artifact: ReplaySafeArtifact,
): Map<number, AcceptedActionInput[]> => {
  const grouped = new Map<number, AcceptedActionInput[]>();
  for (const accepted of artifact.acceptedActions) {
    const bucket = grouped.get(accepted.tick) ?? [];
    bucket.push({ contenderId: accepted.contenderId, action: accepted.action });
    grouped.set(accepted.tick, bucket);
  }
  return grouped;
};

const findHashAt = (artifact: ReplaySafeArtifact, tick: number): string | undefined =>
  artifact.stateHashes.find((entry) => entry.tick === tick)?.hash;

export interface ReconstructOptions {
  readonly throwOnMismatch?: boolean;
}

export function reconstructFromReplaySafeArtifact(
  artifact: ReplaySafeArtifact,
  options: ReconstructOptions = {},
): ReplayReconstructionResult {
  const throwOnMismatch = options.throwOnMismatch ?? true;
  const mismatches: HashMismatch[] = [];
  let hashesVerified = 0;

  const state = createMatchState({ config: artifact.config, map: artifact.map });

  const initialExpected = findHashAt(artifact, 0);
  if (initialExpected !== undefined) {
    const initialActual = hashMatchState(state);
    if (initialActual === initialExpected) {
      hashesVerified += 1;
    } else {
      mismatches.push({ tick: 0, expected: initialExpected, actual: initialActual });
    }
  }

  const grouped = groupAcceptedActionsByTick(artifact);

  for (let tick = 0; tick < artifact.result.ticksElapsed; tick += 1) {
    if (state.status === 'finished') {
      mismatches.push({
        tick,
        expected: 'in-progress',
        actual: 'finished-before-tick',
      });
      break;
    }
    const inputs = grouped.get(tick) ?? [];
    applyTick(state, inputs);
    const expectedPost = findHashAt(artifact, tick + 1);
    if (expectedPost !== undefined) {
      const actualPost = hashMatchState(state);
      if (actualPost === expectedPost) {
        hashesVerified += 1;
      } else {
        mismatches.push({ tick: tick + 1, expected: expectedPost, actual: actualPost });
      }
    }
  }

  if (state.tick !== artifact.result.ticksElapsed) {
    mismatches.push({
      tick: artifact.result.ticksElapsed,
      expected: `ticksElapsed=${artifact.result.ticksElapsed}`,
      actual: `ticksElapsed=${state.tick}`,
    });
  }

  if (state.winner !== artifact.result.winner) {
    mismatches.push({
      tick: state.tick,
      expected: `winner=${artifact.result.winner ?? 'null'}`,
      actual: `winner=${state.winner ?? 'null'}`,
    });
  }

  if (throwOnMismatch && mismatches.length > 0) {
    const detail = mismatches
      .slice(0, 3)
      .map((entry) => `tick=${entry.tick} expected=${entry.expected} actual=${entry.actual}`)
      .join('; ');
    throw new ReplayReconstructionError(
      `Replay reconstruction failed: ${detail}${mismatches.length > 3 ? ' (truncated)' : ''}`,
      mismatches,
    );
  }

  return { state, hashesVerified, mismatches };
}
