import type { Position } from './state.js';

export interface AxisAlignedRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface CardinalDirection {
  readonly dx: number;
  readonly dy: number;
}

const CARDINAL_DIRECTIONS = new Map<number, CardinalDirection>([
  [0, { dx: 1, dy: 0 }],
  [90, { dx: 0, dy: 1 }],
  [180, { dx: -1, dy: 0 }],
  [270, { dx: 0, dy: -1 }],
]);

export function cardinalDirection(headingDegrees: number): CardinalDirection {
  const normalized = ((headingDegrees % 360) + 360) % 360;
  const direction = CARDINAL_DIRECTIONS.get(normalized);
  if (direction === undefined) {
    throw new RangeError(
      `headingDegrees (${headingDegrees}) must be a multiple of 90 in [0, 360).`,
    );
  }
  return direction;
}

/**
 * Returns true if `target` lies inside the 90-degree FOV cone centered on
 * the cardinal heading at `self`. The cone is closed: targets on the cone
 * boundary count as visible. The self position itself is treated as visible.
 */
export function isInFieldOfView(self: Position, headingDegrees: number, target: Position): boolean {
  const dx = target.x - self.x;
  const dy = target.y - self.y;
  if (dx === 0 && dy === 0) {
    return true;
  }
  const direction = cardinalDirection(headingDegrees);
  const dot = dx * direction.dx + dy * direction.dy;
  if (dot <= 0) {
    return false;
  }
  // Half-FOV is 45 degrees, so target is in cone iff dot >= |displacement| * cos(45) = sqrt(2)/2.
  // Squaring both sides (dot is positive): 2 * dot^2 >= dx^2 + dy^2.
  return 2 * dot * dot >= dx * dx + dy * dy;
}

/**
 * Returns true if the line segment from `from` to `to` enters the open
 * interior of the rectangle. Touching the rectangle's edge is not a crossing,
 * so endpoints sitting on the edge or grazing corner-to-corner do not count.
 */
export function segmentCrossesOpenRectangle(
  from: Position,
  to: Position,
  rect: AxisAlignedRectangle,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  let tEnter = 0;
  let tExit = 1;

  const slabs: Array<{ p: number; q: number }> = [
    { p: -dx, q: from.x - rect.x },
    { p: dx, q: rect.x + rect.width - from.x },
    { p: -dy, q: from.y - rect.y },
    { p: dy, q: rect.y + rect.height - from.y },
  ];

  for (const slab of slabs) {
    if (slab.p === 0) {
      if (slab.q <= 0) {
        return false;
      }
      continue;
    }
    const t = slab.q / slab.p;
    if (slab.p < 0) {
      if (t > tExit) {
        return false;
      }
      if (t > tEnter) {
        tEnter = t;
      }
    } else {
      if (t < tEnter) {
        return false;
      }
      if (t < tExit) {
        tExit = t;
      }
    }
  }

  return tEnter < tExit && tEnter < 1 && tExit > 0;
}

/**
 * Returns true if any wall blocks the straight line between `from` and `to`.
 * A wall blocks LOS only when the segment enters the wall's open interior;
 * grazing along a wall edge or sitting on a corner is not blocked.
 */
export function isLineOfSightClear(
  from: Position,
  to: Position,
  walls: readonly AxisAlignedRectangle[],
): boolean {
  for (const wall of walls) {
    if (segmentCrossesOpenRectangle(from, to, wall)) {
      return false;
    }
  }
  return true;
}
