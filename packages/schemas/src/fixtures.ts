import type { Action, MapDefinition, MatchConfig, Observation } from './index.js';
import { SCHEMA_VERSION } from './index.js';

const validAction = {
  schemaVersion: SCHEMA_VERSION,
  type: 'move',
  direction: { x: 1, y: 0 },
} satisfies Action;

const validObservation = {
  schemaVersion: SCHEMA_VERSION,
  rulesetVersion: 'ruleset-v0.1',
  matchId: 'fixture-match',
  tick: 1,
  self: {
    contenderId: 'alpha',
    position: { x: 4, y: 5 },
    headingDegrees: 90,
    health: 100,
    ammo: 8,
  },
  visiblePlayers: [
    {
      contenderId: 'bravo',
      position: { x: 8, y: 5 },
      headingDegrees: 270,
      health: 75,
    },
  ],
  visiblePickups: [
    { id: 'health-mid', type: 'health', position: { x: 8, y: 8 }, respawnTicks: 50 },
  ],
  visibleWalls: [{ id: 'mid-cover', x: 7, y: 7, width: 2, height: 2 }],
  score: { alpha: 0, bravo: 0 },
} satisfies Observation;

const validMap = {
  schemaVersion: SCHEMA_VERSION,
  id: 'fixture-arena',
  version: '0.1.0',
  width: 16,
  height: 16,
  spawns: [
    { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 8 }, headingDegrees: 0 },
    { id: 'bravo-spawn', contenderSlot: 1, position: { x: 14, y: 8 }, headingDegrees: 180 },
  ],
  walls: [{ id: 'mid-cover', x: 7, y: 7, width: 2, height: 2 }],
  pickups: [{ id: 'health-mid', type: 'health', position: { x: 8, y: 8 }, respawnTicks: 50 }],
  symmetry: { kind: 'rotational-180', notes: 'Fixture map for schema tests.' },
} satisfies MapDefinition;

const validMatchConfig = {
  schemaVersion: SCHEMA_VERSION,
  id: 'fixture-bot-duel',
  rulesetVersion: 'ruleset-v0.1',
  map: { id: validMap.id, version: validMap.version, hash: 'sha256:fixture-map' },
  seed: 7,
  maxTicks: 600,
  contenders: [
    { id: 'alpha', adapterId: 'random-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo' },
  ],
  actionTimeoutMs: 1_000,
  invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
  capture: { safeReplay: true, privateDebug: false },
} satisfies MatchConfig;

export const validCoreFixtures = {
  action: validAction,
  observation: validObservation,
  map: validMap,
  matchConfig: validMatchConfig,
} as const;

export const invalidCoreFixtures = {
  action: {
    ...validAction,
    direction: { x: 2, y: 0 },
  },
  map: {
    ...validMap,
    spawns: [validMap.spawns[0]],
  },
  matchConfig: {
    ...validMatchConfig,
    contenders: [validMatchConfig.contenders[0]],
  },
} as const;
