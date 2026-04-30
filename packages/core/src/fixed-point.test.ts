import { describe, expect, test } from 'vitest';

import {
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

describe('fixed-point constants', () => {
  test('expose integer scales for tiles and angles', () => {
    expect(MILLITILES_PER_TILE).toBe(1_000);
    expect(CENTI_DEGREES_PER_DEGREE).toBe(100);
    expect(CENTI_DEGREES_PER_TURN).toBe(360 * CENTI_DEGREES_PER_DEGREE);
  });
});

describe('millitile conversions', () => {
  test('tilesToMillitiles multiplies by 1000', () => {
    expect(tilesToMillitiles(0)).toBe(0);
    expect(tilesToMillitiles(1)).toBe(1_000);
    expect(tilesToMillitiles(13)).toBe(13_000);
    expect(tilesToMillitiles(-2)).toBe(-2_000);
  });

  test('tilesToMillitiles requires safe integer tiles', () => {
    expect(() => tilesToMillitiles(0.5)).toThrow(RangeError);
    expect(() => tilesToMillitiles(Number.NaN)).toThrow(RangeError);
    expect(() => tilesToMillitiles(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  test('millitilesToTiles requires exact tile-aligned millitiles', () => {
    expect(millitilesToTiles(0)).toBe(0);
    expect(millitilesToTiles(5_000)).toBe(5);
    expect(millitilesToTiles(-3_000)).toBe(-3);
    expect(() => millitilesToTiles(123)).toThrow(RangeError);
    expect(() => millitilesToTiles(1.5)).toThrow(RangeError);
  });

  test('manhattan and squared distances avoid floats', () => {
    expect(manhattanMillitiles(0, 0, 3_000, 4_000)).toBe(7_000);
    expect(manhattanMillitiles(-1_000, 2_000, 1_000, -2_000)).toBe(6_000);
    expect(squaredDistanceMillitiles(0, 0, 3_000, 4_000)).toBe(25_000_000);
    expect(squaredDistanceMillitiles(1, 1, 4, 5)).toBe(25);
  });

  test('distance helpers reject non-integer inputs', () => {
    expect(() => manhattanMillitiles(0.5, 0, 0, 0)).toThrow(RangeError);
    expect(() => squaredDistanceMillitiles(0, 0, 0, Number.NaN)).toThrow(RangeError);
  });
});

describe('roundHalfToEven', () => {
  test('rounds towards even when the fractional part is exactly half', () => {
    expect(roundHalfToEven(5, 2)).toBe(2);
    expect(roundHalfToEven(7, 2)).toBe(4);
    expect(roundHalfToEven(-5, 2)).toBe(-2);
    expect(roundHalfToEven(-7, 2)).toBe(-4);
  });

  test('rounds towards nearest when not exactly half', () => {
    expect(roundHalfToEven(3, 2)).toBe(2);
    expect(roundHalfToEven(11, 4)).toBe(3);
    expect(roundHalfToEven(13, 4)).toBe(3);
    expect(roundHalfToEven(-3, 2)).toBe(-2);
    expect(roundHalfToEven(-11, 4)).toBe(-3);
  });

  test('rejects zero divisor and non-integer arguments', () => {
    expect(() => roundHalfToEven(1, 0)).toThrow(RangeError);
    expect(() => roundHalfToEven(1.5, 2)).toThrow(RangeError);
    expect(() => roundHalfToEven(1, 2.5)).toThrow(RangeError);
  });
});

describe('centi-degree angles', () => {
  test('canonical wrap is [0, 36000)', () => {
    expect(normalizeCentiDegrees(0)).toBe(0);
    expect(normalizeCentiDegrees(35_999)).toBe(35_999);
    expect(normalizeCentiDegrees(36_000)).toBe(0);
    expect(normalizeCentiDegrees(36_001)).toBe(1);
    expect(normalizeCentiDegrees(-1)).toBe(35_999);
    expect(normalizeCentiDegrees(-36_001)).toBe(35_999);
  });

  test('degrees roundtrip through centi-degrees on integer inputs only', () => {
    expect(degreesToCentiDegrees(0)).toBe(0);
    expect(degreesToCentiDegrees(90)).toBe(9_000);
    expect(degreesToCentiDegrees(359)).toBe(35_900);
    expect(centiDegreesToDegrees(9_000)).toBe(90);
    expect(centiDegreesToDegrees(35_900)).toBe(359);
    expect(() => degreesToCentiDegrees(0.5)).toThrow(RangeError);
    expect(() => centiDegreesToDegrees(123)).toThrow(RangeError);
  });

  test('applyTurn wraps degrees and only accepts allowed deltas', () => {
    expect(applyTurn(0, 90)).toBe(90);
    expect(applyTurn(270, 90)).toBe(0);
    expect(applyTurn(90, -90)).toBe(0);
    expect(applyTurn(0, 180)).toBe(180);
    expect(applyTurn(180, 180)).toBe(0);
    expect(applyTurn(45, 0)).toBe(45);
  });

  test('applyTurn rejects unsupported deltas and out-of-range headings', () => {
    expect(() => applyTurn(0, 45 as unknown as 90)).toThrow(RangeError);
    expect(() => applyTurn(360, 0)).toThrow(RangeError);
    expect(() => applyTurn(-1, 0)).toThrow(RangeError);
    expect(() => applyTurn(0.5, 0)).toThrow(RangeError);
  });
});
