import { CENTI_DEGREES_PER_DEGREE, MILLITILES_PER_TILE } from './fixed-point.js';

export const RULESET_VERSION = 'ruleset.v0.1';

export type AllowedTurnDegrees = readonly [-90, 0, 90, 180];

export interface MovementConstants {
  readonly tilesPerTick: number;
  readonly millitilesPerTick: number;
}

export interface TurningConstants {
  readonly allowedDegrees: AllowedTurnDegrees;
}

export interface FieldOfViewConstants {
  readonly degrees: number;
  readonly centiDegrees: number;
  readonly halfDegrees: number;
  readonly halfCentiDegrees: number;
}

export interface WeaponConstants {
  readonly rangeTiles: number;
  readonly rangeMillitiles: number;
  readonly damage: number;
  readonly ammoPerShot: number;
  readonly initialAmmo: number;
  readonly maxAmmo: number;
}

export interface HealthConstants {
  readonly initialHp: number;
  readonly maxHp: number;
  readonly minHp: number;
}

export interface TickConstants {
  readonly defaultMaxTicks: number;
  readonly hardCapTicks: number;
  readonly defaultActionTimeoutMs: number;
  readonly maxActionTimeoutMs: number;
}

export interface PickupConstants {
  readonly defaultRespawnTicks: number;
  readonly healthAmount: number;
  readonly ammoAmount: number;
  readonly armorAmount: number;
}

export interface RulesetConstants {
  readonly version: string;
  readonly movement: MovementConstants;
  readonly turning: TurningConstants;
  readonly fov: FieldOfViewConstants;
  readonly weapon: WeaponConstants;
  readonly health: HealthConstants;
  readonly tick: TickConstants;
  readonly pickup: PickupConstants;
}

const FOV_DEGREES = 90;
const MOVE_TILES_PER_TICK = 1;
const WEAPON_RANGE_TILES = 10;

export const RULESET_V0_1: RulesetConstants = Object.freeze({
  version: RULESET_VERSION,
  movement: Object.freeze({
    tilesPerTick: MOVE_TILES_PER_TICK,
    millitilesPerTick: MOVE_TILES_PER_TICK * MILLITILES_PER_TILE,
  }),
  turning: Object.freeze({
    allowedDegrees: Object.freeze([-90, 0, 90, 180] as const),
  }),
  fov: Object.freeze({
    degrees: FOV_DEGREES,
    centiDegrees: FOV_DEGREES * CENTI_DEGREES_PER_DEGREE,
    halfDegrees: FOV_DEGREES / 2,
    halfCentiDegrees: (FOV_DEGREES / 2) * CENTI_DEGREES_PER_DEGREE,
  }),
  weapon: Object.freeze({
    rangeTiles: WEAPON_RANGE_TILES,
    rangeMillitiles: WEAPON_RANGE_TILES * MILLITILES_PER_TILE,
    damage: 25,
    ammoPerShot: 1,
    initialAmmo: 12,
    maxAmmo: 24,
  }),
  health: Object.freeze({
    initialHp: 100,
    maxHp: 100,
    minHp: 0,
  }),
  tick: Object.freeze({
    defaultMaxTicks: 600,
    hardCapTicks: 10_000,
    defaultActionTimeoutMs: 5_000,
    maxActionTimeoutMs: 60_000,
  }),
  pickup: Object.freeze({
    defaultRespawnTicks: 50,
    healthAmount: 50,
    ammoAmount: 8,
    armorAmount: 25,
  }),
});
