import { describe, expect, test } from 'vitest';

import { CENTI_DEGREES_PER_DEGREE, MILLITILES_PER_TILE } from './fixed-point.js';
import { RULESET_V0_1, RULESET_VERSION } from './ruleset.js';

describe('ruleset constants', () => {
  test('exports a stable version id for replay metadata', () => {
    expect(RULESET_VERSION).toBe('ruleset.v0.1');
    expect(RULESET_V0_1.version).toBe(RULESET_VERSION);
  });

  test('movement, turning, and FOV use integer-aligned values', () => {
    expect(RULESET_V0_1.movement.tilesPerTick).toBe(1);
    expect(RULESET_V0_1.movement.millitilesPerTick).toBe(
      RULESET_V0_1.movement.tilesPerTick * MILLITILES_PER_TILE,
    );
    expect(RULESET_V0_1.turning.allowedDegrees).toEqual([-90, 0, 90, 180]);
    expect(RULESET_V0_1.fov.degrees).toBe(90);
    expect(RULESET_V0_1.fov.centiDegrees).toBe(RULESET_V0_1.fov.degrees * CENTI_DEGREES_PER_DEGREE);
    expect(RULESET_V0_1.fov.halfDegrees).toBe(RULESET_V0_1.fov.degrees / 2);
    expect(RULESET_V0_1.fov.halfCentiDegrees).toBe(
      RULESET_V0_1.fov.halfDegrees * CENTI_DEGREES_PER_DEGREE,
    );
  });

  test('weapon range derives from MILLITILES_PER_TILE', () => {
    expect(RULESET_V0_1.weapon.rangeMillitiles).toBe(
      RULESET_V0_1.weapon.rangeTiles * MILLITILES_PER_TILE,
    );
  });

  test('weapon, health, tick, and pickup constants are positive integers', () => {
    const positiveIntegers = [
      RULESET_V0_1.weapon.rangeTiles,
      RULESET_V0_1.weapon.rangeMillitiles,
      RULESET_V0_1.weapon.damage,
      RULESET_V0_1.weapon.ammoPerShot,
      RULESET_V0_1.weapon.initialAmmo,
      RULESET_V0_1.weapon.maxAmmo,
      RULESET_V0_1.health.initialHp,
      RULESET_V0_1.health.maxHp,
      RULESET_V0_1.tick.defaultMaxTicks,
      RULESET_V0_1.tick.hardCapTicks,
      RULESET_V0_1.tick.defaultActionTimeoutMs,
      RULESET_V0_1.tick.maxActionTimeoutMs,
      RULESET_V0_1.pickup.defaultRespawnTicks,
      RULESET_V0_1.pickup.healthAmount,
      RULESET_V0_1.pickup.ammoAmount,
      RULESET_V0_1.pickup.armorAmount,
    ];

    for (const value of positiveIntegers) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  test('initial values stay within their caps', () => {
    expect(RULESET_V0_1.weapon.initialAmmo).toBeLessThanOrEqual(RULESET_V0_1.weapon.maxAmmo);
    expect(RULESET_V0_1.health.initialHp).toBeLessThanOrEqual(RULESET_V0_1.health.maxHp);
    expect(RULESET_V0_1.health.minHp).toBe(0);
    expect(RULESET_V0_1.tick.defaultMaxTicks).toBeLessThanOrEqual(RULESET_V0_1.tick.hardCapTicks);
    expect(RULESET_V0_1.tick.defaultActionTimeoutMs).toBeLessThanOrEqual(
      RULESET_V0_1.tick.maxActionTimeoutMs,
    );
  });

  test('frozen at runtime so callers cannot drift the ruleset mid-match', () => {
    expect(Object.isFrozen(RULESET_V0_1)).toBe(true);
    expect(Object.isFrozen(RULESET_V0_1.movement)).toBe(true);
    expect(Object.isFrozen(RULESET_V0_1.turning)).toBe(true);
    expect(Object.isFrozen(RULESET_V0_1.turning.allowedDegrees)).toBe(true);
    expect(Object.isFrozen(RULESET_V0_1.fov)).toBe(true);
    expect(Object.isFrozen(RULESET_V0_1.weapon)).toBe(true);
    expect(Object.isFrozen(RULESET_V0_1.health)).toBe(true);
    expect(Object.isFrozen(RULESET_V0_1.tick)).toBe(true);
    expect(Object.isFrozen(RULESET_V0_1.pickup)).toBe(true);
  });
});
