import type { ActionProvider, ActionRequest } from '@fps-arena-bench/contracts';
import { createRng, type Rng } from '@fps-arena-bench/core';
import type { Action, AdapterMetadata, Observation } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

interface Position {
  readonly x: number;
  readonly y: number;
}

export interface ChaserBotOptions {
  readonly seed: number;
  readonly adapterId?: string;
  readonly displayName?: string;
}

const HEADING_VECTORS: ReadonlyMap<number, { dx: 1 | 0 | -1; dy: 1 | 0 | -1 }> = new Map([
  [0, { dx: 1, dy: 0 }],
  [90, { dx: 0, dy: 1 }],
  [180, { dx: -1, dy: 0 }],
  [270, { dx: 0, dy: -1 }],
]);

const normalizeHeading = (degrees: number): number => ((Math.round(degrees) % 360) + 360) % 360;

const closestVisiblePlayer = (
  observation: Observation,
): Observation['visiblePlayers'][number] | undefined => {
  const visible = observation.visiblePlayers ?? [];
  if (visible.length === 0) {
    return undefined;
  }
  const self = observation.self.position;
  let best = visible[0]!;
  let bestDistance = manhattanDistance(self, best.position);
  for (let index = 1; index < visible.length; index += 1) {
    const candidate = visible[index]!;
    const distance = manhattanDistance(self, candidate.position);
    if (
      distance < bestDistance ||
      (distance === bestDistance && candidate.contenderId < best.contenderId)
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
};

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

const turnTowardHeading = (currentHeading: number, desiredHeading: number): -90 | 0 | 90 | 180 => {
  const diff = (((desiredHeading - currentHeading) % 360) + 360) % 360;
  if (diff === 0) return 0;
  if (diff === 90) return 90;
  if (diff === 180) return 180;
  return -90;
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

export class ChaserBot implements ActionProvider {
  readonly metadata: AdapterMetadata;
  private readonly rng: Rng;
  private lastSeenEnemy: Position | undefined;

  constructor(options: ChaserBotOptions) {
    const adapterId = options.adapterId ?? 'baseline-chaser';
    this.metadata = {
      schemaVersion: SCHEMA_VERSION,
      adapterId,
      kind: 'bot',
      displayName: options.displayName ?? 'Baseline Chaser Bot',
      supportedActionSchema: SCHEMA_VERSION,
      description: 'Closes distance to the nearest visible opponent and shoots.',
    };
    this.rng = createRng(options.seed);
  }

  decide(request: ActionRequest): Action {
    const observation = request.observation;
    const enemy = closestVisiblePlayer(observation);
    if (enemy !== undefined) {
      this.lastSeenEnemy = { x: enemy.position.x, y: enemy.position.y };
      if (observation.self.ammo === undefined || observation.self.ammo > 0) {
        return {
          schemaVersion: SCHEMA_VERSION,
          type: 'shoot',
          target: { x: enemy.position.x, y: enemy.position.y },
        };
      }
      return this.stepToward(observation, enemy.position);
    }

    if (this.lastSeenEnemy !== undefined) {
      if (
        this.lastSeenEnemy.x === observation.self.position.x &&
        this.lastSeenEnemy.y === observation.self.position.y
      ) {
        this.lastSeenEnemy = undefined;
      } else {
        return this.stepToward(observation, this.lastSeenEnemy);
      }
    }

    return this.scan(observation);
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

  private scan(observation: Observation): Action {
    const choice = this.rng.nextIntBelow(4);
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
