import { z } from 'zod';

export const SCHEMA_PACKAGE_VERSION = '0.0.0';
export const SCHEMA_VERSION = 'fps-arena-bench.schema.v0.1';

const IdSchema = z.string().min(1);
const VersionSchema = z.string().min(1);
const HashSchema = z.string().regex(/^sha256:[a-zA-Z0-9._:-]+$/, {
  message: 'Expected sha256:<digest>.',
});

export const PositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

const UnitAxisSchema = z.union([z.literal(-1), z.literal(0), z.literal(1)]);

export const ActionSchema = z.discriminatedUnion('type', [
  z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      type: z.literal('move'),
      direction: z
        .object({
          x: UnitAxisSchema,
          y: UnitAxisSchema,
        })
        .strict()
        .refine((direction) => direction.x !== 0 || direction.y !== 0, {
          message: 'Move direction cannot be zero on both axes.',
        }),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      type: z.literal('turn'),
      degrees: z.union([z.literal(-90), z.literal(0), z.literal(90), z.literal(180)]),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      type: z.literal('shoot'),
      target: PositionSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      type: z.literal('noop'),
    })
    .strict(),
]);

export const PlayerObservationSchema = z
  .object({
    contenderId: IdSchema,
    position: PositionSchema,
    headingDegrees: z.number().finite().min(0).max(359),
    health: z.number().int().min(0).max(100),
    ammo: z.number().int().min(0).optional(),
    team: z.string().min(1).optional(),
  })
  .strict();

export const PickupSchema = z
  .object({
    id: IdSchema,
    type: z.enum(['health', 'ammo', 'armor']),
    position: PositionSchema,
    respawnTicks: z.number().int().positive().optional(),
  })
  .strict();

export const WallSchema = z
  .object({
    id: IdSchema,
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

export const ObservationSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    rulesetVersion: VersionSchema,
    matchId: IdSchema,
    tick: z.number().int().nonnegative(),
    self: PlayerObservationSchema,
    visiblePlayers: z.array(PlayerObservationSchema).default([]),
    visiblePickups: z.array(PickupSchema).default([]),
    visibleWalls: z.array(WallSchema).default([]),
    score: z.record(IdSchema, z.number().int()),
  })
  .strict();

export const MapSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: IdSchema,
    version: VersionSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    spawns: z
      .array(
        z
          .object({
            id: IdSchema,
            contenderSlot: z.number().int().nonnegative(),
            position: PositionSchema,
            headingDegrees: z.number().finite().min(0).max(359),
          })
          .strict(),
      )
      .min(2, 'At least two spawns are required.'),
    walls: z.array(WallSchema).default([]),
    pickups: z.array(PickupSchema).default([]),
    symmetry: z
      .object({
        kind: z.enum(['rotational-180', 'mirror-x', 'mirror-y', 'none']),
        notes: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((map, context) => {
    const inside = (position: z.infer<typeof PositionSchema>) =>
      position.x >= 0 && position.x <= map.width && position.y >= 0 && position.y <= map.height;

    for (const [index, spawn] of map.spawns.entries()) {
      if (!inside(spawn.position)) {
        context.addIssue({
          code: 'custom',
          path: ['spawns', index, 'position'],
          message: 'Spawn position must be within map bounds.',
        });
      }
    }

    for (const [index, pickup] of map.pickups.entries()) {
      if (!inside(pickup.position)) {
        context.addIssue({
          code: 'custom',
          path: ['pickups', index, 'position'],
          message: 'Pickup position must be within map bounds.',
        });
      }
    }
  });

export const MatchConfigSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: IdSchema,
    rulesetVersion: VersionSchema,
    map: z
      .object({
        id: IdSchema,
        version: VersionSchema,
        hash: HashSchema,
      })
      .strict(),
    seed: z.number().int().nonnegative(),
    maxTicks: z.number().int().positive(),
    contenders: z
      .array(
        z
          .object({
            id: IdSchema,
            adapterId: IdSchema,
            displayName: z.string().min(1).optional(),
          })
          .strict(),
      )
      .min(2, 'At least two contenders are required.'),
    actionTimeoutMs: z.number().int().positive(),
    invalidActionPolicy: z
      .object({
        maxInvalidActions: z.number().int().nonnegative(),
        fallbackAction: z.enum(['noop', 'repeat-last-valid']),
      })
      .strict(),
    capture: z
      .object({
        safeReplay: z.boolean(),
        privateDebug: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const ResultSummarySchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    matchId: IdSchema,
    winner: IdSchema.nullable(),
    placements: z.array(
      z
        .object({
          contenderId: IdSchema,
          rank: z.number().int().positive(),
        })
        .strict(),
    ),
    ticksElapsed: z.number().int().nonnegative(),
    stats: z.record(
      IdSchema,
      z
        .object({
          kills: z.number().int().nonnegative(),
          deaths: z.number().int().nonnegative(),
          damageDealt: z.number().nonnegative(),
          damageTaken: z.number().nonnegative(),
          survivalTicks: z.number().int().nonnegative(),
          pickupsCollected: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    reliability: z
      .object({
        invalidJson: z.number().int().nonnegative(),
        schemaFailures: z.number().int().nonnegative(),
        repairAttempts: z.number().int().nonnegative(),
        repairSuccesses: z.number().int().nonnegative(),
        timeouts: z.number().int().nonnegative(),
        fallbackActions: z.number().int().nonnegative(),
      })
      .strict(),
    latency: z
      .object({
        averageMs: z.number().nonnegative(),
        p50Ms: z.number().nonnegative(),
        p95Ms: z.number().nonnegative(),
        timeoutBudgetMs: z.number().positive(),
      })
      .strict(),
  })
  .strict();

export const ReplaySafeArtifactSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    matchId: IdSchema,
    config: MatchConfigSchema,
    map: MapSchema,
    acceptedActions: z.array(
      z
        .object({
          tick: z.number().int().nonnegative(),
          contenderId: IdSchema,
          action: ActionSchema,
          latencyMs: z.number().nonnegative(),
        })
        .strict(),
    ),
    events: z.array(
      z
        .object({
          tick: z.number().int().nonnegative(),
          type: IdSchema,
          contenderId: IdSchema.optional(),
          details: z
            .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
            .optional(),
        })
        .strict(),
    ),
    stateHashes: z.array(
      z
        .object({
          tick: z.number().int().nonnegative(),
          hash: HashSchema,
        })
        .strict(),
    ),
    snapshots: z.array(z.record(z.string(), z.unknown())).optional(),
    result: ResultSummarySchema,
    rawPrompt: z.never().optional(),
    rawModelOutput: z.never().optional(),
  })
  .strict();

export const AdapterMetadataSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    adapterId: IdSchema,
    kind: z.enum(['bot', 'mock', 'local', 'harness', 'api']),
    displayName: z.string().min(1),
    supportedActionSchema: z.literal(SCHEMA_VERSION),
    description: z.string().min(1).optional(),
  })
  .strict();

export const AdapterErrorSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    adapterId: IdSchema,
    code: z.enum([
      'invalid-json',
      'schema-failure',
      'timeout',
      'aborted',
      'output-cap',
      'process-error',
    ]),
    message: z.string().min(1),
    retryable: z.boolean(),
  })
  .strict();

export type Action = z.infer<typeof ActionSchema>;
export type Observation = z.infer<typeof ObservationSchema>;
export type MapDefinition = z.infer<typeof MapSchema>;
export type MatchConfig = z.infer<typeof MatchConfigSchema>;
export type ReplaySafeArtifact = z.infer<typeof ReplaySafeArtifactSchema>;
export type ResultSummary = z.infer<typeof ResultSummarySchema>;
export type AdapterMetadata = z.infer<typeof AdapterMetadataSchema>;
export type AdapterError = z.infer<typeof AdapterErrorSchema>;

export function formatZodError(label: string, error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${label}.${issue.path.join('.')}` : label;
    return `${path}: ${issue.message}`;
  });

  return `Invalid ${label}: ${issues.join('; ')}`;
}

export function validateWithSchema<T>(label: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }

  return result.data;
}

export const validateAction = (value: unknown): Action =>
  validateWithSchema('action', ActionSchema, value);
export const validateObservation = (value: unknown): Observation =>
  validateWithSchema('observation', ObservationSchema, value);
export const validateMap = (value: unknown): MapDefinition =>
  validateWithSchema('map', MapSchema, value);
export const validateMatchConfig = (value: unknown): MatchConfig =>
  validateWithSchema('matchConfig', MatchConfigSchema, value);
export const validateReplaySafeArtifact = (value: unknown): ReplaySafeArtifact =>
  validateWithSchema('replaySafeArtifact', ReplaySafeArtifactSchema, value);
