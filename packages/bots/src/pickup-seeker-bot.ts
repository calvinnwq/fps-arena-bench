import type { ActionProvider, ActionRequest } from '@fps-arena-bench/contracts';
import { createRng, type Rng } from '@fps-arena-bench/core';
import type { Action, AdapterMetadata, Observation } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

interface Position {
  readonly x: number;
  readonly y: number;
}

const HEADING_VECTORS: ReadonlyMap<number, { dx: 1 | 0 | -1; dy: 1 | 0 | -1 }> = new Map([
  [0, { dx: 1, dy: 0 }],
  [90, { dx: 0, dy: 1 }],
  [180, { dx: -1, dy: 0 }],
  [270, { dx: 0, dy: -1 }],
]);

const normalizeHeading = (degrees: number): number => ((Math.round(degrees) % 360) + 360) % 360;

const manhattanDistance = (left: Position, right: Position): number =>
  Math.abs(left.x - right.x) + Math.abs(left.y - right.y);

const stepDirectionToward = (
  from: Position,
  to: Position,
): { x: -1 | 0 | 1; y: -1 | 0 | 1 } | undefined => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return undefined;
  }
  const sign = (value: number): -1 | 0 | 1 => (value > 0 ? 1 : value < 0 ? -1 : 0);
  return { x: sign(dx), y: sign(dy) };
};

const cardinalHeadingToward = (from: Position, to: Position): number | undefined => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return undefined;
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 0 : 180;
  }
  return dy > 0 ? 90 : 270;
};

const turnTowardHeading = (currentHeading: number, desiredHeading: number): -90 | 0 | 90 | 180 => {
  const diff = (((desiredHeading - currentHeading) % 360) + 360) % 360;
  if (diff === 0) return 0;
  if (diff === 90) return 90;
  if (diff === 180) return 180;
  return -90;
};

export interface PickupSeekerBotOptions {
  readonly seed: number;
  readonly adapterId?: string;
  readonly displayName?: string;
}

const PICKUP_PRIORITY: Record<'health' | 'ammo' | 'armor', number> = {
  health: 0,
  ammo: 1,
  armor: 2,
};

const choosePickup = (
  observation: Observation,
): Observation['visiblePickups'][number] | undefined => {
  const visible = observation.visiblePickups ?? [];
  if (visible.length === 0) {
    return undefined;
  }
  const self = observation.self;
  const lowHealth = self.health < 60;
  const lowAmmo = self.ammo !== undefined && self.ammo < 4;
  const candidates = visible.filter((pickup) => {
    if (lowHealth && pickup.type === 'health') return true;
    if (lowAmmo && pickup.type === 'ammo') return true;
    if (!lowHealth && !lowAmmo) return true;
    if (pickup.type === 'armor') return true;
    return false;
  });
  const pool = candidates.length > 0 ? candidates : visible;
  let best = pool[0]!;
  let bestDistance = manhattanDistance(self.position, best.position);
  let bestPriority = PICKUP_PRIORITY[best.type];
  for (let index = 1; index < pool.length; index += 1) {
    const candidate = pool[index]!;
    const distance = manhattanDistance(self.position, candidate.position);
    const priority = PICKUP_PRIORITY[candidate.type];
    const closer = distance < bestDistance;
    const equallyClose = distance === bestDistance;
    if (
      closer ||
      (equallyClose && priority < bestPriority) ||
      (equallyClose && priority === bestPriority && candidate.id < best.id)
    ) {
      best = candidate;
      bestDistance = distance;
      bestPriority = priority;
    }
  }
  return best;
};

export class PickupSeekerBot implements ActionProvider {
  readonly metadata: AdapterMetadata;
  private readonly rng: Rng;

  constructor(options: PickupSeekerBotOptions) {
    const adapterId = options.adapterId ?? 'baseline-pickup-seeker';
    this.metadata = {
      schemaVersion: SCHEMA_VERSION,
      adapterId,
      kind: 'bot',
      displayName: options.displayName ?? 'Baseline Pickup Seeker Bot',
      supportedActionSchema: SCHEMA_VERSION,
      description: 'Moves toward the closest visible pickup and explores when none are visible.',
    };
    this.rng = createRng(options.seed);
  }

  decide(request: ActionRequest): Action {
    const observation = request.observation;
    const pickup = choosePickup(observation);
    if (pickup !== undefined) {
      return this.stepToward(observation, pickup.position);
    }

    const visiblePlayers = observation.visiblePlayers ?? [];
    if (visiblePlayers.length > 0 && (observation.self.ammo ?? 1) > 0) {
      const target = visiblePlayers[0]!;
      return {
        schemaVersion: SCHEMA_VERSION,
        type: 'shoot',
        target: { x: target.position.x, y: target.position.y },
      };
    }

    return this.explore(observation);
  }

  private stepToward(observation: Observation, target: Position): Action {
    const desiredHeading = cardinalHeadingToward(observation.self.position, target);
    const currentHeading = normalizeHeading(observation.self.headingDegrees);
    if (desiredHeading !== undefined && desiredHeading !== currentHeading) {
      const degrees = turnTowardHeading(currentHeading, desiredHeading);
      if (degrees !== 0) {
        return { schemaVersion: SCHEMA_VERSION, type: 'turn', degrees };
      }
    }
    const step = stepDirectionToward(observation.self.position, target);
    if (step === undefined) {
      return { schemaVersion: SCHEMA_VERSION, type: 'noop' };
    }
    return { schemaVersion: SCHEMA_VERSION, type: 'move', direction: step };
  }

  private explore(observation: Observation): Action {
    const choice = this.rng.nextIntBelow(3);
    if (choice === 0) {
      return { schemaVersion: SCHEMA_VERSION, type: 'turn', degrees: 90 };
    }
    if (choice === 1) {
      return { schemaVersion: SCHEMA_VERSION, type: 'turn', degrees: -90 };
    }
    const heading = normalizeHeading(observation.self.headingDegrees);
    const vector = HEADING_VECTORS.get(heading);
    if (vector !== undefined) {
      return {
        schemaVersion: SCHEMA_VERSION,
        type: 'move',
        direction: { x: vector.dx, y: vector.dy },
      };
    }
    return { schemaVersion: SCHEMA_VERSION, type: 'noop' };
  }
}
