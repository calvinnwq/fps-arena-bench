import type { PickupType } from '@fps-arena-bench/core';
import type { MapDefinition } from '@fps-arena-bench/schemas';

import type { TimelineFrame } from './timeline.js';

export interface SceneViewport {
  readonly width: number;
  readonly height: number;
  readonly padding?: number;
}

export interface BoundsPrimitive {
  readonly kind: 'bounds';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WallPrimitive {
  readonly kind: 'wall';
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PickupPrimitive {
  readonly kind: 'pickup';
  readonly id: string;
  readonly pickupType: PickupType;
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly available: boolean;
}

export interface PlayerPrimitive {
  readonly kind: 'player';
  readonly contenderId: string;
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly headingDegrees: number;
  readonly headingX: number;
  readonly headingY: number;
  readonly alive: boolean;
  readonly health: number;
  readonly healthRatio: number;
}

export type ScenePrimitive =
  | BoundsPrimitive
  | WallPrimitive
  | PickupPrimitive
  | PlayerPrimitive;

export interface Scene {
  readonly viewport: { readonly width: number; readonly height: number; readonly padding: number };
  readonly scale: number;
  readonly origin: { readonly x: number; readonly y: number };
  readonly primitives: readonly ScenePrimitive[];
}

export interface BuildSceneInput {
  readonly frame: TimelineFrame;
  readonly map: MapDefinition;
  readonly viewport: SceneViewport;
}

const PLAYER_WORLD_RADIUS = 0.5;
const PICKUP_WORLD_RADIUS = 0.4;
const MAX_PLAYER_HEALTH = 100;

const requirePositiveFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number (received ${value}).`);
  }
};

const requireNonNegativeFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number (received ${value}).`);
  }
};

const degreesToUnitVector = (
  degrees: number,
): { readonly x: number; readonly y: number } => {
  const radians = (degrees * Math.PI) / 180;
  const x = Math.cos(radians);
  const y = Math.sin(radians);
  // Snap near-zero components to exactly zero to avoid floating-point fuzz at cardinal angles.
  const epsilon = 1e-12;
  return {
    x: Math.abs(x) < epsilon ? 0 : x,
    y: Math.abs(y) < epsilon ? 0 : y,
  };
};

export function buildScene(input: BuildSceneInput): Scene {
  const { frame, map, viewport } = input;
  requirePositiveFinite(viewport.width, 'viewport.width');
  requirePositiveFinite(viewport.height, 'viewport.height');
  const padding = viewport.padding ?? 0;
  requireNonNegativeFinite(padding, 'viewport.padding');

  const usableWidth = viewport.width - padding * 2;
  const usableHeight = viewport.height - padding * 2;
  if (usableWidth <= 0 || usableHeight <= 0) {
    throw new RangeError(
      `viewport.padding=${padding} leaves no room for a ${viewport.width}x${viewport.height} viewport.`,
    );
  }

  const scale = Math.min(usableWidth / map.width, usableHeight / map.height);
  const renderedWidth = map.width * scale;
  const renderedHeight = map.height * scale;
  const originX = padding + (usableWidth - renderedWidth) / 2;
  const originY = padding + (usableHeight - renderedHeight) / 2;

  const primitives: ScenePrimitive[] = [];

  primitives.push({
    kind: 'bounds',
    x: originX,
    y: originY,
    width: renderedWidth,
    height: renderedHeight,
  });

  for (const wall of map.walls) {
    primitives.push({
      kind: 'wall',
      id: wall.id,
      x: originX + wall.x * scale,
      y: originY + wall.y * scale,
      width: wall.width * scale,
      height: wall.height * scale,
    });
  }

  for (const pickup of frame.pickups) {
    primitives.push({
      kind: 'pickup',
      id: pickup.id,
      pickupType: pickup.type,
      cx: originX + pickup.x * scale,
      cy: originY + pickup.y * scale,
      radius: PICKUP_WORLD_RADIUS * scale,
      available: pickup.available,
    });
  }

  for (const player of frame.players) {
    const heading = degreesToUnitVector(player.headingDegrees);
    const healthRatio = Math.max(
      0,
      Math.min(1, player.health / MAX_PLAYER_HEALTH),
    );
    primitives.push({
      kind: 'player',
      contenderId: player.contenderId,
      cx: originX + player.x * scale,
      cy: originY + player.y * scale,
      radius: PLAYER_WORLD_RADIUS * scale,
      headingDegrees: player.headingDegrees,
      headingX: heading.x,
      headingY: heading.y,
      alive: player.alive,
      health: player.health,
      healthRatio,
    });
  }

  return {
    viewport: { width: viewport.width, height: viewport.height, padding },
    scale,
    origin: { x: originX, y: originY },
    primitives,
  };
}
