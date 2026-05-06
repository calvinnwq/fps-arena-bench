import { describe, expect, it } from 'vitest';

import { BATCH_CONFIG_SCHEMA_VERSION, BatchConfigSchema, validateBatchConfig } from './index.js';

const baseValidBatch = () => ({
  schemaVersion: BATCH_CONFIG_SCHEMA_VERSION,
  id: 'smoke-batch',
  rulesetVersion: 'ruleset.v0.1',
  seeds: [1, 2],
  maps: [{ id: 'default-arena', version: '0.1.0', path: 'maps/default-arena.json' }],
  contenders: [
    { id: 'alpha', adapterId: 'random-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo' },
  ],
  matchups: [{ id: 'random-vs-chaser', contenderIds: ['alpha', 'bravo'] }],
  spawnPermutations: [
    [0, 1],
    [1, 0],
  ],
  maxTicks: 200,
  actionTimeoutMs: 1000,
  invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' as const },
  capture: { safeReplay: true, privateDebug: false },
  failurePolicy: { onMatchFailure: 'continue' as const },
});

describe('BatchConfigSchema', () => {
  it('accepts a minimal valid batch config', () => {
    const config = baseValidBatch();
    expect(BatchConfigSchema.parse(config)).toMatchObject({
      id: 'smoke-batch',
      seeds: [1, 2],
      matchups: [{ id: 'random-vs-chaser' }],
    });
  });

  it('rejects empty seeds, maps, contenders, matchups, and spawn permutations', () => {
    const cases = [
      { ...baseValidBatch(), seeds: [] },
      { ...baseValidBatch(), maps: [] },
      {
        ...baseValidBatch(),
        contenders: [{ id: 'alpha', adapterId: 'random-bot' }],
      },
      { ...baseValidBatch(), matchups: [] },
      { ...baseValidBatch(), spawnPermutations: [] },
    ];
    for (const candidate of cases) {
      expect(BatchConfigSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it('rejects invalid seed/maxTicks/actionTimeoutMs values', () => {
    expect(BatchConfigSchema.safeParse({ ...baseValidBatch(), seeds: [-1] }).success).toBe(false);
    expect(BatchConfigSchema.safeParse({ ...baseValidBatch(), maxTicks: 0 }).success).toBe(false);
    expect(BatchConfigSchema.safeParse({ ...baseValidBatch(), actionTimeoutMs: 0 }).success).toBe(
      false,
    );
  });

  it('rejects matchup contender ids that do not reference the contender pool', () => {
    const result = BatchConfigSchema.safeParse({
      ...baseValidBatch(),
      matchups: [{ id: 'orphan', contenderIds: ['alpha', 'charlie'] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('matchups.0.contenderIds.1');
    }
  });

  it('rejects spawn permutations whose length does not match matchup size', () => {
    const result = BatchConfigSchema.safeParse({
      ...baseValidBatch(),
      spawnPermutations: [[0, 1, 2]],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.join('.') === 'spawnPermutations.0'),
      ).toBe(true);
    }
  });

  it('rejects spawn permutations with duplicate or out-of-range slots', () => {
    const dupResult = BatchConfigSchema.safeParse({
      ...baseValidBatch(),
      spawnPermutations: [[0, 0]],
    });
    expect(dupResult.success).toBe(false);

    const oobResult = BatchConfigSchema.safeParse({
      ...baseValidBatch(),
      spawnPermutations: [[0, 5]],
    });
    expect(oobResult.success).toBe(false);
  });

  it('rejects matchups of mismatching sizes', () => {
    const result = BatchConfigSchema.safeParse({
      ...baseValidBatch(),
      matchups: [
        { id: 'a', contenderIds: ['alpha', 'bravo'] },
        { id: 'b', contenderIds: ['alpha', 'bravo', 'charlie'] },
      ],
      contenders: [
        { id: 'alpha', adapterId: 'random-bot' },
        { id: 'bravo', adapterId: 'chaser-bot' },
        { id: 'charlie', adapterId: 'random-bot' },
      ],
      spawnPermutations: [[0, 1]],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'matchups')).toBe(true);
    }
  });

  it('rejects duplicate seeds, contender ids, map ids, and matchup ids', () => {
    const dupSeeds = BatchConfigSchema.safeParse({ ...baseValidBatch(), seeds: [1, 1] });
    expect(dupSeeds.success).toBe(false);

    const dupContenders = BatchConfigSchema.safeParse({
      ...baseValidBatch(),
      contenders: [
        { id: 'alpha', adapterId: 'random-bot' },
        { id: 'alpha', adapterId: 'chaser-bot' },
      ],
    });
    expect(dupContenders.success).toBe(false);

    const dupMaps = BatchConfigSchema.safeParse({
      ...baseValidBatch(),
      maps: [
        { id: 'default-arena', version: '0.1.0', path: 'maps/default-arena.json' },
        { id: 'default-arena', version: '0.2.0', path: 'maps/default-arena.json' },
      ],
    });
    expect(dupMaps.success).toBe(false);

    const dupMatchups = BatchConfigSchema.safeParse({
      ...baseValidBatch(),
      matchups: [
        { id: 'm', contenderIds: ['alpha', 'bravo'] },
        { id: 'm', contenderIds: ['alpha', 'bravo'] },
      ],
    });
    expect(dupMatchups.success).toBe(false);
  });

  it('rejects an unknown schemaVersion', () => {
    const result = BatchConfigSchema.safeParse({
      ...baseValidBatch(),
      schemaVersion: 'fps-arena-bench.batch.v9.9',
    });
    expect(result.success).toBe(false);
  });

  it('throws a labeled error from validateBatchConfig with useful path info', () => {
    expect(() => validateBatchConfig({ ...baseValidBatch(), seeds: [-1] })).toThrow(
      /batchConfig\.seeds/,
    );
  });

  it('accepts an optional runLimits block', () => {
    const config = { ...baseValidBatch(), runLimits: { maxMatches: 4 } };
    expect(BatchConfigSchema.parse(config).runLimits).toEqual({ maxMatches: 4 });
  });
});
