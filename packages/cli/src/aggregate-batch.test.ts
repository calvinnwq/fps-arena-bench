import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BATCH_CONFIG_SCHEMA_VERSION, SCHEMA_VERSION } from '@fps-arena-bench/schemas';

import {
  AGGREGATE_SCHEMA_VERSION,
  CSV_HEADERS,
  aggregateBatch,
  csvEscape,
} from './aggregate-batch.js';
import { runBatchCommand, type BatchManifest } from './run-batch-command.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const exampleBatchPath = join(repoRoot, 'configs/examples/bot-batch.json');

const makeTempDir = (label: string): string => mkdtempSync(join(tmpdir(), `fps-agg-${label}-`));

const makeResultSummary = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: SCHEMA_VERSION,
  matchId: 'test-match-001',
  winner: 'alpha',
  placements: [
    { contenderId: 'alpha', rank: 1 },
    { contenderId: 'bravo', rank: 2 },
  ],
  ticksElapsed: 100,
  stats: {
    alpha: {
      kills: 3,
      deaths: 1,
      damageDealt: 150,
      damageTaken: 50,
      survivalTicks: 100,
      pickupsCollected: 2,
    },
    bravo: {
      kills: 1,
      deaths: 3,
      damageDealt: 50,
      damageTaken: 150,
      survivalTicks: 60,
      pickupsCollected: 1,
    },
  },
  reliability: {
    invalidJson: 0,
    schemaFailures: 1,
    repairAttempts: 0,
    repairSuccesses: 0,
    timeouts: 0,
    fallbackActions: 1,
  },
  latency: { averageMs: 200, p50Ms: 180, p95Ms: 350, timeoutBudgetMs: 1000 },
  ...overrides,
});

const writeManifest = (dir: string, manifest: unknown): string => {
  const path = join(dir, 'manifest.json');
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return path;
};

const writeResult = (dir: string, relPath: string, result: unknown): void => {
  const full = join(dir, relPath);
  mkdirSync(full.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(full, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
};

const makeManifest = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: BATCH_CONFIG_SCHEMA_VERSION,
  matchSchemaVersion: SCHEMA_VERSION,
  batchId: 'test-batch',
  rulesetVersion: 'ruleset.v0.1',
  batchConfig: {
    schemaVersion: BATCH_CONFIG_SCHEMA_VERSION,
    id: 'test-batch',
    rulesetVersion: 'ruleset.v0.1',
    seeds: [7],
    maps: [{ id: 'default-arena', version: '0.1.0', path: 'default-arena.json' }],
    contenders: [
      { id: 'alpha', adapterId: 'random-bot', displayName: 'Alpha Bot' },
      { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo Bot' },
    ],
    matchups: [{ id: 'random-vs-chaser', contenderIds: ['alpha', 'bravo'] }],
    spawnPermutations: [[0, 1]],
    maxTicks: 100,
    actionTimeoutMs: 1000,
    invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
    capture: { safeReplay: true, privateDebug: false },
    failurePolicy: { onMatchFailure: 'continue' },
  },
  summary: {
    totalRuns: 1,
    completedRuns: 1,
    failedRuns: 0,
    skippedRuns: 0,
  },
  runs: [
    {
      matchId: 'test-match-001',
      mapId: 'default-arena',
      mapVersion: '0.1.0',
      matchupId: 'random-vs-chaser',
      seed: 7,
      spawnPermutation: [0, 1],
      contenders: [
        { id: 'alpha', adapterId: 'random-bot', displayName: 'Alpha Bot' },
        { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo Bot' },
      ],
      status: 'completed',
      outputDir: 'matches/test-match-001',
      configPath: 'matches/test-match-001/config.json',
      replayPath: 'matches/test-match-001/replay.safe.json',
      resultPath: 'matches/test-match-001/result.json',
      winner: 'alpha',
      endReason: 'elimination',
      ticksElapsed: 100,
      schemaViolations: 1,
      providerErrors: 0,
    },
  ],
  ...overrides,
});

describe('csvEscape', () => {
  it('returns plain strings unchanged', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape('123')).toBe('123');
    expect(csvEscape(42)).toBe('42');
  });

  it('wraps strings containing commas in double quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('wraps strings containing double quotes and escapes them', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps strings containing newlines in double quotes', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('returns empty string for undefined', () => {
    expect(csvEscape(undefined)).toBe('');
  });
});

describe('aggregateBatch', () => {
  it('throws when the manifest file is missing', () => {
    expect(() => aggregateBatch({ manifestPath: '/does/not/exist/manifest.json' })).toThrow(
      /Failed to read manifest/,
    );
  });

  it('aggregates a single completed run correctly', () => {
    const dir = makeTempDir('single');
    try {
      writeResult(dir, 'matches/test-match-001/result.json', makeResultSummary());
      const manifestPath = writeManifest(dir, makeManifest());

      const { summary } = aggregateBatch({
        manifestPath,
        now: () => '2026-01-01T00:00:00.000Z',
      });

      expect(summary.schemaVersion).toBe(AGGREGATE_SCHEMA_VERSION);
      expect(summary.generatedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(summary.batchId).toBe('test-batch');
      expect(summary.rulesetVersion).toBe('ruleset.v0.1');
      expect(summary.runCounts).toEqual({
        total: 1,
        completed: 1,
        failed: 0,
        skipped: 0,
        resultsLoaded: 1,
        resultsMissing: 0,
      });
      expect(summary.failures).toHaveLength(0);

      // Per-adapter aggregates
      expect(Object.keys(summary.byAdapter).sort()).toEqual(['chaser-bot', 'random-bot']);
      const randomBot = summary.byAdapter['random-bot'];
      expect(randomBot?.adapterId).toBe('random-bot');
      expect(randomBot?.wins).toBe(1);
      expect(randomBot?.draws).toBe(0);
      expect(randomBot?.losses).toBe(0);
      expect(randomBot?.matchesPlayed).toBe(1);
      expect(randomBot?.tactical.kills).toBe(3);
      expect(randomBot?.tactical.deaths).toBe(1);

      const chaserBot = summary.byAdapter['chaser-bot'];
      expect(chaserBot?.wins).toBe(0);
      expect(chaserBot?.losses).toBe(1);
      expect(chaserBot?.tactical.kills).toBe(1);

      // Per-matchup aggregates
      expect(Object.keys(summary.byMatchup)).toEqual(['random-vs-chaser']);
      const matchup = summary.byMatchup['random-vs-chaser'];
      expect(matchup?.matchesPlayed).toBe(1);
      expect(matchup?.contenderOutcomes['random-bot']?.wins).toBe(1);
      expect(matchup?.contenderOutcomes['chaser-bot']?.losses).toBe(1);

      // Reliability
      expect(summary.matchReliability.totalSchemaFailures).toBe(1);
      expect(summary.matchReliability.totalFallbackActions).toBe(1);
      expect(summary.matchReliability.totalInvalidJson).toBe(0);

      // Latency
      expect(summary.matchLatency.matchCount).toBe(1);
      expect(summary.matchLatency.sumAverageMeanMs).toBe(200);
      expect(summary.matchLatency.sumAverageP50Ms).toBe(180);
      expect(summary.matchLatency.sumAverageP95Ms).toBe(350);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is deterministic for identical inputs', () => {
    const dir = makeTempDir('determinism');
    try {
      writeResult(dir, 'matches/test-match-001/result.json', makeResultSummary());
      const manifestPath = writeManifest(dir, makeManifest());

      const fixedNow = () => '2026-01-01T00:00:00.000Z';
      const a = aggregateBatch({ manifestPath, now: fixedNow });
      const b = aggregateBatch({ manifestPath, now: fixedNow });

      expect(JSON.stringify(a.summary)).toBe(JSON.stringify(b.summary));
      expect(a.csv).toBe(b.csv);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records failed and skipped runs in failures without crashing', () => {
    const dir = makeTempDir('failures');
    try {
      const manifest = makeManifest({
        summary: { totalRuns: 3, completedRuns: 0, failedRuns: 1, skippedRuns: 1 },
        runs: [
          {
            matchId: 'failed-match',
            mapId: 'default-arena',
            mapVersion: '0.1.0',
            matchupId: 'random-vs-chaser',
            seed: 1,
            spawnPermutation: [0, 1],
            contenders: [
              { id: 'alpha', adapterId: 'random-bot' },
              { id: 'bravo', adapterId: 'chaser-bot' },
            ],
            status: 'failed',
            outputDir: 'matches/failed-match',
            error: { code: 'unknown-adapter', message: 'No such adapter' },
          },
          {
            matchId: 'skipped-match',
            mapId: 'default-arena',
            mapVersion: '0.1.0',
            matchupId: 'random-vs-chaser',
            seed: 2,
            spawnPermutation: [0, 1],
            contenders: [
              { id: 'alpha', adapterId: 'random-bot' },
              { id: 'bravo', adapterId: 'chaser-bot' },
            ],
            status: 'skipped',
            outputDir: 'matches/skipped-match',
          },
        ],
      });

      const manifestPath = writeManifest(dir, manifest);
      const { summary, csv } = aggregateBatch({
        manifestPath,
        now: () => '2026-01-01T00:00:00.000Z',
      });

      expect(summary.failures).toHaveLength(2);
      const failedEntry = summary.failures.find((f) => f.matchId === 'failed-match');
      expect(failedEntry?.status).toBe('failed');
      expect(failedEntry?.code).toBe('unknown-adapter');
      const skippedEntry = summary.failures.find((f) => f.matchId === 'skipped-match');
      expect(skippedEntry?.status).toBe('skipped');
      expect(summary.runCounts.resultsLoaded).toBe(0);

      // CSV should only have the header line since no completed runs
      const lines = csv.trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe(CSV_HEADERS.join(','));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks a completed run as result-missing when result.json is absent', () => {
    const dir = makeTempDir('missing');
    try {
      const manifestPath = writeManifest(dir, makeManifest());
      // No result.json written

      const { summary } = aggregateBatch({ manifestPath, now: () => '2026-01-01T00:00:00.000Z' });
      expect(summary.runCounts.resultsMissing).toBe(1);
      expect(summary.runCounts.resultsLoaded).toBe(0);
      const missing = summary.failures.find((f) => f.matchId === 'test-match-001');
      expect(missing?.status).toBe('result-missing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks a completed run as result-corrupt when result.json is invalid JSON', () => {
    const dir = makeTempDir('corrupt');
    try {
      mkdirSync(join(dir, 'matches/test-match-001'), { recursive: true });
      writeFileSync(join(dir, 'matches/test-match-001/result.json'), 'not-json', 'utf8');
      const manifestPath = writeManifest(dir, makeManifest());

      const { summary } = aggregateBatch({ manifestPath, now: () => '2026-01-01T00:00:00.000Z' });
      expect(summary.runCounts.resultsMissing).toBe(1);
      const corrupt = summary.failures.find((f) => f.matchId === 'test-match-001');
      expect(corrupt?.status).toBe('result-corrupt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws in strict mode when a result.json is missing', () => {
    const dir = makeTempDir('strict');
    try {
      const manifestPath = writeManifest(dir, makeManifest());
      // No result.json written
      expect(() => aggregateBatch({ manifestPath, strict: true })).toThrow(/Strict mode/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accumulates multiple runs per adapter correctly', () => {
    const dir = makeTempDir('multi');
    try {
      const result1 = makeResultSummary({
        matchId: 'match-001',
        winner: 'alpha',
        placements: [
          { contenderId: 'alpha', rank: 1 },
          { contenderId: 'bravo', rank: 2 },
        ],
        stats: {
          alpha: {
            kills: 2,
            deaths: 0,
            damageDealt: 100,
            damageTaken: 10,
            survivalTicks: 80,
            pickupsCollected: 1,
          },
          bravo: {
            kills: 0,
            deaths: 2,
            damageDealt: 10,
            damageTaken: 100,
            survivalTicks: 30,
            pickupsCollected: 0,
          },
        },
      });
      const result2 = makeResultSummary({
        matchId: 'match-002',
        winner: 'bravo',
        placements: [
          { contenderId: 'bravo', rank: 1 },
          { contenderId: 'alpha', rank: 2 },
        ],
        stats: {
          alpha: {
            kills: 0,
            deaths: 2,
            damageDealt: 20,
            damageTaken: 80,
            survivalTicks: 20,
            pickupsCollected: 0,
          },
          bravo: {
            kills: 2,
            deaths: 0,
            damageDealt: 80,
            damageTaken: 20,
            survivalTicks: 90,
            pickupsCollected: 3,
          },
        },
      });

      writeResult(dir, 'matches/match-001/result.json', result1);
      writeResult(dir, 'matches/match-002/result.json', result2);

      const manifest = makeManifest({
        summary: { totalRuns: 2, completedRuns: 2, failedRuns: 0, skippedRuns: 0 },
        runs: [
          {
            matchId: 'match-001',
            mapId: 'default-arena',
            mapVersion: '0.1.0',
            matchupId: 'random-vs-chaser',
            seed: 1,
            spawnPermutation: [0, 1],
            contenders: [
              { id: 'alpha', adapterId: 'random-bot', displayName: 'Alpha Bot' },
              { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo Bot' },
            ],
            status: 'completed',
            outputDir: 'matches/match-001',
            resultPath: 'matches/match-001/result.json',
            winner: 'alpha',
          },
          {
            matchId: 'match-002',
            mapId: 'default-arena',
            mapVersion: '0.1.0',
            matchupId: 'random-vs-chaser',
            seed: 2,
            spawnPermutation: [0, 1],
            contenders: [
              { id: 'alpha', adapterId: 'random-bot', displayName: 'Alpha Bot' },
              { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo Bot' },
            ],
            status: 'completed',
            outputDir: 'matches/match-002',
            resultPath: 'matches/match-002/result.json',
            winner: 'bravo',
          },
        ],
      });
      const manifestPath = writeManifest(dir, manifest);
      const { summary } = aggregateBatch({ manifestPath, now: () => '2026-01-01T00:00:00.000Z' });

      expect(summary.runCounts.resultsLoaded).toBe(2);
      const randomBot = summary.byAdapter['random-bot'];
      expect(randomBot?.matchesPlayed).toBe(2);
      expect(randomBot?.wins).toBe(1);
      expect(randomBot?.losses).toBe(1);
      expect(randomBot?.tactical.kills).toBe(2); // 2 + 0
      expect(randomBot?.tactical.deaths).toBe(2); // 0 + 2

      const chaserBot = summary.byAdapter['chaser-bot'];
      expect(chaserBot?.matchesPlayed).toBe(2);
      expect(chaserBot?.wins).toBe(1);
      expect(chaserBot?.losses).toBe(1);
      expect(chaserBot?.tactical.kills).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('produces a CSV with stable documented headers', () => {
    const dir = makeTempDir('csv-headers');
    try {
      writeResult(dir, 'matches/test-match-001/result.json', makeResultSummary());
      const manifestPath = writeManifest(dir, makeManifest());

      const { csv } = aggregateBatch({ manifestPath, now: () => '2026-01-01T00:00:00.000Z' });
      const lines = csv.split('\n').filter((l) => l.length > 0);
      const header = lines[0]!;
      expect(header).toBe(CSV_HEADERS.join(','));
      // Two data rows (one per contender in the match)
      expect(lines).toHaveLength(3); // header + 2 contenders
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CSV rows contain correct data for each contender', () => {
    const dir = makeTempDir('csv-data');
    try {
      writeResult(dir, 'matches/test-match-001/result.json', makeResultSummary());
      const manifestPath = writeManifest(dir, makeManifest());

      const { csv } = aggregateBatch({ manifestPath, now: () => '2026-01-01T00:00:00.000Z' });
      const lines = csv.split('\n').filter((l) => l.length > 0);
      const alphaRow = lines.find((l) => l.includes(',alpha,'))?.split(',');
      expect(alphaRow).toBeDefined();
      const headerArr = [...CSV_HEADERS];
      const rankIdx = headerArr.indexOf('rank');
      const winIdx = headerArr.indexOf('win');
      const killsIdx = headerArr.indexOf('kills');
      expect(alphaRow?.[rankIdx]).toBe('1');
      expect(alphaRow?.[winIdx]).toBe('1');
      expect(alphaRow?.[killsIdx]).toBe('3');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CSV safely escapes display names with commas and quotes', () => {
    const dir = makeTempDir('csv-escape');
    try {
      const manifest = makeManifest({
        batchConfig: {
          schemaVersion: BATCH_CONFIG_SCHEMA_VERSION,
          id: 'test-batch',
          rulesetVersion: 'ruleset.v0.1',
          seeds: [7],
          maps: [{ id: 'default-arena', version: '0.1.0', path: 'default-arena.json' }],
          contenders: [
            { id: 'alpha', adapterId: 'random-bot', displayName: 'Alpha, "Best" Bot' },
            { id: 'bravo', adapterId: 'chaser-bot' },
          ],
          matchups: [{ id: 'random-vs-chaser', contenderIds: ['alpha', 'bravo'] }],
          spawnPermutations: [[0, 1]],
          maxTicks: 100,
          actionTimeoutMs: 1000,
          invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
          capture: { safeReplay: true, privateDebug: false },
          failurePolicy: { onMatchFailure: 'continue' },
        },
        runs: [
          {
            matchId: 'test-match-001',
            mapId: 'default-arena',
            mapVersion: '0.1.0',
            matchupId: 'random-vs-chaser',
            seed: 7,
            spawnPermutation: [0, 1],
            contenders: [
              { id: 'alpha', adapterId: 'random-bot', displayName: 'Alpha, "Best" Bot' },
              { id: 'bravo', adapterId: 'chaser-bot' },
            ],
            status: 'completed',
            outputDir: 'matches/test-match-001',
            resultPath: 'matches/test-match-001/result.json',
            winner: 'alpha',
          },
        ],
      });

      writeResult(dir, 'matches/test-match-001/result.json', makeResultSummary());
      const manifestPath = writeManifest(dir, manifest);
      const { csv } = aggregateBatch({ manifestPath, now: () => '2026-01-01T00:00:00.000Z' });

      // CSV should contain the escaped display name
      expect(csv).toContain('"Alpha, ""Best"" Bot"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('aggregates the real bot-batch example end-to-end without errors', async () => {
    const work = makeTempDir('e2e');
    try {
      const batchSummary = await runBatchCommand({ configPath: exampleBatchPath, outDir: work });
      const { summary, csv } = aggregateBatch({
        manifestPath: batchSummary.manifestPath,
        now: () => '2026-01-01T00:00:00.000Z',
      });

      expect(summary.batchId).toBe(batchSummary.batchId);
      expect(summary.runCounts.completed).toBe(batchSummary.completedRuns);
      expect(summary.runCounts.resultsLoaded).toBe(batchSummary.completedRuns);
      expect(summary.runCounts.resultsMissing).toBe(0);
      expect(
        summary.failures.filter((f) => f.status === 'failed' || f.status === 'result-missing'),
      ).toHaveLength(0);
      expect(Object.keys(summary.byAdapter).length).toBeGreaterThan(0);

      // No unsafe content in JSON output
      const summaryJson = JSON.stringify(summary);
      expect(summaryJson).not.toMatch(/raw[_-]?prompt/i);
      expect(summaryJson).not.toMatch(/raw[_-]?output/i);
      expect(summaryJson).not.toContain(work);

      // CSV has correct structure
      const csvLines = csv.split('\n').filter((l) => l.length > 0);
      expect(csvLines[0]).toBe(CSV_HEADERS.join(','));
      expect(csvLines.length).toBeGreaterThan(1);

      // CSV does not contain sensitive content
      expect(csv).not.toContain(work);
      expect(csv).not.toMatch(/raw[_-]?prompt/i);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('byAdapter and byMatchup keys are in stable sorted order', () => {
    const dir = makeTempDir('order');
    try {
      const result1 = makeResultSummary({
        matchId: 'match-001',
        winner: 'alpha',
        placements: [
          { contenderId: 'alpha', rank: 1 },
          { contenderId: 'bravo', rank: 2 },
        ],
      });
      const result2 = makeResultSummary({
        matchId: 'match-002',
        winner: 'bravo',
        placements: [
          { contenderId: 'bravo', rank: 1 },
          { contenderId: 'alpha', rank: 2 },
        ],
      });

      writeResult(dir, 'matches/match-001/result.json', result1);
      writeResult(dir, 'matches/match-002/result.json', result2);

      const manifest = makeManifest({
        summary: { totalRuns: 2, completedRuns: 2, failedRuns: 0, skippedRuns: 0 },
        runs: [
          {
            matchId: 'match-002',
            mapId: 'default-arena',
            mapVersion: '0.1.0',
            matchupId: 'z-matchup',
            seed: 2,
            spawnPermutation: [0, 1],
            contenders: [
              { id: 'alpha', adapterId: 'z-bot' },
              { id: 'bravo', adapterId: 'a-bot' },
            ],
            status: 'completed',
            outputDir: 'matches/match-002',
            resultPath: 'matches/match-002/result.json',
          },
          {
            matchId: 'match-001',
            mapId: 'default-arena',
            mapVersion: '0.1.0',
            matchupId: 'a-matchup',
            seed: 1,
            spawnPermutation: [0, 1],
            contenders: [
              { id: 'alpha', adapterId: 'z-bot' },
              { id: 'bravo', adapterId: 'a-bot' },
            ],
            status: 'completed',
            outputDir: 'matches/match-001',
            resultPath: 'matches/match-001/result.json',
          },
        ],
      });

      const manifestPath = writeManifest(dir, manifest);
      const { summary } = aggregateBatch({ manifestPath, now: () => '2026-01-01T00:00:00.000Z' });

      const adapterKeys = Object.keys(summary.byAdapter);
      expect(adapterKeys).toEqual([...adapterKeys].sort());

      const matchupKeys = Object.keys(summary.byMatchup);
      expect(matchupKeys).toEqual([...matchupKeys].sort());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
