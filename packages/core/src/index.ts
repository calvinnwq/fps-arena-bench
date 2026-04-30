export const ENGINE_PACKAGE_VERSION = '0.0.0';

export {
  CENTI_DEGREES_PER_DEGREE,
  CENTI_DEGREES_PER_TURN,
  MILLITILES_PER_TILE,
  applyTurn,
  centiDegreesToDegrees,
  degreesToCentiDegrees,
  manhattanMillitiles,
  millitilesToTiles,
  normalizeCentiDegrees,
  roundHalfToEven,
  squaredDistanceMillitiles,
  tilesToMillitiles,
} from './fixed-point.js';
export type { TurnDelta } from './fixed-point.js';

export { createRng } from './rng.js';
export type { Rng } from './rng.js';

export { RULESET_V0_1, RULESET_VERSION } from './ruleset.js';
export type {
  AllowedTurnDegrees,
  FieldOfViewConstants,
  HealthConstants,
  MovementConstants,
  PickupConstants,
  RulesetConstants,
  TickConstants,
  TurningConstants,
  WeaponConstants,
} from './ruleset.js';
