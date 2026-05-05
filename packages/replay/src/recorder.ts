import type { AcceptedActionInput, MatchState, TickEvent, TickResult } from '@fps-arena-bench/core';
import type { MapDefinition, MatchConfig, ReplaySafeArtifact } from '@fps-arena-bench/schemas';

import {
  buildReplaySafeArtifact,
  type FinalStateSnapshot,
  type RecordedAcceptedAction,
  type RecordedTick,
  type ReliabilityCounters,
} from './writer.js';

export interface MatchRecorderOptions {
  readonly matchId: string;
  readonly config: MatchConfig;
  readonly map: MapDefinition;
  readonly initialPreTickHash: string;
  readonly timeoutBudgetMs: number;
  readonly snapshotIntervalTicks?: number;
}

export interface RecordTickOptions {
  readonly tick: number;
  readonly inputs: readonly AcceptedActionInput[];
  readonly result: TickResult;
  readonly latencyMsByContenderId?: ReadonlyMap<string, number>;
}

export interface BuildArtifactOptions {
  readonly state: MatchState;
  readonly reliability?: ReliabilityCounters;
  readonly extraEvents?: readonly { readonly tick: number; readonly event: TickEvent }[];
}

const ZERO_RELIABILITY: ReliabilityCounters = {
  invalidJson: 0,
  schemaFailures: 0,
  repairAttempts: 0,
  repairSuccesses: 0,
  timeouts: 0,
  fallbackActions: 0,
};

const finalStateSnapshot = (state: MatchState): FinalStateSnapshot => ({
  tick: state.tick,
  winner: state.winner,
  score: { ...state.score },
  stats: Object.fromEntries(
    Object.entries(state.stats).map(([id, entry]) => [id, { ...entry }]),
  ) as FinalStateSnapshot['stats'],
  aliveByContenderId: Object.fromEntries(
    state.players.map((player) => [player.contenderId, player.alive]),
  ),
});

export class MatchRecorder {
  private readonly options: MatchRecorderOptions;
  private readonly recordedTicks: RecordedTick[] = [];
  private finalized = false;

  constructor(options: MatchRecorderOptions) {
    this.options = options;
  }

  recordTick(record: RecordTickOptions): void {
    if (this.finalized) {
      throw new Error('Cannot record additional ticks after the artifact has been built.');
    }
    const accepted: RecordedAcceptedAction[] = record.inputs.map((input) => ({
      contenderId: input.contenderId,
      action: input.action,
      latencyMs: record.latencyMsByContenderId?.get(input.contenderId) ?? 0,
    }));
    this.recordedTicks.push({
      tick: record.tick,
      preTickHash: record.result.preTickHash,
      postTickHash: record.result.postTickHash,
      acceptedActions: accepted,
      events: record.result.events,
    });
  }

  build(options: BuildArtifactOptions): ReplaySafeArtifact {
    this.finalized = true;
    const reliability = options.reliability ?? ZERO_RELIABILITY;
    const finalState = finalStateSnapshot(options.state);
    const artifact = buildReplaySafeArtifact({
      matchId: this.options.matchId,
      config: this.options.config,
      map: this.options.map,
      state: finalState,
      recordedTicks: this.recordedTicks,
      reliability,
      timeoutBudgetMs: this.options.timeoutBudgetMs,
      ...(this.options.snapshotIntervalTicks !== undefined
        ? { snapshotIntervalTicks: this.options.snapshotIntervalTicks }
        : {}),
    });
    return artifact;
  }
}
