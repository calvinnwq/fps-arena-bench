const UINT32_MODULUS = 2 ** 32;

export interface Rng {
  /** Advances state and returns the next 32-bit unsigned integer. */
  nextUint32(): number;
  /** Returns a uniformly distributed integer in `[0, max)` using rejection sampling. */
  nextIntBelow(max: number): number;
  /** Returns a uniformly distributed integer in the inclusive range `[min, max]`. */
  nextIntInRange(min: number, max: number): number;
  /** Returns a copy of the RNG that resumes from the same state. */
  clone(): Rng;
}

const assertSeed = (seed: number): void => {
  if (!Number.isFinite(seed) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(
      `RNG seed must be a non-negative integer in [0, 2^32). Received ${String(seed)}.`,
    );
  }
};

const assertSafePositiveInteger = (label: string, value: number): void => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer. Received ${String(value)}.`);
  }
};

const assertSafeInteger = (label: string, value: number): void => {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`${label} must be a safe integer. Received ${String(value)}.`);
  }
};

interface MutableRng extends Rng {
  __state: number;
}

const buildRng = (initialState: number): MutableRng => {
  const rng = {
    __state: initialState >>> 0,

    nextUint32(): number {
      this.__state = (this.__state + 0x6d2b79f5) >>> 0;
      let t = this.__state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    },

    nextIntBelow(max: number): number {
      assertSafePositiveInteger('nextIntBelow max', max);

      const limit = UINT32_MODULUS - (UINT32_MODULUS % max);
      let candidate = this.nextUint32();
      while (candidate >= limit) {
        candidate = this.nextUint32();
      }

      return candidate % max;
    },

    nextIntInRange(min: number, max: number): number {
      assertSafeInteger('nextIntInRange min', min);
      assertSafeInteger('nextIntInRange max', max);

      if (max < min) {
        throw new RangeError(`nextIntInRange max (${max}) must be >= min (${min}).`);
      }

      const span = max - min + 1;
      if (span === 1) {
        return min;
      }

      return min + this.nextIntBelow(span);
    },

    clone(): Rng {
      return buildRng(this.__state);
    },
  } satisfies MutableRng;

  return rng;
};

export function createRng(seed: number): Rng {
  assertSeed(seed);
  return buildRng(seed);
}
