import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

import {
  BATCH_CONFIG_SCHEMA_VERSION,
  SCHEMA_VERSION,
  validateBatchConfig,
  validateMap,
  type BatchConfig,
  type MatchConfig,
} from '@fps-arena-bench/schemas';

import { createBuiltinRegistry, type ProviderFactory, type ProviderRegistry } from './registry.js';
import { runMatchCommand, type RunMatchCommandSummary } from './run-match-command.js';

export interface RunBatchCommandOptions {
  readonly configPath: string;
  readonly outDir: string;
  readonly snapshotIntervalTicks?: number;
  readonly registry?: ProviderRegistry;
  readonly providerOverrides?: Readonly<Record<string, ProviderFactory>>;
  readonly overwrite?: boolean;
  readonly onMatchStart?: (event: BatchMatchStartEvent) => void;
  readonly onMatchEnd?: (event: BatchMatchEndEvent) => void;
}

export interface BatchMatchStartEvent {
  readonly index: number;
  readonly total: number;
  readonly matchId: string;
}

export interface BatchMatchEndEvent {
  readonly index: number;
  readonly total: number;
  readonly matchId: string;
  readonly status: BatchRunStatus;
}

export type BatchRunStatus = 'completed' | 'failed' | 'skipped';

export interface BatchRunRecord {
  readonly matchId: string;
  readonly mapId: string;
  readonly mapVersion: string;
  readonly matchupId: string;
  readonly seed: number;
  readonly spawnPermutation: readonly number[];
  readonly contenders: ReadonlyArray<{
    readonly id: string;
    readonly adapterId: string;
    readonly displayName?: string;
  }>;
  readonly status: BatchRunStatus;
  readonly outputDir: string;
  readonly configPath?: string;
  readonly replayPath?: string;
  readonly resultPath?: string;
  readonly winner?: string | null;
  readonly endReason?: string;
  readonly ticksElapsed?: number;
  readonly schemaViolations?: number;
  readonly providerErrors?: number;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface BatchManifest {
  readonly schemaVersion: typeof BATCH_CONFIG_SCHEMA_VERSION;
  readonly matchSchemaVersion: typeof SCHEMA_VERSION;
  readonly batchId: string;
  readonly rulesetVersion: string;
  readonly batchConfig: BatchConfig;
  readonly summary: {
    readonly totalRuns: number;
    readonly completedRuns: number;
    readonly failedRuns: number;
    readonly skippedRuns: number;
  };
  readonly runs: readonly BatchRunRecord[];
}

export interface RunBatchCommandSummary {
  readonly batchId: string;
  readonly batchOutDir: string;
  readonly manifestPath: string;
  readonly totalRuns: number;
  readonly completedRuns: number;
  readonly failedRuns: number;
  readonly skippedRuns: number;
}

const MANIFEST_FILENAME = 'manifest.json';
const MATCHES_DIRNAME = 'matches';
const MATCH_CONFIG_FILENAME = 'config.json';
const SAFE_REPLAY_FILENAME = 'replay.safe.json';
const RESULT_FILENAME = 'result.json';
const MATCH_ID_SAFE = /^[A-Za-z0-9._-]+$/;

const ensureDir = (path: string): void => {
  mkdirSync(path, { recursive: true });
};

const writeJson = (path: string, value: unknown): void => {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const readJson = (path: string): unknown => {
  const raw = readFileSync(path, 'utf8');
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const computeFileHash = (path: string): string => {
  const contents = readFileSync(path);
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
};

const toRelative = (root: string, path: string): string => relative(root, path) || '.';

interface PlannedMatch {
  readonly matchId: string;
  readonly mapId: string;
  readonly mapVersion: string;
  readonly mapPath: string;
  readonly mapHash: string;
  readonly matchupId: string;
  readonly seed: number;
  readonly spawnPermutation: readonly number[];
  readonly contenders: ReadonlyArray<{
    readonly id: string;
    readonly adapterId: string;
    readonly displayName?: string;
  }>;
}

const ensureSafeIdComponent = (label: string, value: string): void => {
  if (!MATCH_ID_SAFE.test(value) || value === '.' || value === '..') {
    throw new Error(
      `Invalid ${label} "${value}": only ASCII letters, digits, underscore, hyphen, and period are allowed for batch identifiers.`,
    );
  }
};

const sanitizeBatchConfigForManifest = (batch: BatchConfig): BatchConfig => ({
  ...batch,
  maps: batch.maps.map((map) => ({
    ...map,
    path: isAbsolute(map.path) ? basename(map.path) : map.path,
  })),
});

const buildMatchId = (
  batchId: string,
  mapId: string,
  matchupId: string,
  permIndex: number,
  seed: number,
): string => `${batchId}__${mapId}__${matchupId}__p${permIndex}__s${seed}`;

const planMatches = (
  batch: BatchConfig,
  configDir: string,
): {
  readonly matches: readonly PlannedMatch[];
  readonly mapHashes: ReadonlyMap<string, string>;
} => {
  ensureSafeIdComponent('batch id', batch.id);
  for (const map of batch.maps) {
    ensureSafeIdComponent('map id', map.id);
  }
  for (const matchup of batch.matchups) {
    ensureSafeIdComponent('matchup id', matchup.id);
  }

  const mapHashes = new Map<string, string>();
  const resolvedMapPaths = new Map<string, string>();
  for (const mapEntry of batch.maps) {
    const resolved = isAbsolute(mapEntry.path) ? mapEntry.path : resolve(configDir, mapEntry.path);
    if (!existsSync(resolved)) {
      throw new Error(
        `Batch map file not found for "${mapEntry.id}": ${mapEntry.path} (resolved to ${resolved}).`,
      );
    }
    const map = validateMap(readJson(resolved));
    if (map.id !== mapEntry.id) {
      throw new Error(
        `Batch map "${mapEntry.id}" does not match map file id "${map.id}" at ${mapEntry.path}.`,
      );
    }
    if (map.version !== mapEntry.version) {
      throw new Error(
        `Batch map "${mapEntry.id}" version "${mapEntry.version}" does not match map file version "${map.version}" at ${mapEntry.path}.`,
      );
    }
    mapHashes.set(mapEntry.id, computeFileHash(resolved));
    resolvedMapPaths.set(mapEntry.id, resolved);
  }

  const contenderIndex = new Map(batch.contenders.map((entry) => [entry.id, entry]));
  const matches: PlannedMatch[] = [];
  for (const mapEntry of batch.maps) {
    const mapPath = resolvedMapPaths.get(mapEntry.id)!;
    const mapHash = mapHashes.get(mapEntry.id)!;
    for (const matchup of batch.matchups) {
      for (const [permIndex, permutation] of batch.spawnPermutations.entries()) {
        for (const seed of batch.seeds) {
          const orderedContenders = permutation.map((slot) => {
            const contenderId = matchup.contenderIds[slot];
            if (contenderId === undefined) {
              throw new Error(
                `Spawn permutation ${permIndex} references slot ${slot} which is out of range for matchup "${matchup.id}".`,
              );
            }
            const contender = contenderIndex.get(contenderId);
            if (contender === undefined) {
              throw new Error(
                `Matchup "${matchup.id}" references unknown contender id "${contenderId}".`,
              );
            }
            return contender;
          });

          matches.push({
            matchId: buildMatchId(batch.id, mapEntry.id, matchup.id, permIndex, seed),
            mapId: mapEntry.id,
            mapVersion: mapEntry.version,
            mapPath,
            mapHash,
            matchupId: matchup.id,
            seed,
            spawnPermutation: permutation,
            contenders: orderedContenders.map((c) => ({
              id: c.id,
              adapterId: c.adapterId,
              ...(c.displayName !== undefined ? { displayName: c.displayName } : {}),
            })),
          });
        }
      }
    }
  }

  const limit = batch.runLimits?.maxMatches;
  if (limit !== undefined && limit < matches.length) {
    matches.splice(limit);
  }

  return { matches, mapHashes };
};

const synthesizeMatchConfig = (batch: BatchConfig, planned: PlannedMatch): MatchConfig => ({
  schemaVersion: SCHEMA_VERSION,
  id: planned.matchId,
  rulesetVersion: batch.rulesetVersion,
  map: {
    id: planned.mapId,
    version: planned.mapVersion,
    hash: planned.mapHash,
  },
  seed: planned.seed,
  maxTicks: batch.maxTicks,
  contenders: planned.contenders.map((c) => ({
    id: c.id,
    adapterId: c.adapterId,
    ...(c.displayName !== undefined ? { displayName: c.displayName } : {}),
  })),
  actionTimeoutMs: batch.actionTimeoutMs,
  invalidActionPolicy: { ...batch.invalidActionPolicy },
  capture: { ...batch.capture },
});

const errorCodeFromMessage = (message: string): string => {
  if (/map hash/i.test(message)) return 'map-hash-mismatch';
  if (/map id/i.test(message)) return 'map-id-mismatch';
  if (/map version/i.test(message)) return 'map-version-mismatch';
  if (/unknown adapter/i.test(message)) return 'unknown-adapter';
  if (/timed? out/i.test(message)) return 'timeout';
  if (/Invalid /.test(message)) return 'validation-failed';
  return 'match-error';
};

export async function runBatchCommand(
  options: RunBatchCommandOptions,
): Promise<RunBatchCommandSummary> {
  const configPath = resolve(options.configPath);
  const outDir = resolve(options.outDir);
  const configDir = dirname(configPath);

  const batch = validateBatchConfig(readJson(configPath));
  const { matches } = planMatches(batch, configDir);

  const batchOutDir = join(outDir, batch.id);
  const manifestPath = join(batchOutDir, MANIFEST_FILENAME);
  if (existsSync(manifestPath) && options.overwrite !== true) {
    throw new Error(
      `Batch output directory already contains a manifest at ${manifestPath}. Re-run with overwrite enabled or remove the directory.`,
    );
  }
  ensureDir(batchOutDir);

  const registry = options.registry ?? createBuiltinRegistry(options.providerOverrides ?? {});

  const runs: BatchRunRecord[] = [];
  let stop = false;
  let completedRuns = 0;
  let failedRuns = 0;
  let skippedRuns = 0;

  for (const [index, planned] of matches.entries()) {
    const matchOutDir = join(batchOutDir, MATCHES_DIRNAME, planned.matchId);
    const matchConfigPath = join(matchOutDir, MATCH_CONFIG_FILENAME);
    const replayPath = join(matchOutDir, SAFE_REPLAY_FILENAME);
    const resultPath = join(matchOutDir, RESULT_FILENAME);

    if (stop) {
      runs.push({
        matchId: planned.matchId,
        mapId: planned.mapId,
        mapVersion: planned.mapVersion,
        matchupId: planned.matchupId,
        seed: planned.seed,
        spawnPermutation: planned.spawnPermutation,
        contenders: planned.contenders,
        status: 'skipped',
        outputDir: toRelative(batchOutDir, matchOutDir),
      });
      skippedRuns += 1;
      options.onMatchEnd?.({
        index,
        total: matches.length,
        matchId: planned.matchId,
        status: 'skipped',
      });
      continue;
    }

    options.onMatchStart?.({ index, total: matches.length, matchId: planned.matchId });

    ensureDir(matchOutDir);
    const matchConfig = synthesizeMatchConfig(batch, planned);
    writeJson(matchConfigPath, matchConfig);

    let summary: RunMatchCommandSummary | undefined;
    let runError: { code: string; message: string } | undefined;
    try {
      summary = await runMatchCommand({
        configPath: matchConfigPath,
        mapPath: planned.mapPath,
        outDir: matchOutDir,
        registry,
        ...(options.snapshotIntervalTicks !== undefined
          ? { snapshotIntervalTicks: options.snapshotIntervalTicks }
          : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runError = { code: errorCodeFromMessage(message), message };
    }

    if (summary !== undefined && runError === undefined) {
      runs.push({
        matchId: planned.matchId,
        mapId: planned.mapId,
        mapVersion: planned.mapVersion,
        matchupId: planned.matchupId,
        seed: planned.seed,
        spawnPermutation: planned.spawnPermutation,
        contenders: planned.contenders,
        status: 'completed',
        outputDir: toRelative(batchOutDir, matchOutDir),
        configPath: toRelative(batchOutDir, matchConfigPath),
        replayPath: toRelative(batchOutDir, replayPath),
        resultPath: toRelative(batchOutDir, resultPath),
        winner: summary.winner,
        endReason: summary.endReason,
        ticksElapsed: summary.ticksElapsed,
        schemaViolations: summary.schemaViolations,
        providerErrors: summary.providerErrors,
      });
      completedRuns += 1;
      options.onMatchEnd?.({
        index,
        total: matches.length,
        matchId: planned.matchId,
        status: 'completed',
      });
      continue;
    }

    runs.push({
      matchId: planned.matchId,
      mapId: planned.mapId,
      mapVersion: planned.mapVersion,
      matchupId: planned.matchupId,
      seed: planned.seed,
      spawnPermutation: planned.spawnPermutation,
      contenders: planned.contenders,
      status: 'failed',
      outputDir: toRelative(batchOutDir, matchOutDir),
      configPath: toRelative(batchOutDir, matchConfigPath),
      error: runError ?? { code: 'match-error', message: 'Match failed without a recorded error.' },
    });
    failedRuns += 1;
    options.onMatchEnd?.({
      index,
      total: matches.length,
      matchId: planned.matchId,
      status: 'failed',
    });
    if (batch.failurePolicy.onMatchFailure === 'stop') {
      stop = true;
    }
  }

  const manifest: BatchManifest = {
    schemaVersion: BATCH_CONFIG_SCHEMA_VERSION,
    matchSchemaVersion: SCHEMA_VERSION,
    batchId: batch.id,
    rulesetVersion: batch.rulesetVersion,
    batchConfig: sanitizeBatchConfigForManifest(batch),
    summary: {
      totalRuns: matches.length,
      completedRuns,
      failedRuns,
      skippedRuns,
    },
    runs,
  };

  writeJson(manifestPath, manifest);

  return {
    batchId: batch.id,
    batchOutDir,
    manifestPath,
    totalRuns: matches.length,
    completedRuns,
    failedRuns,
    skippedRuns,
  };
}
