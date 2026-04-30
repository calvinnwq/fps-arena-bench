export const MILLITILES_PER_TILE = 1_000;
export const CENTI_DEGREES_PER_DEGREE = 100;
export const CENTI_DEGREES_PER_TURN = 360 * CENTI_DEGREES_PER_DEGREE;

const ALLOWED_TURN_DELTAS: ReadonlySet<number> = new Set([-90, 0, 90, 180]);

const assertSafeInteger = (label: string, value: number): void => {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`${label} must be a safe integer. Received ${String(value)}.`);
  }
};

const assertNonZeroInteger = (label: string, value: number): void => {
  assertSafeInteger(label, value);
  if (value === 0) {
    throw new RangeError(`${label} must be non-zero.`);
  }
};

export function tilesToMillitiles(tiles: number): number {
  assertSafeInteger('tiles', tiles);
  return tiles * MILLITILES_PER_TILE;
}

export function millitilesToTiles(millitiles: number): number {
  assertSafeInteger('millitiles', millitiles);
  if (millitiles % MILLITILES_PER_TILE !== 0) {
    throw new RangeError(
      `millitiles (${millitiles}) must be a multiple of ${MILLITILES_PER_TILE}.`,
    );
  }
  return millitiles / MILLITILES_PER_TILE;
}

export function manhattanMillitiles(ax: number, ay: number, bx: number, by: number): number {
  assertSafeInteger('ax', ax);
  assertSafeInteger('ay', ay);
  assertSafeInteger('bx', bx);
  assertSafeInteger('by', by);
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function squaredDistanceMillitiles(ax: number, ay: number, bx: number, by: number): number {
  assertSafeInteger('ax', ax);
  assertSafeInteger('ay', ay);
  assertSafeInteger('bx', bx);
  assertSafeInteger('by', by);
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function roundHalfToEven(numerator: number, denominator: number): number {
  assertSafeInteger('numerator', numerator);
  assertNonZeroInteger('denominator', denominator);

  const sign = numerator < 0 !== denominator < 0 ? -1 : 1;
  const absN = Math.abs(numerator);
  const absD = Math.abs(denominator);
  const quotient = Math.trunc(absN / absD);
  const remainder = absN - quotient * absD;
  const doubled = remainder * 2;

  let absResult = quotient;
  if (doubled > absD) {
    absResult = quotient + 1;
  } else if (doubled === absD) {
    absResult = quotient % 2 === 0 ? quotient : quotient + 1;
  }

  return sign * absResult;
}

export function normalizeCentiDegrees(centiDegrees: number): number {
  assertSafeInteger('centiDegrees', centiDegrees);
  const wrapped =
    ((centiDegrees % CENTI_DEGREES_PER_TURN) + CENTI_DEGREES_PER_TURN) % CENTI_DEGREES_PER_TURN;
  return wrapped;
}

export function degreesToCentiDegrees(degrees: number): number {
  assertSafeInteger('degrees', degrees);
  return degrees * CENTI_DEGREES_PER_DEGREE;
}

export function centiDegreesToDegrees(centiDegrees: number): number {
  assertSafeInteger('centiDegrees', centiDegrees);
  if (centiDegrees % CENTI_DEGREES_PER_DEGREE !== 0) {
    throw new RangeError(
      `centiDegrees (${centiDegrees}) must be a multiple of ${CENTI_DEGREES_PER_DEGREE}.`,
    );
  }
  return centiDegrees / CENTI_DEGREES_PER_DEGREE;
}

export type TurnDelta = -90 | 0 | 90 | 180;

export function applyTurn(currentDegrees: number, deltaDegrees: TurnDelta): number {
  assertSafeInteger('currentDegrees', currentDegrees);
  if (currentDegrees < 0 || currentDegrees > 359) {
    throw new RangeError(`currentDegrees (${currentDegrees}) must be in [0, 359].`);
  }
  if (!ALLOWED_TURN_DELTAS.has(deltaDegrees)) {
    throw new RangeError(
      `deltaDegrees (${String(deltaDegrees)}) must be one of -90, 0, 90, or 180.`,
    );
  }

  return (((currentDegrees + deltaDegrees) % 360) + 360) % 360;
}
