import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runCli } from './index.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const defaultMapPath = join(repoRoot, 'maps/default-arena.json');
const defaultConfigPath = join(repoRoot, 'configs/examples/bot-duel.json');
const mockConfigPath = join(repoRoot, 'configs/examples/mock-duel.json');

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
