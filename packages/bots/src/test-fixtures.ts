import type { MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

const validHash = `sha256:${'a'.repeat(64)}`;

export interface BuildBotTestMapOptions {
  readonly id?: string;
  readonly version?: string;
}

export function buildBotTestMap(options: BuildBotTestMapOptions = {}): MapDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? 'bot-test-arena',
    version: options.version ?? '0.1.0',
    width: 16,
    height: 16,
    spawns: [
      { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 8 }, headingDegrees: 0 },
      { id: 'bravo-spawn', contenderSlot: 1, position: { x: 14, y: 8 }, headingDegrees: 180 },
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
      notes: 'Bot-vs-bot suite arena, rotationally symmetric.',
    },
  };
}

export interface BuildBotTestMatchConfigOptions {
  readonly id?: string;
  readonly mapId?: string;
  readonly mapVersion?: string;
  readonly seed?: number;
  readonly maxTicks?: number;
  readonly contenders?: ReadonlyArray<{
    readonly id: string;
    readonly adapterId: string;
    readonly displayName?: string;
  }>;
}

export function buildBotTestMatchConfig(options: BuildBotTestMatchConfigOptions = {}): MatchConfig {
  const contenders = options.contenders ?? [
    { id: 'alpha', adapterId: 'baseline-random', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'baseline-random', displayName: 'Bravo' },
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? 'bot-test-match',
    rulesetVersion: 'ruleset.v0.1',
    map: {
      id: options.mapId ?? 'bot-test-arena',
      version: options.mapVersion ?? '0.1.0',
      hash: validHash,
    },
    seed: options.seed ?? 1,
    maxTicks: options.maxTicks ?? 200,
    contenders: contenders.map((entry) => ({
      id: entry.id,
      adapterId: entry.adapterId,
      ...(entry.displayName !== undefined ? { displayName: entry.displayName } : {}),
    })),
    actionTimeoutMs: 1_000,
    invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
    capture: { safeReplay: true, privateDebug: false },
  };
}
