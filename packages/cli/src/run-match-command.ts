import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { ActionProvider } from '@fps-arena-bench/contracts';
import { hashMatchState, createMatchState } from '@fps-arena-bench/core';
import { runBotMatch } from '@fps-arena-bench/bots';
import { MatchRecorder } from '@fps-arena-bench/replay';
import {
  validateMap,
  validateMatchConfig,
  type MapDefinition,
  type MatchConfig,
  type ReplaySafeArtifact,
  type ResultSummary,
} from '@fps-arena-bench/schemas';

import { createBuiltinRegistry, type ProviderFactory, type ProviderRegistry } from './registry.js';

export interface RunMatchCommandOptions {
  readonly configPath: string;
  readonly mapPath: string;
  readonly outDir: string;
  readonly snapshotIntervalTicks?: number;
  readonly registry?: ProviderRegistry;
  readonly providerOverrides?: Readonly<Record<string, ProviderFactory>>;
}

export interface RunMatchCommandSummary {
  readonly matchId: string;
  readonly winner: string | null;
  readonly endReason: string;
  readonly ticksElapsed: number;
  readonly placements: ResultSummary['placements'];
  readonly schemaViolations: number;
  readonly providerErrors: number;
  readonly replayPath: string;
  readonly resultPath: string;
}

const SAFE_REPLAY_FILENAME = 'replay.safe.json';
const RESULT_FILENAME = 'result.json';

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

const ensureDir = (path: string): void => {
  mkdirSync(path, { recursive: true });
};

const writeJsonAtomic = (path: string, value: unknown): void => {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const validateConfigVersusMap = (
  config: MatchConfig,
  map: MapDefinition,
  mapPath: string,
): void => {
  if (config.map.id !== map.id) {
    throw new Error(
      `Match config map id "${config.map.id}" does not match loaded map id "${map.id}" at ${mapPath}.`,
    );
  }
  if (config.map.version !== map.version) {
    throw new Error(
      `Match config map version "${config.map.version}" does not match loaded map version "${map.version}" at ${mapPath}.`,
    );
  }
  const computed = computeFileHash(mapPath);
  if (computed !== config.map.hash) {
    throw new Error(
      `Match config map hash ${config.map.hash} does not match loaded map file hash ${computed} at ${mapPath}.`,
    );
  }
};

const buildProviders = (
  config: MatchConfig,
  registry: ProviderRegistry,
): Map<string, ActionProvider> => {
  const providers = new Map<string, ActionProvider>();
  for (const contender of config.contenders) {
    if (!registry.has(contender.adapterId)) {
      throw new Error(
        `Contender ${contender.id} requested unknown adapter "${contender.adapterId}".`,
      );
    }
    const provider = registry.build({
      contenderId: contender.id,
      adapterId: contender.adapterId,
      displayName: contender.displayName,
      seed: config.seed,
    });
    providers.set(contender.id, provider);
  }
  return providers;
};

export async function runMatchCommand(
  options: RunMatchCommandOptions,
): Promise<RunMatchCommandSummary> {
  const configPath = resolve(options.configPath);
  const mapPath = resolve(options.mapPath);
  const outDir = resolve(options.outDir);

  const config = validateMatchConfig(readJson(configPath));
  const map = validateMap(readJson(mapPath));
  validateConfigVersusMap(config, map, mapPath);

  const registry = options.registry ?? createBuiltinRegistry(options.providerOverrides ?? {});
  const providers = buildProviders(config, registry);

  const seedState = createMatchState({ config, map });
  const initialPreTickHash = hashMatchState(seedState);

  const recorder = new MatchRecorder({
    matchId: config.id,
    config,
    map,
    initialPreTickHash,
    timeoutBudgetMs: config.actionTimeoutMs,
    ...(options.snapshotIntervalTicks !== undefined
      ? { snapshotIntervalTicks: options.snapshotIntervalTicks }
      : {}),
  });

  const matchOutcome = await runBotMatch({ config, map, providers });

  for (const tick of matchOutcome.ticks) {
    recorder.recordTick({
      tick: tick.tick,
      inputs: tick.inputs,
      latencyMsByContenderId: tick.latencyMsByContenderId,
      result: tick.result,
    });
  }

  const fallbackActions =
    matchOutcome.providerErrors + matchOutcome.schemaViolations + matchOutcome.timeouts;
  const artifact: ReplaySafeArtifact = recorder.build({
    state: matchOutcome.state,
    reliability: {
      invalidJson: 0,
      schemaFailures: matchOutcome.schemaViolations,
      repairAttempts: 0,
      repairSuccesses: 0,
      timeouts: matchOutcome.timeouts,
      fallbackActions,
    },
  });

  ensureDir(outDir);
  const replayPath = join(outDir, SAFE_REPLAY_FILENAME);
  const resultPath = join(outDir, RESULT_FILENAME);
  writeJsonAtomic(replayPath, artifact);
  writeJsonAtomic(resultPath, artifact.result);

  return {
    matchId: config.id,
    winner: artifact.result.winner,
    endReason: matchOutcome.state.endReason ?? 'unknown',
    ticksElapsed: artifact.result.ticksElapsed,
    placements: artifact.result.placements,
    schemaViolations: matchOutcome.schemaViolations,
    providerErrors: matchOutcome.providerErrors,
    replayPath,
    resultPath,
  };
}
