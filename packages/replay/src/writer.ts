import type { TickEvent, TickResult } from '@fps-arena-bench/core';
import type {
  Action,
  MapDefinition,
  MatchConfig,
  ReplaySafeArtifact,
  ResultSummary,
} from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION, validateReplaySafeArtifact } from '@fps-arena-bench/schemas';

import { assertReplaySafe } from './redaction.js';

export interface RecordedAcceptedAction {
  readonly contenderId: string;
  readonly action: Action;
  readonly latencyMs: number;
}

export interface RecordedTick {
  readonly tick: number;
  readonly preTickHash: string;
  readonly postTickHash: string;
  readonly acceptedActions: readonly RecordedAcceptedAction[];
  readonly events: readonly TickEvent[];
}

export interface ReliabilityCounters {
  readonly invalidJson: number;
  readonly schemaFailures: number;
  readonly repairAttempts: number;
  readonly repairSuccesses: number;
  readonly timeouts: number;
  readonly fallbackActions: number;
}

export interface BuildResultSummaryOptions {
  readonly matchId: string;
  readonly config: MatchConfig;
  readonly state: FinalStateSnapshot;
  readonly latenciesMs: readonly number[];
  readonly reliability: ReliabilityCounters;
  readonly timeoutBudgetMs: number;
}

export interface FinalStateSnapshot {
  readonly tick: number;
  readonly winner: string | null;
  readonly score: Readonly<Record<string, number>>;
  readonly stats: Readonly<
    Record<
      string,
      {
        readonly kills: number;
        readonly deaths: number;
        readonly damageDealt: number;
        readonly damageTaken: number;
        readonly survivalTicks: number;
        readonly pickupsCollected: number;
      }
    >
  >;
  readonly aliveByContenderId: Readonly<Record<string, boolean>>;
}

export interface BuildReplaySafeArtifactOptions {
  readonly matchId: string;
  readonly config: MatchConfig;
  readonly map: MapDefinition;
  readonly state: FinalStateSnapshot;
  readonly recordedTicks: readonly RecordedTick[];
  readonly reliability: ReliabilityCounters;
  readonly timeoutBudgetMs: number;
  readonly snapshotIntervalTicks?: number;
}

const sortedContenderIds = (config: MatchConfig): string[] =>
  config.contenders.map((entry) => entry.id);

const computePercentile = (sortedAsc: readonly number[], percentile: number): number => {
  if (sortedAsc.length === 0) {
    return 0;
  }
  const rank = Math.ceil((percentile / 100) * sortedAsc.length);
  const index = Math.max(0, Math.min(sortedAsc.length - 1, rank - 1));
  return sortedAsc[index] ?? 0;
};

const computeLatencyStats = (
  latencies: readonly number[],
  timeoutBudgetMs: number,
): ResultSummary['latency'] => {
  if (latencies.length === 0) {
    return { averageMs: 0, p50Ms: 0, p95Ms: 0, timeoutBudgetMs };
  }
  const sorted = [...latencies].sort((left, right) => left - right);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const average = sum / sorted.length;
  const p50 = computePercentile(sorted, 50);
  const p95Raw = computePercentile(sorted, 95);
  const p95 = Math.max(p50, p95Raw);
  return { averageMs: average, p50Ms: p50, p95Ms: p95, timeoutBudgetMs };
};

export function buildResultSummary(options: BuildResultSummaryOptions): ResultSummary {
  const { config, state, latenciesMs, reliability, timeoutBudgetMs } = options;
  const ids = sortedContenderIds(config);

  const ranked = ids
    .map((contenderId) => ({
      contenderId,
      score: state.score[contenderId] ?? 0,
      stats: state.stats[contenderId],
      alive: state.aliveByContenderId[contenderId] ?? false,
    }))
    .sort((left, right) => {
      if (state.winner !== null) {
        if (left.contenderId === state.winner && right.contenderId !== state.winner) return -1;
        if (right.contenderId === state.winner && left.contenderId !== state.winner) return 1;
      }
      if (left.alive !== right.alive) return left.alive ? -1 : 1;
      if (left.score !== right.score) return right.score - left.score;
      const ls = left.stats?.survivalTicks ?? 0;
      const rs = right.stats?.survivalTicks ?? 0;
      if (ls !== rs) return rs - ls;
      const ld = left.stats?.damageDealt ?? 0;
      const rd = right.stats?.damageDealt ?? 0;
      if (ld !== rd) return rd - ld;
      return left.contenderId < right.contenderId ? -1 : 1;
    });

  const placements = ranked.map((entry, index) => ({
    contenderId: entry.contenderId,
    rank: index + 1,
  }));

  const stats: ResultSummary['stats'] = {};
  for (const id of ids) {
    const entry = state.stats[id] ?? {
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      damageTaken: 0,
      survivalTicks: 0,
      pickupsCollected: 0,
    };
    stats[id] = {
      kills: entry.kills,
      deaths: entry.deaths,
      damageDealt: entry.damageDealt,
      damageTaken: entry.damageTaken,
      survivalTicks: entry.survivalTicks,
      pickupsCollected: entry.pickupsCollected,
    };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    matchId: options.matchId,
    winner: state.winner,
    placements,
    ticksElapsed: state.tick,
    stats,
    reliability: { ...reliability },
    latency: computeLatencyStats(latenciesMs, timeoutBudgetMs),
  };
}

const eventDetailsFor = (
  event: TickEvent,
): NonNullable<ReplaySafeArtifact['events'][number]['details']> | undefined => {
  switch (event.type) {
    case 'move':
      return { x: event.to.x, y: event.to.y, success: !event.blocked };
    case 'shoot':
      return {
        x: event.target.x,
        y: event.target.y,
        damage: event.damage,
        ammo: event.ammoSpent,
        success: event.hitContenderId !== null,
      };
    case 'shoot-no-ammo':
      return { ammo: 0, success: false };
    case 'pickup-collected':
      return { amount: event.amount };
    default:
      return undefined;
  }
};

const eventActorFor = (event: TickEvent): string | undefined => {
  switch (event.type) {
    case 'turn':
    case 'move':
    case 'shoot':
    case 'shoot-no-ammo':
    case 'noop':
    case 'pickup-collected':
    case 'elimination':
      return event.contenderId;
    case 'match-ended':
      return event.winner ?? undefined;
    case 'pickup-respawned':
      return undefined;
  }
};

const eventTypeFor = (event: TickEvent): string => event.type;

const projectEvent = (tick: number, event: TickEvent): ReplaySafeArtifact['events'][number] => {
  const details = eventDetailsFor(event);
  const actor = eventActorFor(event);
  const projected: ReplaySafeArtifact['events'][number] = {
    tick,
    type: eventTypeFor(event),
    ...(actor !== undefined ? { contenderId: actor } : {}),
    ...(details !== undefined ? { details } : {}),
  };
  return projected;
};

export function buildReplaySafeArtifact(
  options: BuildReplaySafeArtifactOptions,
): ReplaySafeArtifact {
  const { config, map, state, recordedTicks, matchId } = options;

  const acceptedActions: ReplaySafeArtifact['acceptedActions'] = [];
  const events: ReplaySafeArtifact['events'] = [];
  const stateHashes: ReplaySafeArtifact['stateHashes'] = [];
  const latenciesMs: number[] = [];

  if (recordedTicks.length === 0) {
    stateHashes.push({ tick: 0, hash: '' });
  } else {
    stateHashes.push({ tick: 0, hash: recordedTicks[0]!.preTickHash });
    for (const recorded of recordedTicks) {
      for (const accepted of recorded.acceptedActions) {
        acceptedActions.push({
          tick: recorded.tick,
          contenderId: accepted.contenderId,
          action: accepted.action,
          latencyMs: accepted.latencyMs,
        });
        latenciesMs.push(accepted.latencyMs);
      }
      for (const event of recorded.events) {
        events.push(projectEvent(recorded.tick, event));
      }
      stateHashes.push({ tick: recorded.tick + 1, hash: recorded.postTickHash });
    }
  }

  let snapshots: ReplaySafeArtifact['snapshots'] | undefined;
  if (
    options.snapshotIntervalTicks !== undefined &&
    options.snapshotIntervalTicks > 0 &&
    recordedTicks.length > 0
  ) {
    snapshots = [];
    const interval = options.snapshotIntervalTicks;
    for (const entry of stateHashes) {
      if (entry.tick % interval === 0) {
        snapshots.push({ tick: entry.tick, hash: entry.hash });
      }
    }
  }

  const result = buildResultSummary({
    matchId,
    config,
    state,
    latenciesMs,
    reliability: options.reliability,
    timeoutBudgetMs: options.timeoutBudgetMs,
  });

  const artifact: ReplaySafeArtifact = {
    schemaVersion: SCHEMA_VERSION,
    matchId,
    config,
    map,
    acceptedActions,
    events,
    stateHashes,
    ...(snapshots !== undefined ? { snapshots } : {}),
    result,
  };

  const validated = validateReplaySafeArtifact(artifact);
  assertReplaySafe('replay.safe.json', validated);
  return validated;
}
