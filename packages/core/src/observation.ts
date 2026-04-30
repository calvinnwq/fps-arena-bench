import type { Observation } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

import type { MatchState, PickupState, PlayerState } from './state.js';
import { isInFieldOfView, isLineOfSightClear } from './visibility.js';

const cloneScore = (score: Record<string, number>): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const key of Object.keys(score).sort()) {
    result[key] = score[key]!;
  }
  return result;
};

const observableSelf = (player: PlayerState) => ({
  contenderId: player.contenderId,
  position: { x: player.position.x, y: player.position.y },
  headingDegrees: player.headingDegrees,
  health: player.health,
  ammo: player.ammo,
});

const observableOpponent = (player: PlayerState) => ({
  contenderId: player.contenderId,
  position: { x: player.position.x, y: player.position.y },
  headingDegrees: player.headingDegrees,
  health: player.health,
});

const observablePickup = (pickup: PickupState) => {
  const base = {
    id: pickup.id,
    type: pickup.type,
    position: { x: pickup.position.x, y: pickup.position.y },
  };
  return pickup.respawnTicks === undefined ? base : { ...base, respawnTicks: pickup.respawnTicks };
};

const observableWall = (wall: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) => ({
  id: wall.id,
  x: wall.x,
  y: wall.y,
  width: wall.width,
  height: wall.height,
});

export function generateObservation(state: MatchState, contenderId: string): Observation {
  const self = state.players.find((player) => player.contenderId === contenderId);
  if (self === undefined) {
    throw new Error(`Unknown contender ${contenderId}`);
  }

  const visiblePlayers = state.players
    .filter(
      (player) =>
        player.contenderId !== contenderId &&
        player.alive &&
        isInFieldOfView(self.position, self.headingDegrees, player.position) &&
        isLineOfSightClear(self.position, player.position, state.map.walls),
    )
    .map(observableOpponent);

  const visiblePickups = state.pickups
    .filter(
      (pickup) =>
        pickup.available &&
        isInFieldOfView(self.position, self.headingDegrees, pickup.position) &&
        isLineOfSightClear(self.position, pickup.position, state.map.walls),
    )
    .map(observablePickup);

  // Walls are static map geometry presumed known to all contenders. v0.1 includes
  // every wall in observations; future iterations may FOV-gate this.
  const visibleWalls = state.map.walls.map(observableWall);

  return {
    schemaVersion: SCHEMA_VERSION,
    rulesetVersion: state.config.rulesetVersion,
    matchId: state.config.id,
    tick: state.tick,
    self: observableSelf(self),
    visiblePlayers,
    visiblePickups,
    visibleWalls,
    score: cloneScore(state.score),
  };
}

export function generateObservations(state: MatchState): Map<string, Observation> {
  const observations = new Map<string, Observation>();
  for (const player of state.players) {
    if (!player.alive) {
      continue;
    }
    observations.set(player.contenderId, generateObservation(state, player.contenderId));
  }
  return observations;
}
