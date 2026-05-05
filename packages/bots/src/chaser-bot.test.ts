import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, validateAction } from '@fps-arena-bench/schemas';
import type { Observation } from '@fps-arena-bench/schemas';

import { ChaserBot } from './chaser-bot.js';

const buildObservation = (overrides: Partial<Observation> = {}): Observation => ({
  schemaVersion: SCHEMA_VERSION,
  rulesetVersion: 'ruleset.v0.1',
  matchId: 'chaser-bot-test',
  tick: 0,
  self: {
    contenderId: 'alpha',
    position: { x: 2, y: 2 },
    headingDegrees: 0,
    health: 100,
    ammo: 12,
  },
  visiblePlayers: [],
  visiblePickups: [],
  visibleWalls: [],
  score: { alpha: 0, bravo: 0 },
  ...overrides,
});

describe('ChaserBot', () => {
  it('shoots at the closest visible opponent when ammo is available', () => {
    const bot = new ChaserBot({ seed: 1 });
    const observation = buildObservation({
      visiblePlayers: [
        {
          contenderId: 'charlie',
          position: { x: 5, y: 2 },
          headingDegrees: 180,
          health: 90,
        },
        {
          contenderId: 'bravo',
          position: { x: 4, y: 2 },
          headingDegrees: 180,
          health: 50,
        },
      ],
    });
    const action = bot.decide({ observation, contenderId: 'alpha', tick: 0 });
    expect(action).toEqual({
      schemaVersion: SCHEMA_VERSION,
      type: 'shoot',
      target: { x: 4, y: 2 },
    });
  });

  it('breaks distance ties by lexicographically smaller contenderId', () => {
    const bot = new ChaserBot({ seed: 2 });
    const observation = buildObservation({
      visiblePlayers: [
        {
          contenderId: 'echo',
          position: { x: 4, y: 2 },
          headingDegrees: 180,
          health: 90,
        },
        {
          contenderId: 'bravo',
          position: { x: 0, y: 2 },
          headingDegrees: 0,
          health: 90,
        },
      ],
    });
    const action = bot.decide({ observation, contenderId: 'alpha', tick: 0 });
    expect(action.type).toBe('shoot');
    if (action.type === 'shoot') {
      expect(action.target).toEqual({ x: 0, y: 2 });
    }
  });

  it('falls back to moving toward the enemy when ammo is exhausted', () => {
    const bot = new ChaserBot({ seed: 3 });
    const observation = buildObservation({
      self: {
        contenderId: 'alpha',
        position: { x: 2, y: 2 },
        headingDegrees: 0,
        health: 100,
        ammo: 0,
      },
      visiblePlayers: [
        {
          contenderId: 'bravo',
          position: { x: 5, y: 2 },
          headingDegrees: 180,
          health: 50,
        },
      ],
    });
    const action = bot.decide({ observation, contenderId: 'alpha', tick: 0 });
    expect(action.type).toBe('move');
    if (action.type === 'move') {
      expect(action.direction).toEqual({ x: 1, y: 0 });
    }
  });

  it('turns to face the enemy before moving when not aligned with cardinal heading', () => {
    const bot = new ChaserBot({ seed: 4 });
    const observation = buildObservation({
      self: {
        contenderId: 'alpha',
        position: { x: 2, y: 2 },
        headingDegrees: 0,
        health: 100,
        ammo: 0,
      },
      visiblePlayers: [
        {
          contenderId: 'bravo',
          position: { x: 2, y: 6 },
          headingDegrees: 180,
          health: 50,
        },
      ],
    });
    const action = bot.decide({ observation, contenderId: 'alpha', tick: 0 });
    expect(action.type).toBe('turn');
    if (action.type === 'turn') {
      expect(action.degrees).toBe(90);
    }
  });

  it('remembers the last seen enemy and pursues toward that position', () => {
    const bot = new ChaserBot({ seed: 5 });
    const sighting = buildObservation({
      visiblePlayers: [
        {
          contenderId: 'bravo',
          position: { x: 5, y: 2 },
          headingDegrees: 180,
          health: 50,
        },
      ],
    });
    bot.decide({ observation: sighting, contenderId: 'alpha', tick: 0 });

    const lostSight = buildObservation({ visiblePlayers: [] });
    const action = bot.decide({ observation: lostSight, contenderId: 'alpha', tick: 1 });
    expect(action.type).toBe('move');
    if (action.type === 'move') {
      expect(action.direction).toEqual({ x: 1, y: 0 });
    }
  });

  it('always emits schema-valid actions across many ticks', () => {
    const bot = new ChaserBot({ seed: 6 });
    const observation = buildObservation();
    for (let i = 0; i < 200; i += 1) {
      const action = bot.decide({ observation, contenderId: 'alpha', tick: i });
      expect(() => validateAction(action)).not.toThrow();
    }
  });
});
