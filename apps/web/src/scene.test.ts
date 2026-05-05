import type { MapDefinition } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it } from 'vitest';

import {
  buildScene,
  type PickupPrimitive,
  type PlayerPrimitive,
  type ScenePrimitive,
  type WallPrimitive,
} from './scene.js';
import type { TimelineFrame } from './timeline.js';

const buildMap = (overrides: Partial<MapDefinition> = {}): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'scene-test-arena',
  version: '0.1.0',
  width: 20,
  height: 10,
  spawns: [
    { id: 'a', contenderSlot: 0, position: { x: 2, y: 5 }, headingDegrees: 0 },
    { id: 'b', contenderSlot: 1, position: { x: 18, y: 5 }, headingDegrees: 180 },
  ],
  walls: [{ id: 'w1', x: 9, y: 4, width: 2, height: 2 }],
  pickups: [
    { id: 'health-1', type: 'health', position: { x: 5, y: 5 }, respawnTicks: 5 },
  ],
  symmetry: { kind: 'none' },
  ...overrides,
});

const buildFrame = (overrides: Partial<TimelineFrame> = {}): TimelineFrame => ({
  tick: 0,
  players: [
    {
      contenderId: 'alpha',
      x: 2,
      y: 5,
      headingDegrees: 0,
      health: 100,
      ammo: 12,
      alive: true,
    },
    {
      contenderId: 'bravo',
      x: 18,
      y: 5,
      headingDegrees: 180,
      health: 80,
      ammo: 12,
      alive: true,
    },
  ],
  pickups: [
    { id: 'health-1', type: 'health', x: 5, y: 5, available: true },
  ],
  score: { alpha: 0, bravo: 0 },
  status: 'in-progress',
  winner: null,
  endReason: null,
  events: [],
  ...overrides,
});

const findOne = <T extends ScenePrimitive['kind']>(
  primitives: readonly ScenePrimitive[],
  kind: T,
): Extract<ScenePrimitive, { kind: T }> => {
  const match = primitives.find((p) => p.kind === kind);
  expect(match, `expected at least one primitive of kind ${kind}`).toBeDefined();
  return match as Extract<ScenePrimitive, { kind: T }>;
};

describe('buildScene', () => {
  it('throws when viewport width or height is non-positive', () => {
    const map = buildMap();
    const frame = buildFrame();
    expect(() =>
      buildScene({ frame, map, viewport: { width: 0, height: 100 } }),
    ).toThrow(RangeError);
    expect(() =>
      buildScene({ frame, map, viewport: { width: 100, height: -1 } }),
    ).toThrow(RangeError);
    expect(() =>
      buildScene({ frame, map, viewport: { width: Number.NaN, height: 100 } }),
    ).toThrow(RangeError);
  });

  it('throws when padding is negative or non-finite', () => {
    const map = buildMap();
    const frame = buildFrame();
    expect(() =>
      buildScene({ frame, map, viewport: { width: 100, height: 100, padding: -1 } }),
    ).toThrow(RangeError);
    expect(() =>
      buildScene({
        frame,
        map,
        viewport: { width: 100, height: 100, padding: Number.POSITIVE_INFINITY },
      }),
    ).toThrow(RangeError);
  });

  it('produces a bounds primitive sized to map.width x map.height in world units, scaled to fit', () => {
    const map = buildMap({ width: 20, height: 10 });
    const frame = buildFrame();
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });

    expect(scene.scale).toBe(10); // 20w * 10 = 200 px <= 200; 10h * 10 = 100 px <= 200
    expect(scene.viewport).toEqual({ width: 200, height: 200, padding: 0 });

    const bounds = findOne(scene.primitives, 'bounds');
    expect(bounds.width).toBeCloseTo(20 * 10);
    expect(bounds.height).toBeCloseTo(10 * 10);
    // map should be horizontally edge-to-edge (width matches) and vertically centered.
    expect(bounds.x).toBeCloseTo(0);
    expect(bounds.y).toBeCloseTo((200 - 100) / 2);
  });

  it('honors padding by shrinking the usable viewport', () => {
    const map = buildMap({ width: 20, height: 10 });
    const frame = buildFrame();
    const scene = buildScene({ frame, map, viewport: { width: 220, height: 220, padding: 10 } });

    // usable area becomes 200x200; same fit as the previous test
    expect(scene.scale).toBe(10);
    const bounds = findOne(scene.primitives, 'bounds');
    expect(bounds.x).toBeCloseTo(10);
    expect(bounds.y).toBeCloseTo(10 + (200 - 100) / 2);
  });

  it('emits a wall primitive per map wall, in world-aligned screen coordinates', () => {
    const map = buildMap();
    const frame = buildFrame();
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });

    const walls = scene.primitives.filter(
      (p): p is WallPrimitive => p.kind === 'wall',
    );
    expect(walls).toHaveLength(map.walls.length);
    const wall = walls[0]!;
    expect(wall.id).toBe('w1');
    // Wall at world (9,4) size 2x2 => screen (9*10 + originX, 4*10 + originY), 20x20
    const bounds = findOne(scene.primitives, 'bounds');
    expect(wall.x).toBeCloseTo(bounds.x + 9 * 10);
    expect(wall.y).toBeCloseTo(bounds.y + 4 * 10);
    expect(wall.width).toBeCloseTo(2 * 10);
    expect(wall.height).toBeCloseTo(2 * 10);
  });

  it('emits a pickup primitive per frame pickup with availability flag', () => {
    const map = buildMap();
    const frame = buildFrame({
      pickups: [
        { id: 'health-1', type: 'health', x: 5, y: 5, available: false },
        { id: 'ammo-1', type: 'ammo', x: 7, y: 3, available: true },
      ],
    });
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });

    const pickups = scene.primitives.filter(
      (p): p is PickupPrimitive => p.kind === 'pickup',
    );
    expect(pickups).toHaveLength(2);
    const health = pickups.find((p) => p.id === 'health-1')!;
    expect(health.pickupType).toBe('health');
    expect(health.available).toBe(false);
    expect(health.radius).toBeGreaterThan(0);
    const bounds = findOne(scene.primitives, 'bounds');
    expect(health.cx).toBeCloseTo(bounds.x + 5 * 10);
    expect(health.cy).toBeCloseTo(bounds.y + 5 * 10);
  });

  it('emits a player primitive per frame player with alive flag and health ratio', () => {
    const map = buildMap();
    const frame = buildFrame({
      players: [
        {
          contenderId: 'alpha',
          x: 4,
          y: 6,
          headingDegrees: 0,
          health: 50,
          ammo: 4,
          alive: true,
        },
        {
          contenderId: 'bravo',
          x: 18,
          y: 5,
          headingDegrees: 180,
          health: 0,
          ammo: 0,
          alive: false,
        },
      ],
    });
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });

    const players = scene.primitives.filter(
      (p): p is PlayerPrimitive => p.kind === 'player',
    );
    expect(players).toHaveLength(2);
    const alpha = players.find((p) => p.contenderId === 'alpha')!;
    const bravo = players.find((p) => p.contenderId === 'bravo')!;

    const bounds = findOne(scene.primitives, 'bounds');
    expect(alpha.cx).toBeCloseTo(bounds.x + 4 * 10);
    expect(alpha.cy).toBeCloseTo(bounds.y + 6 * 10);
    expect(alpha.alive).toBe(true);
    expect(alpha.health).toBe(50);
    expect(alpha.healthRatio).toBeCloseTo(0.5);

    expect(bravo.alive).toBe(false);
    expect(bravo.health).toBe(0);
    expect(bravo.healthRatio).toBeCloseTo(0);
  });

  it('encodes player heading as a unit vector with heading 0 = +x and heading 90 = +y', () => {
    const map = buildMap();
    const frame = buildFrame({
      players: [
        {
          contenderId: 'east',
          x: 5,
          y: 5,
          headingDegrees: 0,
          health: 100,
          ammo: 12,
          alive: true,
        },
        {
          contenderId: 'south',
          x: 5,
          y: 5,
          headingDegrees: 90,
          health: 100,
          ammo: 12,
          alive: true,
        },
        {
          contenderId: 'west',
          x: 5,
          y: 5,
          headingDegrees: 180,
          health: 100,
          ammo: 12,
          alive: true,
        },
        {
          contenderId: 'north',
          x: 5,
          y: 5,
          headingDegrees: 270,
          health: 100,
          ammo: 12,
          alive: true,
        },
      ],
    });
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });
    const players = scene.primitives.filter(
      (p): p is PlayerPrimitive => p.kind === 'player',
    );
    const east = players.find((p) => p.contenderId === 'east')!;
    const south = players.find((p) => p.contenderId === 'south')!;
    const west = players.find((p) => p.contenderId === 'west')!;
    const north = players.find((p) => p.contenderId === 'north')!;

    expect(east.headingX).toBeCloseTo(1);
    expect(east.headingY).toBeCloseTo(0);
    expect(south.headingX).toBeCloseTo(0);
    expect(south.headingY).toBeCloseTo(1);
    expect(west.headingX).toBeCloseTo(-1);
    expect(west.headingY).toBeCloseTo(0);
    expect(north.headingX).toBeCloseTo(0);
    expect(north.headingY).toBeCloseTo(-1);
  });

  it('orders primitives so bounds and walls render below pickups and players', () => {
    const map = buildMap();
    const frame = buildFrame();
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });

    const indexOfKind = (kind: ScenePrimitive['kind']): number =>
      scene.primitives.findIndex((p) => p.kind === kind);

    expect(indexOfKind('bounds')).toBeGreaterThanOrEqual(0);
    expect(indexOfKind('bounds')).toBeLessThan(indexOfKind('wall'));
    expect(indexOfKind('wall')).toBeLessThan(indexOfKind('pickup'));
    expect(indexOfKind('pickup')).toBeLessThan(indexOfKind('player'));
  });

  it('preserves aspect ratio: a tall viewport leaves horizontal letterboxing', () => {
    const map = buildMap({ width: 10, height: 10 });
    const frame = buildFrame();
    const scene = buildScene({ frame, map, viewport: { width: 100, height: 200, padding: 0 } });

    expect(scene.scale).toBe(10); // limited by min(100/10, 200/10) = 10
    const bounds = findOne(scene.primitives, 'bounds');
    expect(bounds.width).toBeCloseTo(100);
    expect(bounds.height).toBeCloseTo(100);
    expect(bounds.x).toBeCloseTo(0);
    expect(bounds.y).toBeCloseTo(50);
  });
});
