import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, validateAction } from '@fps-arena-bench/schemas';
import type { Observation } from '@fps-arena-bench/schemas';

import { PickupSeekerBot } from './pickup-seeker-bot.js';

const buildObservation = (overrides: Partial<Observation> = {}): Observation => ({
  schemaVersion: SCHEMA_VERSION,
  rulesetVersion: 'ruleset.v0.1',
  matchId: 'pickup-seeker-test',
  tick: 0,
  self: {
    contenderId: 'alpha',
    position: { x: 4, y: 4 },
    headingDegrees: 0,
    health: 100,
    ammo: 10,
  },
  visiblePlayers: [],
  visiblePickups: [],
  visibleWalls: [],
  score: { alpha: 0, bravo: 0 },
  ...overrides,
});

describe('PickupSeekerBot', () => {
  it('moves toward the closest visible pickup', () => {
    const bot = new PickupSeekerBot({ seed: 1 });
    const observation = buildObservation({
      visiblePickups: [
        { id: 'far-ammo', type: 'ammo', position: { x: 12, y: 4 } },
        { id: 'near-health', type: 'health', position: { x: 6, y: 4 } },
      ],
    });
    const action = bot.decide({ observation, contenderId: 'alpha', tick: 0 });
    expect(action.type).toBe('move');
    if (action.type === 'move') {
      expect(action.direction).toEqual({ x: 1, y: 0 });
    }
  });

  it('prioritizes health pickups when low health', () => {
    const bot = new PickupSeekerBot({ seed: 2 });
    const observation = buildObservation({
      self: {
        contenderId: 'alpha',
        position: { x: 4, y: 4 },
        headingDegrees: 0,
        health: 30,
        ammo: 10,
      },
      visiblePickups: [
        { id: 'closer-ammo', type: 'ammo', position: { x: 5, y: 4 } },
        { id: 'far-health', type: 'health', position: { x: 9, y: 4 } },
      ],
    });
    const action = bot.decide({ observation, contenderId: 'alpha', tick: 0 });
    expect(action.type).toBe('move');
    if (action.type === 'move') {
      expect(action.direction).toEqual({ x: 1, y: 0 });
    }
  });

  it('prioritizes ammo pickups when low ammo', () => {
    const bot = new PickupSeekerBot({ seed: 3 });
    const observation = buildObservation({
      self: {
        contenderId: 'alpha',
        position: { x: 4, y: 4 },
        headingDegrees: 0,
        health: 100,
        ammo: 1,
      },
      visiblePickups: [
        { id: 'far-ammo', type: 'ammo', position: { x: 9, y: 4 } },
        { id: 'closer-health', type: 'health', position: { x: 5, y: 4 } },
      ],
    });
    const action = bot.decide({ observation, contenderId: 'alpha', tick: 0 });
    expect(action.type).toBe('move');
  });

  it('shoots at visible enemies when no pickups are visible', () => {
    const bot = new PickupSeekerBot({ seed: 4 });
    const observation = buildObservation({
      visiblePlayers: [
        {
          contenderId: 'bravo',
          position: { x: 8, y: 4 },
          headingDegrees: 180,
          health: 50,
        },
      ],
    });
    const action = bot.decide({ observation, contenderId: 'alpha', tick: 0 });
    expect(action.type).toBe('shoot');
    if (action.type === 'shoot') {
      expect(action.target).toEqual({ x: 8, y: 4 });
    }
  });

  it('always emits schema-valid actions across many ticks', () => {
    const bot = new PickupSeekerBot({ seed: 5 });
    const observation = buildObservation();
    for (let i = 0; i < 200; i += 1) {
      const action = bot.decide({ observation, contenderId: 'alpha', tick: i });
      expect(() => validateAction(action)).not.toThrow();
    }
  });
});
