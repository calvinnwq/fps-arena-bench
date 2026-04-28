import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  ActionSchema,
  AdapterErrorSchema,
  AdapterMetadataSchema,
  MapSchema,
  MatchConfigSchema,
  ObservationSchema,
  ReplaySafeArtifactSchema,
  ResultSummarySchema,
  SCHEMA_VERSION,
  validateAction,
  validateMap,
  validateMatchConfig,
} from './index.js';
import { invalidCoreFixtures, invalidMapFixtures, validCoreFixtures } from './fixtures.js';

const validAction = {
  schemaVersion: SCHEMA_VERSION,
  type: 'move',
  direction: { x: 1, y: 0 },
};

const validObservation = {
  schemaVersion: SCHEMA_VERSION,
  rulesetVersion: 'ruleset-v0.1',
  matchId: 'match-001',
  tick: 12,
  self: {
    contenderId: 'alpha',
    position: { x: 4, y: 5 },
    headingDegrees: 90,
    health: 85,
    ammo: 7,
  },
  visiblePlayers: [
    {
      contenderId: 'bravo',
      position: { x: 8, y: 5 },
      headingDegrees: 270,
      health: 65,
      team: 'blue',
    },
  ],
  visiblePickups: [{ id: 'health-mid', type: 'health', position: { x: 8, y: 8 } }],
  visibleWalls: [{ id: 'cover-north', x: 7, y: 6, width: 2, height: 1 }],
  score: { alpha: 1, bravo: 0 },
};

const validHash = `sha256:${'a'.repeat(64)}`;

const validMap = {
  schemaVersion: SCHEMA_VERSION,
  id: 'default-arena',
  version: '0.1.0',
  width: 16,
  height: 16,
  spawns: [
    { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 8 }, headingDegrees: 0 },
    { id: 'bravo-spawn', contenderSlot: 1, position: { x: 14, y: 8 }, headingDegrees: 180 },
  ],
  walls: [
    { id: 'northwest-cover', x: 5, y: 5, width: 2, height: 2 },
    { id: 'southeast-cover', x: 9, y: 9, width: 2, height: 2 },
  ],
  pickups: [
    { id: 'health-mid', type: 'health', position: { x: 8, y: 8 }, respawnTicks: 50 },
    { id: 'ammo-west', type: 'ammo', position: { x: 4, y: 8 }, respawnTicks: 40 },
    { id: 'ammo-east', type: 'ammo', position: { x: 12, y: 8 }, respawnTicks: 40 },
  ],
  symmetry: { kind: 'rotational-180', notes: 'Two-player 180-degree rotational baseline.' },
};

const defaultArena = JSON.parse(
  readFileSync(new URL('../../../maps/default-arena.json', import.meta.url), 'utf8'),
) as unknown;

const validMatchConfig = {
  schemaVersion: SCHEMA_VERSION,
  id: 'bot-duel',
  rulesetVersion: 'ruleset-v0.1',
  map: { id: 'default-arena', version: '0.1.0', hash: validHash },
  seed: 42,
  maxTicks: 600,
  contenders: [
    { id: 'alpha', adapterId: 'random-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo' },
  ],
  actionTimeoutMs: 1_000,
  invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
  capture: { safeReplay: true, privateDebug: false },
};

describe('core schemas', () => {
  test('exports reusable valid and invalid fixtures', () => {
    expect(ActionSchema.parse(validCoreFixtures.action)).toEqual(validCoreFixtures.action);
    expect(ObservationSchema.parse(validCoreFixtures.observation)).toEqual(
      validCoreFixtures.observation,
    );
    expect(MapSchema.parse(validCoreFixtures.map)).toEqual(validCoreFixtures.map);
    expect(MatchConfigSchema.parse(validCoreFixtures.matchConfig)).toEqual(
      validCoreFixtures.matchConfig,
    );
    expect(ActionSchema.safeParse(invalidCoreFixtures.action).success).toBe(false);
    expect(MapSchema.safeParse(invalidCoreFixtures.map).success).toBe(false);
    expect(MatchConfigSchema.safeParse(invalidCoreFixtures.matchConfig).success).toBe(false);
    expect(Object.values(invalidMapFixtures)).toHaveLength(3);
    for (const invalidMapFixture of Object.values(invalidMapFixtures)) {
      expect(() => validateMap(invalidMapFixture)).toThrow('Invalid map:');
    }
  });

  test('accept valid v0.1 contract examples', () => {
    expect(ActionSchema.parse(validAction)).toEqual(validAction);
    expect(ObservationSchema.parse(validObservation)).toEqual(validObservation);
    expect(MapSchema.parse(validMap)).toEqual(validMap);
    expect(MatchConfigSchema.parse(validMatchConfig)).toEqual(validMatchConfig);
    expect(
      AdapterMetadataSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        adapterId: 'random-bot',
        kind: 'bot',
        displayName: 'Random Bot',
        supportedActionSchema: SCHEMA_VERSION,
      }),
    ).toMatchObject({ adapterId: 'random-bot' });
    expect(
      AdapterErrorSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        adapterId: 'claude-cli',
        code: 'timeout',
        message: 'Adapter timed out before returning an action.',
        retryable: true,
      }),
    ).toMatchObject({ code: 'timeout' });
    expect(
      ResultSummarySchema.parse({
        schemaVersion: SCHEMA_VERSION,
        matchId: 'match-001',
        winner: 'alpha',
        placements: [{ contenderId: 'alpha', rank: 1 }],
        ticksElapsed: 420,
        stats: {
          alpha: {
            kills: 2,
            deaths: 0,
            damageDealt: 140,
            damageTaken: 30,
            survivalTicks: 420,
            pickupsCollected: 2,
          },
        },
        reliability: {
          invalidJson: 0,
          schemaFailures: 1,
          repairAttempts: 1,
          repairSuccesses: 1,
          timeouts: 0,
          fallbackActions: 0,
        },
        latency: { averageMs: 120, p50Ms: 110, p95Ms: 180, timeoutBudgetMs: 1_000 },
      }),
    ).toMatchObject({ winner: 'alpha' });
  });

  test('invalid configs, actions, and maps fail with pathful messages', () => {
    expect(() =>
      validateAction({
        ...validAction,
        direction: { x: 2, y: 0 },
      }),
    ).toThrow('action.direction.x');

    expect(() =>
      validateMatchConfig({
        ...validMatchConfig,
        contenders: [{ id: 'solo', adapterId: 'random-bot' }],
      }),
    ).toThrow('matchConfig.contenders');

    expect(() =>
      validateMap({
        ...validMap,
        spawns: [
          { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 8 }, headingDegrees: 0 },
        ],
      }),
    ).toThrow('map.spawns');

    expect(() =>
      validateMatchConfig({
        ...validMatchConfig,
        map: { ...validMatchConfig.map, hash: 'sha256:not-a-digest' },
      }),
    ).toThrow('matchConfig.map.hash');

    expect(() =>
      validateMatchConfig({
        ...validMatchConfig,
        contenders: [validMatchConfig.contenders[0]!, validMatchConfig.contenders[0]!],
      }),
    ).toThrow('matchConfig.contenders.1.id');
  });

  test('default arena fixture passes map validation', () => {
    expect(validateMap(defaultArena)).toMatchObject({
      id: 'default-arena',
      symmetry: { kind: 'rotational-180' },
    });
  });

  test('semantic map validation fails with clear messages', () => {
    expect(() =>
      validateMap({
        ...validMap,
        walls: [{ id: 'bad-wall', x: 15, y: 15, width: 2, height: 1 }],
      }),
    ).toThrow('map.walls.0');

    expect(() =>
      validateMap({
        ...validMap,
        spawns: [
          validMap.spawns[0]!,
          {
            ...validMap.spawns[1]!,
            id: 'duplicate-slot-spawn',
            contenderSlot: validMap.spawns[0]!.contenderSlot,
          },
        ],
      }),
    ).toThrow('map.spawns.1.contenderSlot');

    expect(() =>
      validateMap({
        ...validMap,
        walls: [{ id: 'blocked-cover', x: 7, y: 7, width: 2, height: 2 }],
        pickups: [{ id: 'blocked-health', type: 'health', position: { x: 8, y: 8 } }],
      }),
    ).toThrow('map.pickups.0.position');

    expect(() =>
      validateMap({
        ...validMap,
        symmetry: { kind: 'mirror-x', notes: 'Intentionally asymmetric.' },
        pickups: [{ id: 'ammo-west', type: 'ammo', position: { x: 4, y: 8 } }],
      }),
    ).toThrow('mirrored counterpart');

    expect(() =>
      validateMap({
        ...validMap,
        pickups: [{ ...validMap.pickups[1]!, respawnTicks: 30 }, validMap.pickups[2]!],
      }),
    ).toThrow('rotational counterpart');

    expect(() =>
      validateMap({
        ...validMap,
        width: 256,
        height: 256,
      }),
    ).toThrow('map.width');

    expect(() =>
      validateMap({
        ...validMap,
        walls: Array.from({ length: 257 }, (_, index) => ({
          id: `wall-${index}`,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        })),
        symmetry: { kind: 'none' },
      }),
    ).toThrow('map.walls');

    expect(() =>
      validateMap({
        ...validMap,
        spawns: [validMap.spawns[0]!, { ...validMap.spawns[1]!, contenderSlot: 2 }],
        symmetry: { kind: 'none' },
      }),
    ).toThrow('map.spawns');
  });

  test('safe replay artifacts require consistent embedded identities', () => {
    const replay = {
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      config: {
        ...validMatchConfig,
        map: { ...validMatchConfig.map, id: 'other-arena', version: '9.9.9' },
      },
      map: validMap,
      acceptedActions: [],
      events: [],
      stateHashes: [{ tick: 1, hash: validHash }],
      result: ResultSummarySchema.parse({
        schemaVersion: SCHEMA_VERSION,
        matchId: 'other-match',
        winner: null,
        placements: [],
        ticksElapsed: 1,
        stats: {},
        reliability: {
          invalidJson: 0,
          schemaFailures: 0,
          repairAttempts: 0,
          repairSuccesses: 0,
          timeouts: 0,
          fallbackActions: 0,
        },
        latency: { averageMs: 90, p50Ms: 90, p95Ms: 90, timeoutBudgetMs: 1_000 },
      }),
    };

    const result = ReplaySafeArtifactSchema.safeParse(replay);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['result.matchId', 'config.map.id', 'config.map.version']),
      );
    }
  });

  test('safe replay artifacts reject raw prompts and model outputs', () => {
    const replay = {
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      config: validMatchConfig,
      map: validMap,
      acceptedActions: [{ tick: 1, contenderId: 'alpha', action: validAction, latencyMs: 90 }],
      events: [{ tick: 1, type: 'action.accepted', contenderId: 'alpha' }],
      stateHashes: [{ tick: 1, hash: validHash }],
      result: ResultSummarySchema.parse({
        schemaVersion: SCHEMA_VERSION,
        matchId: 'match-001',
        winner: null,
        placements: [],
        ticksElapsed: 1,
        stats: {},
        reliability: {
          invalidJson: 0,
          schemaFailures: 0,
          repairAttempts: 0,
          repairSuccesses: 0,
          timeouts: 0,
          fallbackActions: 0,
        },
        latency: { averageMs: 90, p50Ms: 90, p95Ms: 90, timeoutBudgetMs: 1_000 },
      }),
      rawPrompt: 'private prompt',
      rawModelOutput: 'private response',
    };

    const result = ReplaySafeArtifactSchema.safeParse(replay);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['rawPrompt', 'rawModelOutput']),
      );
    }
  });

  test('safe replay artifacts reject arbitrary snapshot payloads', () => {
    const replay = {
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      config: validMatchConfig,
      map: validMap,
      acceptedActions: [],
      events: [],
      stateHashes: [{ tick: 1, hash: validHash }],
      snapshots: [{ tick: 1, rawPrompt: 'private prompt' }],
      result: ResultSummarySchema.parse({
        schemaVersion: SCHEMA_VERSION,
        matchId: 'match-001',
        winner: null,
        placements: [],
        ticksElapsed: 1,
        stats: {},
        reliability: {
          invalidJson: 0,
          schemaFailures: 0,
          repairAttempts: 0,
          repairSuccesses: 0,
          timeouts: 0,
          fallbackActions: 0,
        },
        latency: { averageMs: 90, p50Ms: 90, p95Ms: 90, timeoutBudgetMs: 1_000 },
      }),
    };

    const result = ReplaySafeArtifactSchema.safeParse(replay);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['snapshots.0.hash', 'snapshots.0']),
      );
    }
  });

  test('safe replay artifacts reject private event detail fields', () => {
    const replay = {
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      config: validMatchConfig,
      map: validMap,
      acceptedActions: [{ tick: 1, contenderId: 'alpha', action: validAction, latencyMs: 90 }],
      events: [
        {
          tick: 1,
          type: 'action.accepted',
          contenderId: 'alpha',
          details: { rawPrompt: 1 },
        },
      ],
      stateHashes: [{ tick: 1, hash: validHash }],
      result: ResultSummarySchema.parse({
        schemaVersion: SCHEMA_VERSION,
        matchId: 'match-001',
        winner: null,
        placements: [],
        ticksElapsed: 1,
        stats: {},
        reliability: {
          invalidJson: 0,
          schemaFailures: 0,
          repairAttempts: 0,
          repairSuccesses: 0,
          timeouts: 0,
          fallbackActions: 0,
        },
        latency: { averageMs: 90, p50Ms: 90, p95Ms: 90, timeoutBudgetMs: 1_000 },
      }),
    };

    const result = ReplaySafeArtifactSchema.safeParse(replay);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'events.0.details',
      );
    }
  });

  test('safe replay artifacts require referenced contenders to be configured', () => {
    const replay = {
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      config: validMatchConfig,
      map: validMap,
      acceptedActions: [{ tick: 1, contenderId: 'charlie', action: validAction, latencyMs: 90 }],
      events: [{ tick: 1, type: 'action.accepted', contenderId: 'delta' }],
      stateHashes: [{ tick: 1, hash: validHash }],
      result: ResultSummarySchema.parse({
        schemaVersion: SCHEMA_VERSION,
        matchId: 'match-001',
        winner: 'foxtrot',
        placements: [{ contenderId: 'foxtrot', rank: 1 }],
        ticksElapsed: 1,
        stats: {
          golf: {
            kills: 0,
            deaths: 1,
            damageDealt: 0,
            damageTaken: 100,
            survivalTicks: 1,
            pickupsCollected: 0,
          },
        },
        reliability: {
          invalidJson: 0,
          schemaFailures: 0,
          repairAttempts: 0,
          repairSuccesses: 0,
          timeouts: 0,
          fallbackActions: 0,
        },
        latency: { averageMs: 90, p50Ms: 90, p95Ms: 90, timeoutBudgetMs: 1_000 },
      }),
    };

    const result = ReplaySafeArtifactSchema.safeParse(replay);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining([
          'acceptedActions.0.contenderId',
          'events.0.contenderId',
          'result.winner',
          'result.placements.0.contenderId',
          'result.stats.golf',
        ]),
      );
    }
  });

  test('result summaries reject duplicate placements', () => {
    const result = ResultSummarySchema.safeParse({
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      winner: 'alpha',
      placements: [
        { contenderId: 'alpha', rank: 1 },
        { contenderId: 'alpha', rank: 2 },
      ],
      ticksElapsed: 1,
      stats: {
        alpha: {
          kills: 1,
          deaths: 0,
          damageDealt: 100,
          damageTaken: 0,
          survivalTicks: 1,
          pickupsCollected: 0,
        },
      },
      reliability: {
        invalidJson: 0,
        schemaFailures: 0,
        repairAttempts: 0,
        repairSuccesses: 0,
        timeouts: 0,
        fallbackActions: 0,
      },
      latency: { averageMs: 90, p50Ms: 90, p95Ms: 90, timeoutBudgetMs: 1_000 },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'placements.1.contenderId',
      );
    }
  });

  test('result summaries require unique contiguous placement ranks', () => {
    const result = ResultSummarySchema.safeParse({
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      winner: 'alpha',
      placements: [
        { contenderId: 'alpha', rank: 1 },
        { contenderId: 'bravo', rank: 1 },
        { contenderId: 'charlie', rank: 3 },
      ],
      ticksElapsed: 1,
      stats: {},
      reliability: {
        invalidJson: 0,
        schemaFailures: 0,
        repairAttempts: 0,
        repairSuccesses: 0,
        timeouts: 0,
        fallbackActions: 0,
      },
      latency: { averageMs: 90, p50Ms: 90, p95Ms: 90, timeoutBudgetMs: 1_000 },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['placements.1.rank', 'placements']),
      );
    }
  });

  test('safe replay artifacts reject result placements for unknown contenders', () => {
    const replay = {
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      config: validMatchConfig,
      map: validMap,
      acceptedActions: [],
      events: [],
      stateHashes: [{ tick: 1, hash: validHash }],
      result: ResultSummarySchema.parse({
        schemaVersion: SCHEMA_VERSION,
        matchId: 'match-001',
        winner: 'charlie',
        placements: [{ contenderId: 'charlie', rank: 1 }],
        ticksElapsed: 1,
        stats: {
          alpha: {
            kills: 1,
            deaths: 0,
            damageDealt: 100,
            damageTaken: 0,
            survivalTicks: 1,
            pickupsCollected: 0,
          },
        },
        reliability: {
          invalidJson: 0,
          schemaFailures: 0,
          repairAttempts: 0,
          repairSuccesses: 0,
          timeouts: 0,
          fallbackActions: 0,
        },
        latency: { averageMs: 90, p50Ms: 90, p95Ms: 90, timeoutBudgetMs: 1_000 },
      }),
    };

    const result = ReplaySafeArtifactSchema.safeParse(replay);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['result.winner', 'result.placements.0.contenderId']),
      );
    }
  });

  test('result summaries reject impossible aggregate metrics', () => {
    const result = ResultSummarySchema.safeParse({
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      winner: 'alpha',
      placements: [{ contenderId: 'alpha', rank: 1 }],
      ticksElapsed: 1,
      stats: {},
      reliability: {
        invalidJson: 0,
        schemaFailures: 0,
        repairAttempts: 1,
        repairSuccesses: 2,
        timeouts: 0,
        fallbackActions: 0,
      },
      latency: { averageMs: 90, p50Ms: 100, p95Ms: 90, timeoutBudgetMs: 1_000 },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['reliability.repairSuccesses', 'latency.p50Ms']),
      );
    }
  });

  test('safe replay artifacts require spawn slots for configured contenders', () => {
    const replay = {
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      config: {
        ...validMatchConfig,
        contenders: [
          ...validMatchConfig.contenders,
          { id: 'charlie', adapterId: 'random-bot', displayName: 'Charlie' },
        ],
      },
      map: validMap,
      acceptedActions: [],
      events: [],
      stateHashes: [{ tick: 1, hash: validHash }],
      result: ResultSummarySchema.parse({
        schemaVersion: SCHEMA_VERSION,
        matchId: 'match-001',
        winner: 'alpha',
        placements: [{ contenderId: 'alpha', rank: 1 }],
        ticksElapsed: 1,
        stats: {},
        reliability: {
          invalidJson: 0,
          schemaFailures: 0,
          repairAttempts: 0,
          repairSuccesses: 0,
          timeouts: 0,
          fallbackActions: 0,
        },
        latency: { averageMs: 90, p50Ms: 90, p95Ms: 90, timeoutBudgetMs: 1_000 },
      }),
    };

    const result = ReplaySafeArtifactSchema.safeParse(replay);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('map.spawns');
    }
  });

  test('result summaries require winner to match first place', () => {
    const result = ResultSummarySchema.safeParse({
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      winner: 'bravo',
      placements: [
        { contenderId: 'alpha', rank: 1 },
        { contenderId: 'bravo', rank: 2 },
      ],
      ticksElapsed: 1,
      stats: {},
      reliability: {
        invalidJson: 0,
        schemaFailures: 0,
        repairAttempts: 0,
        repairSuccesses: 0,
        timeouts: 0,
        fallbackActions: 0,
      },
      latency: { averageMs: 90, p50Ms: 90, p95Ms: 90, timeoutBudgetMs: 1_000 },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('winner');
    }
  });

  test('safe replay artifacts reject ticks past result duration', () => {
    const replay = {
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      config: validMatchConfig,
      map: validMap,
      acceptedActions: [{ tick: 2, contenderId: 'alpha', action: validAction, latencyMs: 90 }],
      events: [{ tick: 3, type: 'action.accepted', contenderId: 'alpha' }],
      stateHashes: [{ tick: 4, hash: validHash }],
      snapshots: [{ tick: 5, hash: validHash }],
      result: ResultSummarySchema.parse({
        schemaVersion: SCHEMA_VERSION,
        matchId: 'match-001',
        winner: null,
        placements: [],
        ticksElapsed: 1,
        stats: {},
        reliability: {
          invalidJson: 0,
          schemaFailures: 0,
          repairAttempts: 0,
          repairSuccesses: 0,
          timeouts: 0,
          fallbackActions: 0,
        },
        latency: { averageMs: 90, p50Ms: 90, p95Ms: 90, timeoutBudgetMs: 1_000 },
      }),
    };

    const result = ReplaySafeArtifactSchema.safeParse(replay);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining([
          'acceptedActions.0.tick',
          'events.0.tick',
          'stateHashes.0.tick',
          'snapshots.0.tick',
        ]),
      );
    }
  });
});
