#!/usr/bin/env node

import { ArgsError, helpText, parseArgs } from './args.js';
import { runMatchCommand, type RunMatchCommandSummary } from './run-match-command.js';

export const CLI_PACKAGE_VERSION = '0.0.0';

export { runMatchCommand } from './run-match-command.js';
export type { RunMatchCommandOptions, RunMatchCommandSummary } from './run-match-command.js';
export { parseArgs, helpText, ArgsError } from './args.js';
export type { ParsedCommand, ParsedRunArgs, ParsedHelpArgs } from './args.js';
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

  try {
    const summary = await runMatchCommand({
      configPath: parsed.configPath,
      mapPath: parsed.mapPath,
      outDir: parsed.outDir,
      ...(parsed.snapshotIntervalTicks !== undefined
        ? { snapshotIntervalTicks: parsed.snapshotIntervalTicks }
        : {}),
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
