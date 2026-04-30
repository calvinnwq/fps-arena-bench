import type { MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

const validHash = `sha256:${'a'.repeat(64)}`;

export interface BuildTestMapOptions {
  readonly id?: string;
  readonly version?: string;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Two-spawn test arena: 16x16 grid, four corner-cover walls, and three
 * rotationally paired pickups. Mirrors `maps/default-arena.json` so engine
 * tests share the same baseline geometry.
 */
export function buildTestMap(options: BuildTestMapOptions = {}): MapDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? 'engine-test-arena',
    version: options.version ?? '0.1.0',
    width: options.width ?? 16,
    height: options.height ?? 16,
    spawns: [
      {
        id: 'alpha-spawn',
        contenderSlot: 0,
        position: { x: 2, y: 8 },
        headingDegrees: 0,
      },
      {
        id: 'bravo-spawn',
        contenderSlot: 1,
        position: { x: 14, y: 8 },
        headingDegrees: 180,
      },
    ],
    walls: [
      { id: 'northwest-cover', x: 5, y: 5, width: 2, height: 2 },
      { id: 'northeast-cover', x: 9, y: 5, width: 2, height: 2 },
      { id: 'southwest-cover', x: 5, y: 9, width: 2, height: 2 },
      { id: 'southeast-cover', x: 9, y: 9, width: 2, height: 2 },
    ],
    pickups: [
      { id: 'health-mid', type: 'health', position: { x: 8, y: 8 }, respawnTicks: 60 },
      { id: 'ammo-west', type: 'ammo', position: { x: 4, y: 8 }, respawnTicks: 40 },
      { id: 'ammo-east', type: 'ammo', position: { x: 12, y: 8 }, respawnTicks: 40 },
    ],
    symmetry: {
      kind: 'rotational-180',
      notes: 'Engine test arena mirroring the default-arena layout.',
    },
  };
}

export interface BuildTestMatchConfigOptions {
  readonly id?: string;
  readonly mapId?: string;
  readonly mapVersion?: string;
  readonly seed?: number;
  readonly maxTicks?: number;
}

export function buildTestMatchConfig(options: BuildTestMatchConfigOptions = {}): MatchConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? 'engine-test-match',
    rulesetVersion: 'ruleset.v0.1',
    map: {
      id: options.mapId ?? 'engine-test-arena',
      version: options.mapVersion ?? '0.1.0',
      hash: validHash,
    },
    seed: options.seed ?? 42,
    maxTicks: options.maxTicks ?? 600,
    contenders: [
      { id: 'alpha', adapterId: 'mock-bot', displayName: 'Alpha' },
      { id: 'bravo', adapterId: 'mock-bot', displayName: 'Bravo' },
    ],
    actionTimeoutMs: 1_000,
    invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
    capture: { safeReplay: true, privateDebug: false },
  };
}

/**
 * Empty arena with no walls, no pickups; useful for isolating tick mechanics
 * without map-driven side effects.
 */
export function buildOpenArenaMap(): MapDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'open-arena',
    version: '0.1.0',
    width: 10,
    height: 10,
    spawns: [
      { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 5 }, headingDegrees: 0 },
      { id: 'bravo-spawn', contenderSlot: 1, position: { x: 8, y: 5 }, headingDegrees: 180 },
    ],
    walls: [],
    pickups: [],
    symmetry: { kind: 'none' },
  };
}

/**
 * Arena with one wall directly between the two spawns to force LOS-blocked
 * scenarios in visibility/combat tests.
 */
export function buildWallBetweenMap(): MapDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'wall-between-arena',
    version: '0.1.0',
    width: 10,
    height: 10,
    spawns: [
      { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 5 }, headingDegrees: 0 },
      { id: 'bravo-spawn', contenderSlot: 1, position: { x: 8, y: 5 }, headingDegrees: 180 },
    ],
    walls: [{ id: 'mid-wall', x: 4, y: 4, width: 2, height: 2 }],
    pickups: [],
    symmetry: { kind: 'none' },
  };
}

/**
 * Single shared pickup arena where both spawns are equidistant from a centre
 * health pickup, used for pickup contention tests.
 */
export function buildSharedPickupMap(): MapDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'shared-pickup-arena',
    version: '0.1.0',
    width: 6,
    height: 4,
    spawns: [
      { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 2 }, headingDegrees: 0 },
      { id: 'bravo-spawn', contenderSlot: 1, position: { x: 4, y: 2 }, headingDegrees: 180 },
    ],
    walls: [],
    pickups: [{ id: 'health-mid', type: 'health', position: { x: 3, y: 2 } }],
    symmetry: { kind: 'none' },
  };
}
