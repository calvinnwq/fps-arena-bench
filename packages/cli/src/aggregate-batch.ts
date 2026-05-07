import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  ResultSummarySchema,
  validateWithSchema,
  type ResultSummary,
} from '@fps-arena-bench/schemas';

import type { BatchManifest, BatchRunRecord } from './run-batch-command.js';

export const AGGREGATE_SCHEMA_VERSION = 'fps-arena-bench.aggregate.v0.1';

export interface AdapterAggregate {
  readonly adapterId: string;
  readonly displayName?: string;
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly tactical: {
    readonly kills: number;
    readonly deaths: number;
    readonly damageDealt: number;
    readonly damageTaken: number;
    readonly survivalTicks: number;
    readonly pickupsCollected: number;
  };
}

export interface MatchupContenderOutcome {
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
}

export interface MatchupAggregate {
  readonly matchesPlayed: number;
  readonly contenderOutcomes: Record<string, MatchupContenderOutcome>;
}

export interface AggregateFailureEntry {
  readonly matchId: string;
  readonly status: 'failed' | 'skipped' | 'result-missing' | 'result-corrupt';
  readonly code?: string;
  readonly message?: string;
}

export interface AggregateSummary {
  readonly schemaVersion: typeof AGGREGATE_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly batchId: string;
  readonly rulesetVersion: string;
  readonly runCounts: {
    readonly total: number;
    readonly completed: number;
    readonly failed: number;
    readonly skipped: number;
    readonly resultsLoaded: number;
    readonly resultsMissing: number;
  };
  readonly byAdapter: Record<string, AdapterAggregate>;
  readonly byMatchup: Record<string, MatchupAggregate>;
  readonly matchReliability: {
    readonly totalInvalidJson: number;
    readonly totalSchemaFailures: number;
    readonly totalRepairAttempts: number;
    readonly totalRepairSuccesses: number;
    readonly totalTimeouts: number;
    readonly totalFallbackActions: number;
  };
  readonly matchLatency: {
    readonly matchCount: number;
    readonly sumAverageMeanMs: number;
    readonly sumAverageP50Ms: number;
    readonly sumAverageP95Ms: number;
  };
  readonly failures: readonly AggregateFailureEntry[];
}

export interface AggregateBatchOptions {
  readonly manifestPath: string;
  readonly strict?: boolean;
  readonly now?: () => string;
}

export interface AggregateBatchResult {
  readonly summary: AggregateSummary;
  readonly csv: string;
}

export const CSV_HEADERS = [
  'matchId',
  'matchupId',
  'mapId',
  'seed',
  'contenderId',
  'adapterId',
  'displayName',
  'rank',
  'win',
  'draw',
  'kills',
  'deaths',
  'damageDealt',
  'damageTaken',
  'survivalTicks',
  'pickupsCollected',
  'ticksElapsed',
  'matchInvalidJson',
  'matchSchemaFailures',
  'matchRepairAttempts',
  'matchRepairSuccesses',
  'matchTimeouts',
  'matchFallbackActions',
  'matchAvgLatencyMs',
  'matchP50LatencyMs',
  'matchP95LatencyMs',
  'matchTimeoutBudgetMs',
] as const;

export const csvEscape = (value: string | number | undefined): string => {
  if (value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

type ReadResultOutcome =
  | { ok: true; result: ResultSummary }
  | { ok: false; status: 'result-missing' | 'result-corrupt'; message: string };

const tryReadResult = (resultPath: string): ReadResultOutcome => {
  let raw: string;
  try {
    raw = readFileSync(resultPath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      status: 'result-missing',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = validateWithSchema('resultSummary', ResultSummarySchema, parsed);
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      status: 'result-corrupt',
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

interface MutableAdapterAggregate {
  adapterId: string;
  displayName?: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  survivalTicks: number;
  pickupsCollected: number;
}

interface MutableMatchupAggregate {
  matchesPlayed: number;
  contenderOutcomes: Record<
    string,
    { matchesPlayed: number; wins: number; draws: number; losses: number }
  >;
}

const buildContenderAdapterMap = (
  run: BatchRunRecord,
): Map<string, { adapterId: string; displayName?: string }> => {
  const map = new Map<string, { adapterId: string; displayName?: string }>();
  for (const c of run.contenders) {
    map.set(c.id, {
      adapterId: c.adapterId,
      ...(c.displayName !== undefined ? { displayName: c.displayName } : {}),
    });
  }
  return map;
};

const accumulateAdapterAggregates = (
  byAdapter: Record<string, MutableAdapterAggregate>,
  result: ResultSummary,
  isDraw: boolean,
  contenderAdapterMap: Map<string, { adapterId: string; displayName?: string }>,
): void => {
  for (const placement of result.placements) {
    const cId = placement.contenderId;
    const contenderInfo = contenderAdapterMap.get(cId);
    if (contenderInfo === undefined) continue;
    const stats = result.stats[cId];
    if (stats === undefined) continue;

    const { adapterId, displayName } = contenderInfo;
    if (byAdapter[adapterId] === undefined) {
      byAdapter[adapterId] = {
        adapterId,
        ...(displayName !== undefined ? { displayName } : {}),
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        damageTaken: 0,
        survivalTicks: 0,
        pickupsCollected: 0,
      };
    }

    const agg = byAdapter[adapterId]!;
    agg.matchesPlayed += 1;
    if (isDraw) {
      agg.draws += 1;
    } else if (result.winner === cId) {
      agg.wins += 1;
    } else {
      agg.losses += 1;
    }
    agg.kills += stats.kills;
    agg.deaths += stats.deaths;
    agg.damageDealt += stats.damageDealt;
    agg.damageTaken += stats.damageTaken;
    agg.survivalTicks += stats.survivalTicks;
    agg.pickupsCollected += stats.pickupsCollected;
  }
};

const accumulateMatchupAggregate = (
  byMatchup: Record<string, MutableMatchupAggregate>,
  run: BatchRunRecord,
  result: ResultSummary,
  isDraw: boolean,
  contenderAdapterMap: Map<string, { adapterId: string; displayName?: string }>,
): void => {
  const matchupId = run.matchupId;
  if (byMatchup[matchupId] === undefined) {
    byMatchup[matchupId] = { matchesPlayed: 0, contenderOutcomes: {} };
  }
  const matchup = byMatchup[matchupId]!;
  matchup.matchesPlayed += 1;

  for (const placement of result.placements) {
    const cId = placement.contenderId;
    const adapterId = contenderAdapterMap.get(cId)?.adapterId;
    if (adapterId === undefined) continue;

    if (matchup.contenderOutcomes[adapterId] === undefined) {
      matchup.contenderOutcomes[adapterId] = { matchesPlayed: 0, wins: 0, draws: 0, losses: 0 };
    }
    const outcome = matchup.contenderOutcomes[adapterId]!;
    outcome.matchesPlayed += 1;
    if (isDraw) {
      outcome.draws += 1;
    } else if (result.winner === cId) {
      outcome.wins += 1;
    } else {
      outcome.losses += 1;
    }
  }
};

const finalizeAdapterAggregate = (mutable: MutableAdapterAggregate): AdapterAggregate => ({
  adapterId: mutable.adapterId,
  ...(mutable.displayName !== undefined ? { displayName: mutable.displayName } : {}),
  matchesPlayed: mutable.matchesPlayed,
  wins: mutable.wins,
  draws: mutable.draws,
  losses: mutable.losses,
  tactical: {
    kills: mutable.kills,
    deaths: mutable.deaths,
    damageDealt: mutable.damageDealt,
    damageTaken: mutable.damageTaken,
    survivalTicks: mutable.survivalTicks,
    pickupsCollected: mutable.pickupsCollected,
  },
});

const finalizeMatchupAggregate = (mutable: MutableMatchupAggregate): MatchupAggregate => ({
  matchesPlayed: mutable.matchesPlayed,
  contenderOutcomes: Object.fromEntries(
    Object.entries(mutable.contenderOutcomes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, { ...v }]),
  ),
});

export function aggregateBatch(options: AggregateBatchOptions): AggregateBatchResult {
  const manifestPath = resolve(options.manifestPath);
  const manifestDir = dirname(manifestPath);
  const now = options.now ?? (() => new Date().toISOString());

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to read manifest at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (
    typeof rawManifest !== 'object' ||
    rawManifest === null ||
    typeof (rawManifest as Record<string, unknown>).batchId !== 'string'
  ) {
    throw new Error(`Invalid manifest at ${manifestPath}: missing batchId`);
  }
  const manifest = rawManifest as BatchManifest;

  const failures: AggregateFailureEntry[] = [];
  const byAdapter: Record<string, MutableAdapterAggregate> = {};
  const byMatchup: Record<string, MutableMatchupAggregate> = {};
  const matchReliability = {
    totalInvalidJson: 0,
    totalSchemaFailures: 0,
    totalRepairAttempts: 0,
    totalRepairSuccesses: 0,
    totalTimeouts: 0,
    totalFallbackActions: 0,
  };
  const matchLatency = {
    matchCount: 0,
    sumAverageMeanMs: 0,
    sumAverageP50Ms: 0,
    sumAverageP95Ms: 0,
  };

  let resultsLoaded = 0;
  let resultsMissing = 0;
  const csvRows: string[][] = [];

  for (const run of manifest.runs) {
    if (run.status === 'failed') {
      failures.push({
        matchId: run.matchId,
        status: 'failed',
        ...(run.error?.code !== undefined ? { code: run.error.code } : {}),
        ...(run.error?.message !== undefined ? { message: run.error.message } : {}),
      });
      continue;
    }

    if (run.status === 'skipped') {
      failures.push({ matchId: run.matchId, status: 'skipped' });
      continue;
    }

    if (run.resultPath === undefined) {
      continue;
    }

    const resultPath = join(manifestDir, run.resultPath);
    const readOutcome = tryReadResult(resultPath);

    if (!readOutcome.ok) {
      resultsMissing += 1;
      failures.push({
        matchId: run.matchId,
        status: readOutcome.status,
        message: readOutcome.message,
      });
      if (options.strict) {
        throw new Error(
          `Strict mode: could not load result for completed run "${run.matchId}": ${readOutcome.message}`,
        );
      }
      continue;
    }

    resultsLoaded += 1;
    const result = readOutcome.result;
    const contenderAdapterMap = buildContenderAdapterMap(run);
    const isDraw = result.winner === null;

    accumulateAdapterAggregates(byAdapter, result, isDraw, contenderAdapterMap);
    accumulateMatchupAggregate(byMatchup, run, result, isDraw, contenderAdapterMap);

    matchReliability.totalInvalidJson += result.reliability.invalidJson;
    matchReliability.totalSchemaFailures += result.reliability.schemaFailures;
    matchReliability.totalRepairAttempts += result.reliability.repairAttempts;
    matchReliability.totalRepairSuccesses += result.reliability.repairSuccesses;
    matchReliability.totalTimeouts += result.reliability.timeouts;
    matchReliability.totalFallbackActions += result.reliability.fallbackActions;

    matchLatency.matchCount += 1;
    matchLatency.sumAverageMeanMs += result.latency.averageMs;
    matchLatency.sumAverageP50Ms += result.latency.p50Ms;
    matchLatency.sumAverageP95Ms += result.latency.p95Ms;

    const sortedPlacements = [...result.placements].sort((a, b) => a.rank - b.rank);
    for (const placement of sortedPlacements) {
      const cId = placement.contenderId;
      const contenderInfo = contenderAdapterMap.get(cId);
      const stats = result.stats[cId];
      if (stats === undefined) continue;
      const isWinner = result.winner === cId;
      csvRows.push([
        run.matchId,
        run.matchupId,
        run.mapId,
        String(run.seed),
        cId,
        contenderInfo?.adapterId ?? '',
        contenderInfo?.displayName ?? '',
        String(placement.rank),
        isWinner ? '1' : '0',
        isDraw ? '1' : '0',
        String(stats.kills),
        String(stats.deaths),
        String(stats.damageDealt),
        String(stats.damageTaken),
        String(stats.survivalTicks),
        String(stats.pickupsCollected),
        String(result.ticksElapsed),
        String(result.reliability.invalidJson),
        String(result.reliability.schemaFailures),
        String(result.reliability.repairAttempts),
        String(result.reliability.repairSuccesses),
        String(result.reliability.timeouts),
        String(result.reliability.fallbackActions),
        String(result.latency.averageMs),
        String(result.latency.p50Ms),
        String(result.latency.p95Ms),
        String(result.latency.timeoutBudgetMs),
      ]);
    }
  }

  failures.sort((a, b) => a.matchId.localeCompare(b.matchId));

  const sortedAdapters = Object.fromEntries(
    Object.entries(byAdapter)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, finalizeAdapterAggregate(v)]),
  );

  const sortedMatchups = Object.fromEntries(
    Object.entries(byMatchup)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, finalizeMatchupAggregate(v)]),
  );

  const summary: AggregateSummary = {
    schemaVersion: AGGREGATE_SCHEMA_VERSION,
    generatedAt: now(),
    batchId: manifest.batchId,
    rulesetVersion: manifest.rulesetVersion,
    runCounts: {
      total: manifest.summary.totalRuns,
      completed: manifest.summary.completedRuns,
      failed: manifest.summary.failedRuns,
      skipped: manifest.summary.skippedRuns,
      resultsLoaded,
      resultsMissing,
    },
    byAdapter: sortedAdapters,
    byMatchup: sortedMatchups,
    matchReliability,
    matchLatency,
    failures,
  };

  const csvLines = [CSV_HEADERS.join(','), ...csvRows.map((row) => row.map(csvEscape).join(','))];
  const csv = `${csvLines.join('\n')}\n`;

  return { summary, csv };
}
