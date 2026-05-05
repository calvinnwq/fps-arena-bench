import { describe, expect, test } from 'vitest';

import {
  cardinalDirection,
  isInFieldOfView,
  isLineOfSightClear,
  segmentCrossesOpenRectangle,
} from './visibility.js';

describe('cardinalDirection', () => {
  test('returns unit vectors for cardinal headings', () => {
    expect(cardinalDirection(0)).toEqual({ dx: 1, dy: 0 });
    expect(cardinalDirection(90)).toEqual({ dx: 0, dy: 1 });
    expect(cardinalDirection(180)).toEqual({ dx: -1, dy: 0 });
    expect(cardinalDirection(270)).toEqual({ dx: 0, dy: -1 });
  });

  test('rejects non-cardinal headings', () => {
    expect(() => cardinalDirection(45)).toThrow(RangeError);
  });
});

describe('isInFieldOfView', () => {
  const self = { x: 4, y: 4 };

  test('targets directly along the heading axis are in cone', () => {
    expect(isInFieldOfView(self, 0, { x: 10, y: 4 })).toBe(true);
    expect(isInFieldOfView(self, 90, { x: 4, y: 10 })).toBe(true);
  });

  test('targets behind the heading are out of cone', () => {
    expect(isInFieldOfView(self, 0, { x: 0, y: 4 })).toBe(false);
    expect(isInFieldOfView(self, 90, { x: 4, y: 0 })).toBe(false);
  });

  test('targets at exactly 45 degrees from heading are inside the closed cone', () => {
    // heading 0, target at +x +x (45 above east) — diagonal direction (1,1)
    expect(isInFieldOfView(self, 0, { x: 6, y: 6 })).toBe(true);
  });

  test('targets just beyond 45 degrees are out of cone', () => {
    // heading 0, target (1,2) → angle ≈ 63°
    expect(isInFieldOfView(self, 0, { x: 5, y: 6 })).toBe(false);
  });

  test('self position is treated as visible', () => {
    expect(isInFieldOfView(self, 0, self)).toBe(true);
  });
});

describe('segmentCrossesOpenRectangle', () => {
  const wall = { x: 5, y: 5, width: 2, height: 2 };

  test('segment passing through the interior is detected', () => {
    expect(segmentCrossesOpenRectangle({ x: 4, y: 6 }, { x: 8, y: 6 }, wall)).toBe(true);
  });

  test('segment grazing along the wall edge is not a crossing', () => {
    // Along x = 5 (left edge)
    expect(segmentCrossesOpenRectangle({ x: 5, y: 4 }, { x: 5, y: 8 }, wall)).toBe(false);
  });

  test('segment that ends on the wall corner is not a crossing', () => {
    expect(segmentCrossesOpenRectangle({ x: 4, y: 4 }, { x: 5, y: 5 }, wall)).toBe(false);
  });

  test('segment entirely outside the wall is not a crossing', () => {
    expect(segmentCrossesOpenRectangle({ x: 0, y: 0 }, { x: 4, y: 4 }, wall)).toBe(false);
  });
});

describe('isLineOfSightClear', () => {
  const walls = [{ x: 5, y: 5, width: 2, height: 2 }];

  test('clear with no walls in path', () => {
    expect(isLineOfSightClear({ x: 0, y: 0 }, { x: 0, y: 10 }, walls)).toBe(true);
  });

  test('blocked when path crosses a wall interior', () => {
    expect(isLineOfSightClear({ x: 4, y: 6 }, { x: 8, y: 6 }, walls)).toBe(false);
  });
});
