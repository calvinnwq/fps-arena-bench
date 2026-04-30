import type { ActionProvider, ActionRequest } from '@fps-arena-bench/contracts';
import { createRng, type Rng } from '@fps-arena-bench/core';
import type { Action, AdapterMetadata } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

export interface RandomBotOptions {
  readonly seed: number;
  readonly adapterId?: string;
  readonly displayName?: string;
}

const MOVE_DIRECTIONS = [
  { x: -1, y: -1 },
  { x: -1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
] as const satisfies ReadonlyArray<{ x: -1 | 0 | 1; y: -1 | 0 | 1 }>;

const TURN_DEGREES = [-90, 0, 90, 180] as const satisfies ReadonlyArray<-90 | 0 | 90 | 180>;

const ACTION_TYPES = ['move', 'turn', 'shoot', 'noop'] as const;

export class RandomBot implements ActionProvider {
  readonly metadata: AdapterMetadata;
  private readonly rng: Rng;

  constructor(options: RandomBotOptions) {
    const adapterId = options.adapterId ?? 'baseline-random';
    this.metadata = {
      schemaVersion: SCHEMA_VERSION,
      adapterId,
      kind: 'bot',
      displayName: options.displayName ?? 'Baseline Random Bot',
      supportedActionSchema: SCHEMA_VERSION,
      description: 'Picks a uniformly random legal action each tick.',
    };
    this.rng = createRng(options.seed);
  }

  decide(request: ActionRequest): Action {
    const choice = ACTION_TYPES[this.rng.nextIntBelow(ACTION_TYPES.length)]!;
    switch (choice) {
      case 'move':
        return this.randomMove();
      case 'turn':
        return this.randomTurn();
      case 'shoot':
        return this.randomShoot(request);
      case 'noop':
        return { schemaVersion: SCHEMA_VERSION, type: 'noop' };
    }
  }

  private randomMove(): Action {
    const direction = MOVE_DIRECTIONS[this.rng.nextIntBelow(MOVE_DIRECTIONS.length)]!;
    return { schemaVersion: SCHEMA_VERSION, type: 'move', direction };
  }

  private randomTurn(): Action {
    const degrees = TURN_DEGREES[this.rng.nextIntBelow(TURN_DEGREES.length)]!;
    return { schemaVersion: SCHEMA_VERSION, type: 'turn', degrees };
  }

  private randomShoot(request: ActionRequest): Action {
    const visiblePlayers = request.observation.visiblePlayers ?? [];
    if (visiblePlayers.length > 0) {
      const target = visiblePlayers[this.rng.nextIntBelow(visiblePlayers.length)]!;
      return {
        schemaVersion: SCHEMA_VERSION,
        type: 'shoot',
        target: { x: target.position.x, y: target.position.y },
      };
    }
    const self = request.observation.self;
    const heading = ((self.headingDegrees % 360) + 360) % 360;
    const dx = heading === 0 ? 1 : heading === 180 ? -1 : 0;
    const dy = heading === 90 ? 1 : heading === 270 ? -1 : 0;
    return {
      schemaVersion: SCHEMA_VERSION,
      type: 'shoot',
      target: { x: self.position.x + dx, y: self.position.y + dy },
    };
  }
}
