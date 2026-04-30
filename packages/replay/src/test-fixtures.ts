import type { MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

const validHash = `sha256:${'a'.repeat(64)}`;

export interface BuildReplayTestMapOptions {
  readonly id?: string;
  readonly version?: string;
}

export function buildReplayTestMap(options: BuildReplayTestMapOptions = {}): MapDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? 'replay-test-arena',
    version: options.version ?? '0.1.0',
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

export interface BuildReplayTestMatchConfigOptions {
  readonly id?: string;
  readonly mapId?: string;
  readonly mapVersion?: string;
  readonly seed?: number;
  readonly maxTicks?: number;
  readonly capturePrivateDebug?: boolean;
  readonly contenders?: ReadonlyArray<{
    readonly id: string;
    readonly adapterId: string;
    readonly displayName?: string;
  }>;
}

export function buildReplayTestMatchConfig(
  options: BuildReplayTestMatchConfigOptions = {},
): MatchConfig {
  const contenders = options.contenders ?? [
    { id: 'alpha', adapterId: 'mock-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'mock-bot', displayName: 'Bravo' },
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? 'replay-test-match',
    rulesetVersion: 'ruleset.v0.1',
    map: {
      id: options.mapId ?? 'replay-test-arena',
      version: options.mapVersion ?? '0.1.0',
      hash: validHash,
    },
    seed: options.seed ?? 1,
    maxTicks: options.maxTicks ?? 20,
    contenders: contenders.map((entry) => ({
      id: entry.id,
      adapterId: entry.adapterId,
      ...(entry.displayName !== undefined ? { displayName: entry.displayName } : {}),
    })),
    actionTimeoutMs: 1_000,
    invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
    capture: { safeReplay: true, privateDebug: options.capturePrivateDebug ?? false },
  };
}
