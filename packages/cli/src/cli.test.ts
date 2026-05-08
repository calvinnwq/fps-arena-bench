import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, validateReplaySafeArtifact } from '@fps-arena-bench/schemas';

import { runCli } from './index.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const defaultMapPath = join(repoRoot, 'maps/default-arena.json');
const defaultConfigPath = join(repoRoot, 'configs/examples/bot-duel.json');
const mockConfigPath = join(repoRoot, 'configs/examples/mock-duel.json');
const claudeCliConfigPath = join(repoRoot, 'configs/examples/claude-cli-vs-baseline.json');

const captureStreams = () => {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  return {
    stdoutChunks,
    stderrChunks,
    io: {
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) },
      stderr: { write: (chunk: string) => stderrChunks.push(chunk) },
    },
  };
};

describe('runCli', () => {
  it('prints help when invoked with no arguments and returns 0', async () => {
    const { io, stdoutChunks } = captureStreams();
    const code = await runCli([], io);
    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toMatch(/Usage:/);
  });

  it('runs a match end-to-end and writes replay + result files', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fps-cli-cli-'));
    const { io, stdoutChunks } = captureStreams();
    try {
      const code = await runCli(
        ['run', '--config', defaultConfigPath, '--map', defaultMapPath, '--out', outDir],
        io,
      );
      expect(code).toBe(0);
      const summary = stdoutChunks.join('');
      expect(summary).toMatch(/match: bot-duel/);
      expect(summary).toMatch(/replay: /);
      const written = readdirSync(outDir).sort();
      expect(written).toEqual(['replay.safe.json', 'result.json']);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('suppresses stdout summary when --quiet is set', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fps-cli-quiet-'));
    const { io, stdoutChunks } = captureStreams();
    try {
      const code = await runCli(
        ['run', '--config', defaultConfigPath, '--map', defaultMapPath, '--out', outDir, '--quiet'],
        io,
      );
      expect(code).toBe(0);
      expect(stdoutChunks.join('')).toBe('');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('returns exit code 2 with usage text on argument errors', async () => {
    const { io, stderrChunks } = captureStreams();
    const code = await runCli(['run'], io);
    expect(code).toBe(2);
    const stderr = stderrChunks.join('');
    expect(stderr).toMatch(/--config/);
    expect(stderr).toMatch(/Usage:/);
  });

  it('runs doctor with fake harness CLIs and separates private diagnostics behind --private', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'fps-cli-doctor-'));
    const fakeBinDir = join(tmpRoot, 'bin');
    const previousPath = process.env.PATH;
    try {
      mkdirSync(fakeBinDir, { recursive: true });
      for (const command of ['claude', 'codex', 'opencode']) {
        const commandPath = join(fakeBinDir, command);
        writeFileSync(
          commandPath,
          ['#!/bin/sh', `printf '%s\\n' '${command} 1.0.0'`, ''].join('\n'),
        );
        chmodSync(commandPath, 0o755);
      }
      process.env.PATH = `${fakeBinDir}${process.platform === 'win32' ? ';' : ':'}${
        previousPath ?? ''
      }`;

      const publicRun = captureStreams();
      const publicCode = await runCli(['doctor'], publicRun.io);
      expect(publicCode).toBe(0);
      expect(publicRun.stdoutChunks.join('')).toMatch(/claude-cli: installed/);
      expect(publicRun.stdoutChunks.join('')).not.toMatch(/private diagnostics/);

      const privateRun = captureStreams();
      const privateCode = await runCli(['doctor', '--private'], privateRun.io);
      expect(privateCode).toBe(0);
      expect(privateRun.stdoutChunks.join('')).toMatch(/private diagnostics/);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('suppresses doctor stdout when --quiet is set', async () => {
    const { io, stdoutChunks } = captureStreams();
    await runCli(['doctor', '--quiet'], io);
    expect(stdoutChunks.join('')).toBe('');
  });

  it('runs the mock-duel example end-to-end and writes valid replay/result files', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fps-cli-mock-'));
    const { io, stdoutChunks } = captureStreams();
    try {
      const code = await runCli(
        ['run', '--config', mockConfigPath, '--map', defaultMapPath, '--out', outDir],
        io,
      );
      expect(code).toBe(0);
      const summary = stdoutChunks.join('');
      expect(summary).toMatch(/match: mock-duel/);
      expect(summary).toMatch(/schemaViolations: 0/);
      expect(summary).toMatch(/providerErrors: 0/);
      const written = readdirSync(outDir).sort();
      expect(written).toEqual(['replay.safe.json', 'result.json']);
      const replayJson = readFileSync(join(outDir, 'replay.safe.json'), 'utf8');
      validateReplaySafeArtifact(JSON.parse(replayJson) as unknown);
      expect(replayJson).not.toMatch(/raw[_-]?prompt/i);
      expect(replayJson).not.toMatch(/raw[_-]?output/i);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('enables the claude-cli example from environment variables with a fake local executable', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'fps-cli-env-claude-'));
    const fakeBinDir = join(tmpRoot, 'bin');
    const outDir = join(tmpRoot, 'out');
    const configPath = join(tmpRoot, 'claude-short.json');
    const fakeClaudePath = join(fakeBinDir, 'claude');
    const previousEnv = {
      PATH: process.env.PATH,
      FPS_ARENA_ENABLE_CLAUDE_CLI: process.env.FPS_ARENA_ENABLE_CLAUDE_CLI,
      FPS_ARENA_CLAUDE_COMMAND: process.env.FPS_ARENA_CLAUDE_COMMAND,
      FPS_ARENA_CLAUDE_TIMEOUT_MS: process.env.FPS_ARENA_CLAUDE_TIMEOUT_MS,
    };
    try {
      const shortConfig = {
        ...JSON.parse(readFileSync(claudeCliConfigPath, 'utf8')),
        maxTicks: 4,
        actionTimeoutMs: 5000,
      };
      writeFileSync(configPath, `${JSON.stringify(shortConfig, null, 2)}\n`, 'utf8');
      mkdirSync(fakeBinDir, { recursive: true });
      writeFileSync(
        fakeClaudePath,
        [
          '#!/bin/sh',
          'cat >/dev/null',
          `printf '%s\\n' '${JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'noop' })}'`,
          '',
        ].join('\n'),
        'utf8',
      );
      chmodSync(fakeClaudePath, 0o755);

      process.env.PATH = `${fakeBinDir}${process.platform === 'win32' ? ';' : ':'}${
        previousEnv.PATH ?? ''
      }`;
      process.env.FPS_ARENA_ENABLE_CLAUDE_CLI = '1';
      process.env.FPS_ARENA_CLAUDE_COMMAND = 'claude';
      process.env.FPS_ARENA_CLAUDE_TIMEOUT_MS = '5000';

      const { io, stdoutChunks } = captureStreams();
      const code = await runCli(
        ['run', '--config', configPath, '--map', defaultMapPath, '--out', outDir],
        io,
      );

      expect(code).toBe(0);
      expect(stdoutChunks.join('')).toMatch(/match: claude-cli-vs-baseline/);
      const replay = validateReplaySafeArtifact(
        JSON.parse(readFileSync(join(outDir, 'replay.safe.json'), 'utf8')) as unknown,
      );
      expect(replay.config.contenders.some((entry) => entry.adapterId === 'claude-cli')).toBe(true);
      const replayJson = readFileSync(join(outDir, 'replay.safe.json'), 'utf8');
      expect(replayJson).not.toMatch(/raw[_-]?prompt/i);
      expect(replayJson).not.toMatch(/raw[_-]?output/i);
    } finally {
      if (previousEnv.PATH === undefined) delete process.env.PATH;
      else process.env.PATH = previousEnv.PATH;
      if (previousEnv.FPS_ARENA_ENABLE_CLAUDE_CLI === undefined) {
        delete process.env.FPS_ARENA_ENABLE_CLAUDE_CLI;
      } else {
        process.env.FPS_ARENA_ENABLE_CLAUDE_CLI = previousEnv.FPS_ARENA_ENABLE_CLAUDE_CLI;
      }
      if (previousEnv.FPS_ARENA_CLAUDE_COMMAND === undefined) {
        delete process.env.FPS_ARENA_CLAUDE_COMMAND;
      } else {
        process.env.FPS_ARENA_CLAUDE_COMMAND = previousEnv.FPS_ARENA_CLAUDE_COMMAND;
      }
      if (previousEnv.FPS_ARENA_CLAUDE_TIMEOUT_MS === undefined) {
        delete process.env.FPS_ARENA_CLAUDE_TIMEOUT_MS;
      } else {
        process.env.FPS_ARENA_CLAUDE_TIMEOUT_MS = previousEnv.FPS_ARENA_CLAUDE_TIMEOUT_MS;
      }
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('runs the batch subcommand against the example bot batch config', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fps-cli-batch-'));
    const exampleBatchPath = join(repoRoot, 'configs/examples/bot-batch.json');
    const { io, stdoutChunks } = captureStreams();
    try {
      const code = await runCli(
        ['batch', '--config', exampleBatchPath, '--out', outDir, '--quiet'],
        io,
      );
      expect(code).toBe(0);
      expect(stdoutChunks.join('')).toBe('');
      const manifestPath = join(outDir, 'bot-batch', 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        runs: Array<{ status: string; replayPath?: string }>;
      };
      expect(manifest.runs.length).toBeGreaterThan(0);
      for (const run of manifest.runs) {
        expect(run.status).toBe('completed');
        expect(run.replayPath).toBeDefined();
        const replayPath = join(outDir, 'bot-batch', run.replayPath!);
        validateReplaySafeArtifact(JSON.parse(readFileSync(replayPath, 'utf8')) as unknown);
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('emits per-match progress and a batch summary on stdout when not quiet', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fps-cli-batch-progress-'));
    const exampleBatchPath = join(repoRoot, 'configs/examples/bot-batch.json');
    const { io, stdoutChunks } = captureStreams();
    try {
      const code = await runCli(['batch', '--config', exampleBatchPath, '--out', outDir], io);
      expect(code).toBe(0);
      const stdout = stdoutChunks.join('');
      expect(stdout).toMatch(/batch: bot-batch/);
      expect(stdout).toMatch(/totalRuns: \d+/);
      expect(stdout).toMatch(/running bot-batch/);
      expect(stdout).toMatch(/completed bot-batch/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('returns exit code 1 when the command throws', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fps-cli-err-'));
    const { io, stderrChunks } = captureStreams();
    try {
      const code = await runCli(
        [
          'run',
          '--config',
          join(outDir, 'does-not-exist.json'),
          '--map',
          defaultMapPath,
          '--out',
          outDir,
        ],
        io,
      );
      expect(code).toBe(1);
      expect(stderrChunks.join('')).toMatch(/fps-arena-bench:/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
