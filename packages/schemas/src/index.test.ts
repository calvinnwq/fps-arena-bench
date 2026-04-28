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
import { invalidCoreFixtures, validCoreFixtures } from './fixtures.js';

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
  walls: [{ id: 'mid-cover', x: 7, y: 7, width: 2, height: 2 }],
  pickups: [{ id: 'health-mid', type: 'health', position: { x: 8, y: 8 }, respawnTicks: 50 }],
  symmetry: { kind: 'rotational-180', notes: 'Two-player mirrored spawn baseline.' },
};

const validMatchConfig = {
  schemaVersion: SCHEMA_VERSION,
  id: 'bot-duel',
  rulesetVersion: 'ruleset-v0.1',
  map: { id: 'default-arena', version: '0.1.0', hash: 'sha256:abc123' },
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
  });

  test('safe replay artifacts reject raw prompts and model outputs', () => {
    const replay = {
      schemaVersion: SCHEMA_VERSION,
      matchId: 'match-001',
      config: validMatchConfig,
      map: validMap,
      acceptedActions: [{ tick: 1, contenderId: 'alpha', action: validAction, latencyMs: 90 }],
      events: [{ tick: 1, type: 'action.accepted', contenderId: 'alpha' }],
      stateHashes: [{ tick: 1, hash: 'sha256:def456' }],
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
});
