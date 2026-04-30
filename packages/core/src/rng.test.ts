import { describe, expect, test } from 'vitest';

import { createRng } from './rng.js';

describe('createRng', () => {
  test('produces the same uint32 sequence for the same seed', () => {
    const length = 16;
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length }, () => a.nextUint32());
    const seqB = Array.from({ length }, () => b.nextUint32());

    expect(seqA).toEqual(seqB);
    for (const value of seqA) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });

  test('matches a frozen golden sequence for stable replay metadata', () => {
    const rng = createRng(0xc0ffee);
    const sequence = Array.from({ length: 8 }, () => rng.nextUint32());

    expect(sequence).toMatchSnapshot();
  });

  test('different seeds produce different initial outputs', () => {
    const a = createRng(1);
    const b = createRng(2);

    expect(a.nextUint32()).not.toBe(b.nextUint32());
  });

  test('rejects non-integer, negative, or non-finite seeds', () => {
    expect(() => createRng(-1)).toThrow(RangeError);
    expect(() => createRng(1.5)).toThrow(RangeError);
    expect(() => createRng(Number.NaN)).toThrow(RangeError);
    expect(() => createRng(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  test('nextIntBelow returns integers in [0, max)', () => {
    const rng = createRng(7);
    const max = 6;
    const counts = new Array<number>(max).fill(0);

    for (let i = 0; i < 600; i += 1) {
      const value = rng.nextIntBelow(max);

      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(max);
      counts[value]! += 1;
    }

    for (const count of counts) {
      expect(count).toBeGreaterThan(0);
    }
  });

  test('nextIntBelow rejects non-positive or non-integer maxima', () => {
    const rng = createRng(0);

    expect(() => rng.nextIntBelow(0)).toThrow(RangeError);
    expect(() => rng.nextIntBelow(-1)).toThrow(RangeError);
    expect(() => rng.nextIntBelow(2.5)).toThrow(RangeError);
    expect(() => rng.nextIntBelow(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  test('nextIntInRange respects inclusive bounds and integer constraints', () => {
    const rng = createRng(13);
    const lo = -3;
    const hi = 4;

    for (let i = 0; i < 400; i += 1) {
      const value = rng.nextIntInRange(lo, hi);

      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(lo);
      expect(value).toBeLessThanOrEqual(hi);
    }
  });

  test('nextIntInRange returns the constant when bounds are equal', () => {
    const rng = createRng(99);

    expect(rng.nextIntInRange(7, 7)).toBe(7);
    expect(rng.nextIntInRange(7, 7)).toBe(7);
  });

  test('nextIntInRange rejects inverted or non-integer bounds', () => {
    const rng = createRng(0);

    expect(() => rng.nextIntInRange(5, 4)).toThrow(RangeError);
    expect(() => rng.nextIntInRange(0.5, 3)).toThrow(RangeError);
    expect(() => rng.nextIntInRange(0, 3.5)).toThrow(RangeError);
  });

  test('clone resumes the same sequence as the source', () => {
    const rng = createRng(2024);
    rng.nextUint32();
    rng.nextUint32();
    const cloned = rng.clone();

    const expected = Array.from({ length: 4 }, () => rng.nextUint32());
    const actual = Array.from({ length: 4 }, () => cloned.nextUint32());

    expect(actual).toEqual(expected);
  });
});
