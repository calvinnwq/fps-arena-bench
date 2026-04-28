import { z } from 'zod';

export const SCHEMA_PACKAGE_VERSION = '0.0.0';
export const SCHEMA_VERSION = 'fps-arena-bench.schema.v0.1';

const IdSchema = z.string().min(1);
const VersionSchema = z.string().min(1);
const HashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/, {
  message: 'Expected sha256:<64 lowercase hex digest>.',
});
const MAX_REACHABLE_GRID_CELLS = 65_536;
const MAX_MAP_SPAWNS = 64;
const MAX_MAP_WALLS = 256;
const MAX_MAP_PICKUPS = 1_024;

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

type PositionValue = z.infer<typeof PositionSchema>;
type WallValue = z.infer<typeof WallSchema>;

const isInsideBounds = (position: PositionValue, width: number, height: number): boolean =>
  position.x >= 0 && position.x <= width && position.y >= 0 && position.y <= height;

const isInsideWall = (position: PositionValue, wall: WallValue): boolean =>
  position.x > wall.x &&
  position.x < wall.x + wall.width &&
  position.y > wall.y &&
  position.y < wall.y + wall.height;

const hasIntegerGridPosition = (position: PositionValue): boolean =>
  Number.isInteger(position.x) && Number.isInteger(position.y);

const rotatePosition180 = (
  position: PositionValue,
  width: number,
  height: number,
): PositionValue => ({
  x: width - position.x,
  y: height - position.y,
});

const mirrorPositionX = (position: PositionValue, width: number): PositionValue => ({
  x: width - position.x,
  y: position.y,
});

const mirrorPositionY = (position: PositionValue, height: number): PositionValue => ({
  x: position.x,
  y: height - position.y,
});

const samePosition = (left: PositionValue, right: PositionValue): boolean =>
  left.x === right.x && left.y === right.y;

const oppositeHeading = (left: number, right: number): boolean =>
  (left - right + 360) % 360 === 180 || (right - left + 360) % 360 === 180;

const mirroredHeadingX = (heading: number): number => (180 - heading + 360) % 360;

const mirroredHeadingY = (heading: number): number => (360 - heading) % 360;

const rotatedWallEquals = (
  wall: WallValue,
  candidate: WallValue,
  width: number,
  height: number,
): boolean =>
  candidate.x === width - wall.x - wall.width &&
  candidate.y === height - wall.y - wall.height &&
  candidate.width === wall.width &&
  candidate.height === wall.height;

const mirroredWallXEquals = (wall: WallValue, candidate: WallValue, width: number): boolean =>
  candidate.x === width - wall.x - wall.width &&
  candidate.y === wall.y &&
  candidate.width === wall.width &&
  candidate.height === wall.height;

const mirroredWallYEquals = (wall: WallValue, candidate: WallValue, height: number): boolean =>
  candidate.x === wall.x &&
  candidate.y === height - wall.y - wall.height &&
  candidate.width === wall.width &&
  candidate.height === wall.height;

const gridKey = (position: PositionValue): string => `${position.x},${position.y}`;

const reachableGridKeys = (
  start: PositionValue,
  width: number,
  height: number,
  walls: WallValue[],
): Set<string> => {
  const queue = [start];
  const visited = new Set<string>([gridKey(start)]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const neighbor of neighbors) {
      const key = gridKey(neighbor);
      if (
        visited.has(key) ||
        !isInsideBounds(neighbor, width, height) ||
        walls.some((wall) => isInsideWall(neighbor, wall))
      ) {
        continue;
      }

      visited.add(key);
      queue.push(neighbor);
    }
  }

  return visited;
};

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
      .min(2, 'At least two spawns are required.')
      .max(MAX_MAP_SPAWNS, `At most ${MAX_MAP_SPAWNS} spawns are allowed.`),
    walls: z.array(WallSchema).max(MAX_MAP_WALLS).default([]),
    pickups: z.array(PickupSchema).max(MAX_MAP_PICKUPS).default([]),
    symmetry: z
      .object({
        kind: z.enum(['rotational-180', 'mirror-x', 'mirror-y', 'none']),
        notes: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((map, context) => {
    for (const [index, spawn] of map.spawns.entries()) {
      if (!isInsideBounds(spawn.position, map.width, map.height)) {
        context.addIssue({
          code: 'custom',
          path: ['spawns', index, 'position'],
          message: 'Spawn position must be within map bounds.',
        });
      }

      if (!hasIntegerGridPosition(spawn.position)) {
        context.addIssue({
          code: 'custom',
          path: ['spawns', index, 'position'],
          message: 'Spawn position must use integer grid coordinates.',
        });
      }

      if (map.walls.some((wall) => isInsideWall(spawn.position, wall))) {
        context.addIssue({
          code: 'custom',
          path: ['spawns', index, 'position'],
          message: 'Spawn position must not be inside a wall.',
        });
      }
    }

    for (const [index, pickup] of map.pickups.entries()) {
      if (!isInsideBounds(pickup.position, map.width, map.height)) {
        context.addIssue({
          code: 'custom',
          path: ['pickups', index, 'position'],
          message: 'Pickup position must be within map bounds.',
        });
      }

      if (!hasIntegerGridPosition(pickup.position)) {
        context.addIssue({
          code: 'custom',
          path: ['pickups', index, 'position'],
          message: 'Pickup position must use integer grid coordinates.',
        });
      }

      if (map.walls.some((wall) => isInsideWall(pickup.position, wall))) {
        context.addIssue({
          code: 'custom',
          path: ['pickups', index, 'position'],
          message: 'Pickup position must not be inside a wall.',
        });
      }
    }

    for (const [index, wall] of map.walls.entries()) {
      if (
        wall.x < 0 ||
        wall.y < 0 ||
        wall.x + wall.width > map.width ||
        wall.y + wall.height > map.height
      ) {
        context.addIssue({
          code: 'custom',
          path: ['walls', index],
          message: 'Wall rectangle must be within map bounds.',
        });
      }
    }

    const contenderSlots = new Set<number>();
    for (const [index, spawn] of map.spawns.entries()) {
      if (contenderSlots.has(spawn.contenderSlot)) {
        context.addIssue({
          code: 'custom',
          path: ['spawns', index, 'contenderSlot'],
          message: 'Spawn contenderSlot must be unique.',
        });
      }
      contenderSlots.add(spawn.contenderSlot);
    }

    for (let slot = 0; slot < map.spawns.length; slot += 1) {
      if (!contenderSlots.has(slot)) {
        context.addIssue({
          code: 'custom',
          path: ['spawns'],
          message: 'Spawn contenderSlot values must be contiguous from 0.',
        });
        break;
      }
    }

    if (map.symmetry.kind !== 'none' && map.symmetry.notes === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['symmetry', 'notes'],
        message: 'Symmetry assumptions must be documented in notes.',
      });
    }

    if (map.symmetry.kind === 'rotational-180') {
      for (const [index, spawn] of map.spawns.entries()) {
        const rotated = rotatePosition180(spawn.position, map.width, map.height);
        if (
          !map.spawns.some(
            (candidate) =>
              samePosition(candidate.position, rotated) &&
              oppositeHeading(candidate.headingDegrees, spawn.headingDegrees),
          )
        ) {
          context.addIssue({
            code: 'custom',
            path: ['spawns', index, 'position'],
            message: 'Spawn must have a 180-degree rotational counterpart.',
          });
        }
      }

      for (const [index, wall] of map.walls.entries()) {
        if (
          !map.walls.some((candidate) => rotatedWallEquals(wall, candidate, map.width, map.height))
        ) {
          context.addIssue({
            code: 'custom',
            path: ['walls', index],
            message: 'Wall must have a 180-degree rotational counterpart.',
          });
        }
      }

      for (const [index, pickup] of map.pickups.entries()) {
        const rotated = rotatePosition180(pickup.position, map.width, map.height);
        if (
          !map.pickups.some(
            (candidate) =>
              candidate.type === pickup.type &&
              candidate.respawnTicks === pickup.respawnTicks &&
              samePosition(candidate.position, rotated),
          )
        ) {
          context.addIssue({
            code: 'custom',
            path: ['pickups', index, 'position'],
            message: 'Pickup must have a same-type 180-degree rotational counterpart.',
          });
        }
      }
    }

    if (map.symmetry.kind === 'mirror-x' || map.symmetry.kind === 'mirror-y') {
      const mirrorPosition =
        map.symmetry.kind === 'mirror-x'
          ? (position: PositionValue) => mirrorPositionX(position, map.width)
          : (position: PositionValue) => mirrorPositionY(position, map.height);
      const mirrorHeading = map.symmetry.kind === 'mirror-x' ? mirroredHeadingX : mirroredHeadingY;
      const wallMatches =
        map.symmetry.kind === 'mirror-x'
          ? (wall: WallValue, candidate: WallValue) =>
              mirroredWallXEquals(wall, candidate, map.width)
          : (wall: WallValue, candidate: WallValue) =>
              mirroredWallYEquals(wall, candidate, map.height);

      for (const [index, spawn] of map.spawns.entries()) {
        const mirrored = mirrorPosition(spawn.position);
        if (
          !map.spawns.some(
            (candidate) =>
              samePosition(candidate.position, mirrored) &&
              candidate.headingDegrees === mirrorHeading(spawn.headingDegrees),
          )
        ) {
          context.addIssue({
            code: 'custom',
            path: ['spawns', index, 'position'],
            message: 'Spawn must have a mirrored counterpart.',
          });
        }
      }

      for (const [index, wall] of map.walls.entries()) {
        if (!map.walls.some((candidate) => wallMatches(wall, candidate))) {
          context.addIssue({
            code: 'custom',
            path: ['walls', index],
            message: 'Wall must have a mirrored counterpart.',
          });
        }
      }

      for (const [index, pickup] of map.pickups.entries()) {
        const mirrored = mirrorPosition(pickup.position);
        if (
          !map.pickups.some(
            (candidate) =>
              candidate.type === pickup.type &&
              candidate.respawnTicks === pickup.respawnTicks &&
              samePosition(candidate.position, mirrored),
          )
        ) {
          context.addIssue({
            code: 'custom',
            path: ['pickups', index, 'position'],
            message: 'Pickup must have a same-type mirrored counterpart.',
          });
        }
      }
    }

    const reachableGridCellCount = (map.width + 1) * (map.height + 1);
    if (reachableGridCellCount > MAX_REACHABLE_GRID_CELLS) {
      context.addIssue({
        code: 'custom',
        path: ['width'],
        message: `Map reachable grid must contain at most ${MAX_REACHABLE_GRID_CELLS} cells.`,
      });
    }

    const reachableTargets = [...map.spawns, ...map.pickups];
    if (
      reachableGridCellCount <= MAX_REACHABLE_GRID_CELLS &&
      reachableTargets.every(
        (target) =>
          hasIntegerGridPosition(target.position) &&
          isInsideBounds(target.position, map.width, map.height) &&
          !map.walls.some((wall) => isInsideWall(target.position, wall)),
      )
    ) {
      const reachable = reachableGridKeys(
        map.spawns[0]!.position,
        map.width,
        map.height,
        map.walls,
      );
      for (const [index, spawn] of map.spawns.entries()) {
        if (!reachable.has(gridKey(spawn.position))) {
          context.addIssue({
            code: 'custom',
            path: ['spawns', index, 'position'],
            message: 'Spawn must be reachable from the first spawn.',
          });
        }
      }

      for (const [index, pickup] of map.pickups.entries()) {
        if (!reachable.has(gridKey(pickup.position))) {
          context.addIssue({
            code: 'custom',
            path: ['pickups', index, 'position'],
            message: 'Pickup must be reachable from the first spawn.',
          });
        }
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
  .strict()
  .superRefine((config, context) => {
    const contenderIds = new Set<string>();
    for (const [index, contender] of config.contenders.entries()) {
      if (contenderIds.has(contender.id)) {
        context.addIssue({
          code: 'custom',
          path: ['contenders', index, 'id'],
          message: 'Contender id must be unique.',
        });
      }
      contenderIds.add(contender.id);
    }
  });

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
  .strict()
  .superRefine((result, context) => {
    const placementContenderIds = new Set<string>();
    const placementRanks = new Set<number>();
    for (const [index, placement] of result.placements.entries()) {
      if (placementContenderIds.has(placement.contenderId)) {
        context.addIssue({
          code: 'custom',
          path: ['placements', index, 'contenderId'],
          message: 'Result placement contenderId must be unique.',
        });
      }
      placementContenderIds.add(placement.contenderId);

      if (placementRanks.has(placement.rank)) {
        context.addIssue({
          code: 'custom',
          path: ['placements', index, 'rank'],
          message: 'Result placement rank must be unique.',
        });
      }
      placementRanks.add(placement.rank);
    }

    for (let rank = 1; rank <= placementRanks.size; rank += 1) {
      if (!placementRanks.has(rank)) {
        context.addIssue({
          code: 'custom',
          path: ['placements'],
          message: 'Result placement ranks must be contiguous from 1.',
        });
        break;
      }
    }

    const firstPlace = result.placements.find((placement) => placement.rank === 1);
    if (result.winner !== null && firstPlace?.contenderId !== result.winner) {
      context.addIssue({
        code: 'custom',
        path: ['winner'],
        message: 'Result winner must match the rank-1 placement.',
      });
    }

    if (result.reliability.repairSuccesses > result.reliability.repairAttempts) {
      context.addIssue({
        code: 'custom',
        path: ['reliability', 'repairSuccesses'],
        message: 'Repair successes cannot exceed repair attempts.',
      });
    }

    if (result.latency.p50Ms > result.latency.p95Ms) {
      context.addIssue({
        code: 'custom',
        path: ['latency', 'p50Ms'],
        message: 'p50 latency cannot exceed p95 latency.',
      });
    }
  });

const ReplaySnapshotSchema = z
  .object({
    tick: z.number().int().nonnegative(),
    hash: HashSchema,
  })
  .strict();

const ReplayEventDetailsSchema = z
  .object({
    amount: z.number().finite().optional(),
    ammo: z.number().int().nonnegative().optional(),
    damage: z.number().nonnegative().optional(),
    health: z.number().nonnegative().optional(),
    invalidActions: z.number().int().nonnegative().optional(),
    latencyMs: z.number().nonnegative().optional(),
    success: z.boolean().optional(),
    timeout: z.boolean().optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
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
          details: ReplayEventDetailsSchema.optional(),
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
    snapshots: z.array(ReplaySnapshotSchema).optional(),
    result: ResultSummarySchema,
    rawPrompt: z.never().optional(),
    rawModelOutput: z.never().optional(),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (artifact.matchId !== artifact.result.matchId) {
      context.addIssue({
        code: 'custom',
        path: ['result', 'matchId'],
        message: 'Result matchId must match replay matchId.',
      });
    }

    if (artifact.config.map.id !== artifact.map.id) {
      context.addIssue({
        code: 'custom',
        path: ['config', 'map', 'id'],
        message: 'Config map id must match embedded map id.',
      });
    }

    if (artifact.config.map.version !== artifact.map.version) {
      context.addIssue({
        code: 'custom',
        path: ['config', 'map', 'version'],
        message: 'Config map version must match embedded map version.',
      });
    }

    const contenderIds = new Set(artifact.config.contenders.map((contender) => contender.id));

    for (const [index, acceptedAction] of artifact.acceptedActions.entries()) {
      if (acceptedAction.tick > artifact.result.ticksElapsed) {
        context.addIssue({
          code: 'custom',
          path: ['acceptedActions', index, 'tick'],
          message: 'Accepted action tick cannot exceed result ticksElapsed.',
        });
      }
    }

    for (const [index, event] of artifact.events.entries()) {
      if (event.tick > artifact.result.ticksElapsed) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'tick'],
          message: 'Event tick cannot exceed result ticksElapsed.',
        });
      }
    }

    for (const [index, stateHash] of artifact.stateHashes.entries()) {
      if (stateHash.tick > artifact.result.ticksElapsed) {
        context.addIssue({
          code: 'custom',
          path: ['stateHashes', index, 'tick'],
          message: 'State hash tick cannot exceed result ticksElapsed.',
        });
      }
    }

    for (const [index, snapshot] of artifact.snapshots?.entries() ?? []) {
      if (snapshot.tick > artifact.result.ticksElapsed) {
        context.addIssue({
          code: 'custom',
          path: ['snapshots', index, 'tick'],
          message: 'Snapshot tick cannot exceed result ticksElapsed.',
        });
      }
    }

    for (let index = 0; index < artifact.config.contenders.length; index += 1) {
      if (!artifact.map.spawns.some((spawn) => spawn.contenderSlot === index)) {
        context.addIssue({
          code: 'custom',
          path: ['map', 'spawns'],
          message: 'Embedded map must define a spawn slot for each configured contender.',
        });
        break;
      }
    }

    for (const [index, acceptedAction] of artifact.acceptedActions.entries()) {
      if (!contenderIds.has(acceptedAction.contenderId)) {
        context.addIssue({
          code: 'custom',
          path: ['acceptedActions', index, 'contenderId'],
          message: 'Accepted action contenderId must reference a configured contender.',
        });
      }
    }

    for (const [index, event] of artifact.events.entries()) {
      if (event.contenderId !== undefined && !contenderIds.has(event.contenderId)) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'contenderId'],
          message: 'Event contenderId must reference a configured contender.',
        });
      }
    }

    if (artifact.result.winner !== null && !contenderIds.has(artifact.result.winner)) {
      context.addIssue({
        code: 'custom',
        path: ['result', 'winner'],
        message: 'Result winner must reference a configured contender.',
      });
    }

    for (const [index, placement] of artifact.result.placements.entries()) {
      if (!contenderIds.has(placement.contenderId)) {
        context.addIssue({
          code: 'custom',
          path: ['result', 'placements', index, 'contenderId'],
          message: 'Result placement contenderId must reference a configured contender.',
        });
      }
    }

    for (const contenderId of Object.keys(artifact.result.stats)) {
      if (!contenderIds.has(contenderId)) {
        context.addIssue({
          code: 'custom',
          path: ['result', 'stats', contenderId],
          message: 'Result stats contenderId must reference a configured contender.',
        });
      }
    }
  });

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
