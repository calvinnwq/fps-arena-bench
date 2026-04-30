import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  validateMatchConfig,
  validateMap,
  validateReplaySafeArtifact,
  type ResultSummary,
} from '@fps-arena-bench/schemas';

import { runMatchCommand } from './run-match-command.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const defaultMapPath = join(repoRoot, 'maps/default-arena.json');
const defaultConfigPath = join(repoRoot, 'configs/examples/bot-duel.json');

const makeTempDir = (label: string): string => mkdtempSync(join(tmpdir(), `fps-cli-${label}-`));

describe('runMatchCommand', () => {
  it('runs a baseline bot duel and writes a safe replay artifact and result summary', async () => {
    const outDir = makeTempDir('happy');
    try {
      const summary = await runMatchCommand({
        configPath: defaultConfigPath,
        mapPath: defaultMapPath,
        outDir,
      });

      expect(summary.replayPath).toBe(join(outDir, 'replay.safe.json'));
      expect(summary.resultPath).toBe(join(outDir, 'result.json'));
      expect(summary.matchId).toBe('bot-duel');
      expect(summary.ticksElapsed).toBeGreaterThan(0);
      expect(summary.placements).toHaveLength(2);
      expect(summary.schemaViolations).toBe(0);

      const replay = JSON.parse(readFileSync(summary.replayPath, 'utf8')) as unknown;
      const validatedReplay = validateReplaySafeArtifact(replay);
      expect(validatedReplay.matchId).toBe('bot-duel');
      expect(validatedReplay.config.id).toBe('bot-duel');
      expect(validatedReplay.map.id).toBe('default-arena');
      expect(validatedReplay.acceptedActions.length).toBeGreaterThan(0);

      const result = JSON.parse(readFileSync(summary.resultPath, 'utf8')) as ResultSummary;
      expect(result.matchId).toBe('bot-duel');
      expect(result.placements.map((entry) => entry.rank).sort()).toEqual([1, 2]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('is deterministic across runs with the same config and seed', async () => {
    const outDirA = makeTempDir('detA');
    const outDirB = makeTempDir('detB');
    try {
      const summaryA = await runMatchCommand({
        configPath: defaultConfigPath,
        mapPath: defaultMapPath,
        outDir: outDirA,
      });
      const summaryB = await runMatchCommand({
        configPath: defaultConfigPath,
        mapPath: defaultMapPath,
        outDir: outDirB,
      });

      const replayA = readFileSync(summaryA.replayPath, 'utf8');
      const replayB = readFileSync(summaryB.replayPath, 'utf8');
      expect(replayA).toEqual(replayB);
    } finally {
      rmSync(outDirA, { recursive: true, force: true });
      rmSync(outDirB, { recursive: true, force: true });
    }
  });

  it('rejects a config whose map hash does not match the loaded map file', async () => {
    const map = validateMap(JSON.parse(readFileSync(defaultMapPath, 'utf8')) as unknown);
    const config = validateMatchConfig(
      JSON.parse(readFileSync(defaultConfigPath, 'utf8')) as unknown,
    );
    void map;
    void config;

    const tampered = {
      ...JSON.parse(readFileSync(defaultConfigPath, 'utf8')),
      map: {
        id: 'default-arena',
        version: '0.1.0',
        hash: `sha256:${'0'.repeat(64)}`,
      },
    };

    const tmpConfigDir = makeTempDir('hash');
    const tamperedPath = join(tmpConfigDir, 'tampered.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(tamperedPath, JSON.stringify(tampered));
    const outDir = makeTempDir('hash-out');

    try {
      await expect(
        runMatchCommand({
          configPath: tamperedPath,
          mapPath: defaultMapPath,
          outDir,
        }),
      ).rejects.toThrow(/map hash/i);
    } finally {
      rmSync(tmpConfigDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('throws when a contender adapterId is not registered', async () => {
    const tampered = {
      ...JSON.parse(readFileSync(defaultConfigPath, 'utf8')),
      contenders: [
        { id: 'alpha', adapterId: 'unknown-adapter', displayName: 'Alpha' },
        { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo' },
      ],
    };

    const tmpConfigDir = makeTempDir('reg');
    const tamperedPath = join(tmpConfigDir, 'tampered.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(tamperedPath, JSON.stringify(tampered));
    const outDir = makeTempDir('reg-out');

    try {
      await expect(
        runMatchCommand({
          configPath: tamperedPath,
          mapPath: defaultMapPath,
          outDir,
        }),
      ).rejects.toThrow(/unknown-adapter/);
    } finally {
      rmSync(tmpConfigDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
