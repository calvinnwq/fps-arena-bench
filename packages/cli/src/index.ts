#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { aggregateBatch, type AggregateBatchResult } from './aggregate-batch.js';
import { ArgsError, helpText, parseArgs } from './args.js';
import { buildEnvProviderOverrides } from './env-provider-overrides.js';
import { createBuiltinRegistry } from './registry.js';
import {
  runBatchCommand,
  type BatchMatchEndEvent,
  type BatchMatchStartEvent,
  type RunBatchCommandSummary,
} from './run-batch-command.js';
import { runMatchCommand, type RunMatchCommandSummary } from './run-match-command.js';

export const CLI_PACKAGE_VERSION = '0.0.0';

const AGGREGATE_JSON_FILENAME = 'aggregate.json';
const AGGREGATE_CSV_FILENAME = 'aggregate.csv';

export { runMatchCommand } from './run-match-command.js';
export type { RunMatchCommandOptions, RunMatchCommandSummary } from './run-match-command.js';
export { runBatchCommand } from './run-batch-command.js';
export type {
  RunBatchCommandOptions,
  RunBatchCommandSummary,
  BatchManifest,
  BatchRunRecord,
  BatchRunStatus,
  BatchMatchStartEvent,
  BatchMatchEndEvent,
} from './run-batch-command.js';
export { aggregateBatch } from './aggregate-batch.js';
export type {
  AggregateBatchOptions,
  AggregateBatchResult,
  AggregateSummary,
  AdapterAggregate,
  MatchupAggregate,
  MatchupContenderOutcome,
  AggregateFailureEntry,
} from './aggregate-batch.js';
export { AGGREGATE_SCHEMA_VERSION, CSV_HEADERS, csvEscape } from './aggregate-batch.js';
export { parseArgs, helpText, ArgsError } from './args.js';
export type {
  ParsedCommand,
  ParsedRunArgs,
  ParsedBatchArgs,
  ParsedSummarizeArgs,
  ParsedHelpArgs,
} from './args.js';
export { buildEnvProviderOverrides } from './env-provider-overrides.js';
export type { EnvProviderOverrides } from './env-provider-overrides.js';
export { BUILTIN_ADAPTER_IDS, createBuiltinRegistry } from './registry.js';
export type { ProviderFactory, ProviderFactoryRequest, ProviderRegistry } from './registry.js';

export interface CliIo {
  readonly stdout: { write(chunk: string): void };
  readonly stderr: { write(chunk: string): void };
}

const formatSummary = (summary: RunMatchCommandSummary): string => {
  const winnerLine = summary.winner === null ? 'winner: <draw>' : `winner: ${summary.winner}`;
  const placements = summary.placements
    .map((entry) => `  ${entry.rank}. ${entry.contenderId}`)
    .join('\n');
  return [
    `match: ${summary.matchId}`,
    winnerLine,
    `endReason: ${summary.endReason}`,
    `ticksElapsed: ${summary.ticksElapsed}`,
    `schemaViolations: ${summary.schemaViolations}`,
    `providerErrors: ${summary.providerErrors}`,
    'placements:',
    placements,
    `replay: ${summary.replayPath}`,
    `result: ${summary.resultPath}`,
    '',
  ].join('\n');
};

const formatBatchSummary = (summary: RunBatchCommandSummary): string =>
  [
    `batch: ${summary.batchId}`,
    `totalRuns: ${summary.totalRuns}`,
    `completedRuns: ${summary.completedRuns}`,
    `failedRuns: ${summary.failedRuns}`,
    `skippedRuns: ${summary.skippedRuns}`,
    `manifest: ${summary.manifestPath}`,
    `outDir: ${summary.batchOutDir}`,
    '',
  ].join('\n');

const formatAggregateSummary = (
  result: AggregateBatchResult,
  jsonPath: string,
  csvPath: string,
): string => {
  const s = result.summary;
  return [
    `aggregate: ${s.batchId}`,
    `resultsLoaded: ${s.runCounts.resultsLoaded}`,
    `resultsMissing: ${s.runCounts.resultsMissing}`,
    `adapters: ${Object.keys(s.byAdapter).join(', ')}`,
    `matchups: ${Object.keys(s.byMatchup).join(', ')}`,
    `failures: ${s.failures.length}`,
    `json: ${jsonPath}`,
    `csv: ${csvPath}`,
    '',
  ].join('\n');
};

export async function runCli(
  argv: readonly string[],
  io: CliIo = { stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (error instanceof ArgsError) {
      io.stderr.write(`${error.message}\n`);
      io.stderr.write(helpText());
      return 2;
    }
    throw error;
  }

  if (parsed.command === 'help') {
    io.stdout.write(helpText());
    return 0;
  }

  if (parsed.command === 'summarize') {
    try {
      const manifestPath = resolve(parsed.manifestPath);
      const outDir = parsed.outDir !== undefined ? resolve(parsed.outDir) : dirname(manifestPath);
      const jsonPath = join(outDir, AGGREGATE_JSON_FILENAME);
      const csvPath = join(outDir, AGGREGATE_CSV_FILENAME);

      if ((existsSync(jsonPath) || existsSync(csvPath)) && !parsed.overwrite) {
        throw new Error(
          `Aggregate output already exists at ${outDir}. Re-run with --overwrite or remove the files.`,
        );
      }

      const result = aggregateBatch({ manifestPath, strict: parsed.strict });

      mkdirSync(outDir, { recursive: true });
      writeFileSync(jsonPath, `${JSON.stringify(result.summary, null, 2)}\n`, 'utf8');
      writeFileSync(csvPath, result.csv, 'utf8');

      if (!parsed.quiet) {
        io.stdout.write(formatAggregateSummary(result, jsonPath, csvPath));
      }
      return result.summary.runCounts.resultsMissing > 0 ? 1 : 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`fps-arena-bench: ${message}\n`);
      return 1;
    }
  }

  if (parsed.command === 'batch') {
    try {
      const overrides = buildEnvProviderOverrides(process.env);
      const registry = createBuiltinRegistry(overrides);
      const onMatchStart = parsed.quiet
        ? undefined
        : (event: BatchMatchStartEvent) => {
            io.stdout.write(`[${event.index + 1}/${event.total}] running ${event.matchId}\n`);
          };
      const onMatchEnd = parsed.quiet
        ? undefined
        : (event: BatchMatchEndEvent) => {
            io.stdout.write(
              `[${event.index + 1}/${event.total}] ${event.status} ${event.matchId}\n`,
            );
          };
      const summary = await runBatchCommand({
        configPath: parsed.configPath,
        outDir: parsed.outDir,
        registry,
        overwrite: parsed.overwrite,
        ...(parsed.snapshotIntervalTicks !== undefined
          ? { snapshotIntervalTicks: parsed.snapshotIntervalTicks }
          : {}),
        ...(onMatchStart ? { onMatchStart } : {}),
        ...(onMatchEnd ? { onMatchEnd } : {}),
      });
      if (!parsed.quiet) {
        io.stdout.write(formatBatchSummary(summary));
      }
      return summary.failedRuns > 0 ? 1 : 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`fps-arena-bench: ${message}\n`);
      return 1;
    }
  }

  try {
    const summary = await runMatchCommand({
      configPath: parsed.configPath,
      mapPath: parsed.mapPath,
      outDir: parsed.outDir,
      ...(parsed.snapshotIntervalTicks !== undefined
        ? { snapshotIntervalTicks: parsed.snapshotIntervalTicks }
        : {}),
      providerOverrides: buildEnvProviderOverrides(process.env),
    });
    if (!parsed.quiet) {
      io.stdout.write(formatSummary(summary));
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`fps-arena-bench: ${message}\n`);
    return 1;
  }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    const url = new URL(`file://${entry}`);
    return import.meta.url === url.href;
  } catch {
    return false;
  }
};

if (isMainModule()) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
