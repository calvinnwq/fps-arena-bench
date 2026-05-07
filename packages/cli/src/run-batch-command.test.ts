import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BATCH_CONFIG_SCHEMA_VERSION,
  validateBatchConfig,
  validateReplaySafeArtifact,
} from '@fps-arena-bench/schemas';

import { runBatchCommand, type BatchManifest } from './run-batch-command.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const defaultMapPath = join(repoRoot, 'maps/default-arena.json');
const exampleBatchPath = join(repoRoot, 'configs/examples/bot-batch.json');

const makeTempDir = (label: string): string => mkdtempSync(join(tmpdir(), `fps-batch-${label}-`));

const buildSmokeBatch = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: BATCH_CONFIG_SCHEMA_VERSION,
  id: 'smoke-batch',
  rulesetVersion: 'ruleset.v0.1',
  seeds: [7],
  maps: [{ id: 'default-arena', version: '0.1.0', path: defaultMapPath }],
  contenders: [
    { id: 'alpha', adapterId: 'random-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo' },
  ],
  matchups: [{ id: 'random-vs-chaser', contenderIds: ['alpha', 'bravo'] }],
  spawnPermutations: [
    [0, 1],
    [1, 0],
  ],
  maxTicks: 60,
  actionTimeoutMs: 1000,
  invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
  capture: { safeReplay: true, privateDebug: false },
  failurePolicy: { onMatchFailure: 'continue' },
  ...overrides,
});

const writeBatchConfig = (dir: string, config: unknown): string => {
  const path = join(dir, 'batch.json');
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return path;
};

describe('runBatchCommand', () => {
  it('runs every planned match deterministically and writes a manifest with relative paths', async () => {
    const work = makeTempDir('happy');
    try {
      const configPath = writeBatchConfig(work, buildSmokeBatch());
      const outDir = join(work, 'out');
      const summary = await runBatchCommand({ configPath, outDir });

      expect(summary.batchId).toBe('smoke-batch');
      expect(summary.totalRuns).toBe(2);
      expect(summary.completedRuns).toBe(2);
      expect(summary.failedRuns).toBe(0);
      expect(summary.skippedRuns).toBe(0);

      const manifest = JSON.parse(readFileSync(summary.manifestPath, 'utf8')) as BatchManifest;
      expect(manifest.schemaVersion).toBe(BATCH_CONFIG_SCHEMA_VERSION);
      expect(manifest.batchId).toBe('smoke-batch');
      expect(manifest.batchConfig.maps[0]?.path).toBe('default-arena.json');
      expect(manifest.batchConfig.maps[0]?.path.startsWith('/')).toBe(false);
      expect(manifest.runs.map((run) => run.matchId)).toEqual([
        'smoke-batch__default-arena__random-vs-chaser__p0__s7',
        'smoke-batch__default-arena__random-vs-chaser__p1__s7',
      ]);

      for (const run of manifest.runs) {
        expect(run.status).toBe('completed');
        expect(run.replayPath).toBeDefined();
        expect(run.resultPath).toBeDefined();
        expect(run.configPath).toBeDefined();
        // Relative paths only - no absolute leakage in manifest.
        expect(run.replayPath?.startsWith('/')).toBe(false);
        expect(run.resultPath?.startsWith('/')).toBe(false);

        const replayPath = join(summary.batchOutDir, run.replayPath!);
        const replay = validateReplaySafeArtifact(
          JSON.parse(readFileSync(replayPath, 'utf8')) as unknown,
        );
        expect(replay.matchId).toBe(run.matchId);
      }

      // Determinism: run again into a fresh out dir and compare manifests.
      const otherOut = join(work, 'out2');
      const summaryB = await runBatchCommand({ configPath, outDir: otherOut });
      const manifestA = readFileSync(summary.manifestPath, 'utf8');
      const manifestB = readFileSync(summaryB.manifestPath, 'utf8');
      expect(manifestA).toEqual(manifestB);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite an existing manifest unless overwrite is set', async () => {
    const work = makeTempDir('overwrite');
    try {
      const configPath = writeBatchConfig(work, buildSmokeBatch());
      const outDir = join(work, 'out');
      const first = await runBatchCommand({ configPath, outDir });
      expect(existsSync(first.manifestPath)).toBe(true);

      await expect(runBatchCommand({ configPath, outDir })).rejects.toThrow(
        /already contains a manifest/i,
      );

      const replay = await runBatchCommand({ configPath, outDir, overwrite: true });
      expect(replay.completedRuns).toBe(2);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('continues past a failing match when failurePolicy.onMatchFailure is continue', async () => {
    const work = makeTempDir('partial');
    try {
      const configPath = writeBatchConfig(
        work,
        buildSmokeBatch({
          contenders: [
            { id: 'alpha', adapterId: 'unknown-adapter', displayName: 'Alpha' },
            { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo' },
            { id: 'charlie', adapterId: 'random-bot', displayName: 'Charlie' },
          ],
          matchups: [
            { id: 'broken', contenderIds: ['alpha', 'bravo'] },
            { id: 'ok', contenderIds: ['charlie', 'bravo'] },
          ],
          spawnPermutations: [[0, 1]],
          failurePolicy: { onMatchFailure: 'continue' },
        }),
      );

      const outDir = join(work, 'out');
      const summary = await runBatchCommand({ configPath, outDir });

      expect(summary.totalRuns).toBe(2);
      expect(summary.failedRuns).toBe(1);
      expect(summary.completedRuns).toBe(1);
      expect(summary.skippedRuns).toBe(0);

      const manifest = JSON.parse(readFileSync(summary.manifestPath, 'utf8')) as BatchManifest;
      expect(manifest.runs[0]?.status).toBe('failed');
      expect(manifest.runs[0]?.error?.code).toBe('unknown-adapter');
      expect(manifest.runs[1]?.status).toBe('completed');
      // Successful artifacts not corrupted by failure of earlier match.
      const replayPath = join(summary.batchOutDir, manifest.runs[1]!.replayPath!);
      validateReplaySafeArtifact(JSON.parse(readFileSync(replayPath, 'utf8')) as unknown);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('stops scheduling further matches after a failure when failurePolicy.onMatchFailure is stop', async () => {
    const work = makeTempDir('stop');
    try {
      const configPath = writeBatchConfig(
        work,
        buildSmokeBatch({
          contenders: [
            { id: 'alpha', adapterId: 'unknown-adapter', displayName: 'Alpha' },
            { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo' },
            { id: 'charlie', adapterId: 'random-bot', displayName: 'Charlie' },
          ],
          matchups: [
            { id: 'broken', contenderIds: ['alpha', 'bravo'] },
            { id: 'never-ran', contenderIds: ['charlie', 'bravo'] },
          ],
          spawnPermutations: [[0, 1]],
          failurePolicy: { onMatchFailure: 'stop' },
        }),
      );

      const outDir = join(work, 'out');
      const summary = await runBatchCommand({ configPath, outDir });
      expect(summary.failedRuns).toBe(1);
      expect(summary.skippedRuns).toBe(1);
      expect(summary.completedRuns).toBe(0);

      const manifest = JSON.parse(readFileSync(summary.manifestPath, 'utf8')) as BatchManifest;
      expect(manifest.runs[0]?.status).toBe('failed');
      expect(manifest.runs[1]?.status).toBe('skipped');
      // No replay artifact written for skipped runs.
      expect(manifest.runs[1]?.replayPath).toBeUndefined();
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('does not persist absolute paths from failed match errors', async () => {
    const work = makeTempDir('error-paths');
    try {
      const mapPath = join(work, 'default-arena.json');
      const defaultMap = JSON.parse(readFileSync(defaultMapPath, 'utf8')) as Record<
        string,
        unknown
      >;
      writeFileSync(mapPath, `${JSON.stringify(defaultMap, null, 2)}\n`, 'utf8');

      const configPath = writeBatchConfig(
        work,
        buildSmokeBatch({
          maps: [{ id: 'default-arena', version: '0.1.0', path: mapPath }],
          spawnPermutations: [[0, 1]],
        }),
      );
      const outDir = join(work, 'out');
      const summary = await runBatchCommand({
        configPath,
        outDir,
        onMatchStart: () => {
          writeFileSync(
            mapPath,
            `${JSON.stringify({ ...defaultMap, version: '0.2.0' }, null, 2)}\n`,
            'utf8',
          );
        },
      });

      const manifestText = readFileSync(summary.manifestPath, 'utf8');
      const manifest = JSON.parse(manifestText) as BatchManifest;
      expect(manifest.runs[0]?.status).toBe('failed');
      expect(manifest.runs[0]?.error?.code).toBe('map-version-mismatch');
      expect(manifest.runs[0]?.error?.message).toContain('default-arena.json');
      expect(manifestText).not.toContain(work);
      expect(manifestText).not.toContain(mapPath);
      expect(manifestText).not.toContain(outDir);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('truncates planned runs to runLimits.maxMatches', async () => {
    const work = makeTempDir('limit');
    try {
      const configPath = writeBatchConfig(
        work,
        buildSmokeBatch({
          seeds: [1, 2, 3],
          spawnPermutations: [
            [0, 1],
            [1, 0],
          ],
          runLimits: { maxMatches: 2 },
        }),
      );
      const outDir = join(work, 'out');
      const summary = await runBatchCommand({ configPath, outDir });
      expect(summary.totalRuns).toBe(2);
      expect(summary.completedRuns).toBe(2);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('does not plan runs past runLimits.maxMatches', async () => {
    const work = makeTempDir('limit-plan');
    try {
      const defaultMap = JSON.parse(readFileSync(defaultMapPath, 'utf8')) as Record<
        string,
        unknown
      >;
      const mapAPath = join(work, 'map-a.json');
      const mapBPath = join(work, 'map-b.json');
      writeFileSync(
        mapAPath,
        `${JSON.stringify({ ...defaultMap, id: 'b__c' }, null, 2)}\n`,
        'utf8',
      );
      writeFileSync(mapBPath, `${JSON.stringify({ ...defaultMap, id: 'b' }, null, 2)}\n`, 'utf8');

      const configPath = writeBatchConfig(
        work,
        buildSmokeBatch({
          maps: [
            { id: 'b__c', version: '0.1.0', path: mapAPath },
            { id: 'b', version: '0.1.0', path: mapBPath },
          ],
          matchups: [
            { id: 'd', contenderIds: ['alpha', 'bravo'] },
            { id: 'c__d', contenderIds: ['alpha', 'bravo'] },
          ],
          spawnPermutations: [[0, 1]],
          runLimits: { maxMatches: 1 },
        }),
      );
      const outDir = join(work, 'out');
      const summary = await runBatchCommand({ configPath, outDir });
      expect(summary.totalRuns).toBe(1);
      expect(summary.completedRuns).toBe(1);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('rejects duplicate generated match ids', async () => {
    const work = makeTempDir('duplicate-match-id');
    try {
      const defaultMap = JSON.parse(readFileSync(defaultMapPath, 'utf8')) as Record<
        string,
        unknown
      >;
      const mapAPath = join(work, 'map-a.json');
      const mapBPath = join(work, 'map-b.json');
      writeFileSync(
        mapAPath,
        `${JSON.stringify({ ...defaultMap, id: 'b__c' }, null, 2)}\n`,
        'utf8',
      );
      writeFileSync(mapBPath, `${JSON.stringify({ ...defaultMap, id: 'b' }, null, 2)}\n`, 'utf8');

      const configPath = writeBatchConfig(
        work,
        buildSmokeBatch({
          maps: [
            { id: 'b__c', version: '0.1.0', path: mapAPath },
            { id: 'b', version: '0.1.0', path: mapBPath },
          ],
          matchups: [
            { id: 'd', contenderIds: ['alpha', 'bravo'] },
            { id: 'c__d', contenderIds: ['alpha', 'bravo'] },
          ],
          spawnPermutations: [[0, 1]],
        }),
      );
      const outDir = join(work, 'out');
      await expect(runBatchCommand({ configPath, outDir })).rejects.toThrow(
        /Duplicate generated match id/i,
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('rejects a batch config with a map id that mismatches the loaded map file', async () => {
    const work = makeTempDir('map-id');
    try {
      const configPath = writeBatchConfig(
        work,
        buildSmokeBatch({
          maps: [{ id: 'other-arena', version: '0.1.0', path: defaultMapPath }],
        }),
      );
      const outDir = join(work, 'out');
      await expect(runBatchCommand({ configPath, outDir })).rejects.toThrow(
        /does not match map file id/i,
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('rejects a batch config with a missing map file path', async () => {
    const work = makeTempDir('missing-map');
    try {
      const configPath = writeBatchConfig(
        work,
        buildSmokeBatch({
          maps: [{ id: 'default-arena', version: '0.1.0', path: 'maps/missing.json' }],
        }),
      );
      const outDir = join(work, 'out');
      await expect(runBatchCommand({ configPath, outDir })).rejects.toThrow(/not found/i);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('runs the example zero-credential batch config end-to-end', async () => {
    const out = makeTempDir('example');
    try {
      const summary = await runBatchCommand({ configPath: exampleBatchPath, outDir: out });
      const config = validateBatchConfig(
        JSON.parse(readFileSync(exampleBatchPath, 'utf8')) as unknown,
      );
      const expectedRuns =
        config.seeds.length *
        config.maps.length *
        config.matchups.length *
        config.spawnPermutations.length;
      expect(summary.totalRuns).toBe(expectedRuns);
      expect(summary.completedRuns).toBe(expectedRuns);
      expect(summary.failedRuns).toBe(0);
      const manifest = JSON.parse(readFileSync(summary.manifestPath, 'utf8')) as BatchManifest;
      expect(manifest.runs).toHaveLength(expectedRuns);
      // Manifest must not include absolute paths or env data.
      const manifestText = readFileSync(summary.manifestPath, 'utf8');
      expect(manifestText).not.toContain(out);
      expect(manifestText).not.toMatch(/raw[_-]?prompt/i);
      expect(manifestText).not.toMatch(/raw[_-]?output/i);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('rejects a batch id with unsafe characters in identifiers', async () => {
    const work = makeTempDir('unsafe');
    try {
      const configPath = writeBatchConfig(work, buildSmokeBatch({ id: 'unsafe id/with slash' }));
      const outDir = join(work, 'out');
      await expect(runBatchCommand({ configPath, outDir })).rejects.toThrow(/Invalid batch id/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('rejects reserved path components in batch ids', async () => {
    const work = makeTempDir('reserved-id');
    try {
      for (const id of ['.', '..']) {
        const configPath = writeBatchConfig(work, buildSmokeBatch({ id }));
        const outDir = join(work, 'out');
        await expect(runBatchCommand({ configPath, outDir })).rejects.toThrow(/Invalid batch id/);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
