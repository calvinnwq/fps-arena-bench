import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, validateAction } from '@fps-arena-bench/schemas';
import type { Observation } from '@fps-arena-bench/schemas';

import { RandomBot } from './random-bot.js';

const buildObservation = (overrides: Partial<Observation> = {}): Observation => ({
  schemaVersion: SCHEMA_VERSION,
  rulesetVersion: 'ruleset.v0.1',
  matchId: 'random-bot-test',
  tick: 0,
  self: {
    contenderId: 'alpha',
    position: { x: 4, y: 4 },
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

describe('RandomBot', () => {
  it('exposes adapter metadata for the bot kind', () => {
    const bot = new RandomBot({ seed: 1 });
    expect(bot.metadata.kind).toBe('bot');
    expect(bot.metadata.adapterId).toBe('baseline-random');
    expect(bot.metadata.schemaVersion).toBe(SCHEMA_VERSION);
    expect(bot.metadata.supportedActionSchema).toBe(SCHEMA_VERSION);
  });

  it('always emits schema-valid actions', () => {
    const bot = new RandomBot({ seed: 7 });
    const observation = buildObservation();
    for (let index = 0; index < 200; index += 1) {
      const action = bot.decide({
        observation,
        contenderId: observation.self.contenderId,
        tick: index,
      });
      expect(() => validateAction(action)).not.toThrow();
    }
  });

  it('is deterministic when seeded identically', () => {
    const observation = buildObservation();
    const left = new RandomBot({ seed: 42 });
    const right = new RandomBot({ seed: 42 });
    for (let tick = 0; tick < 50; tick += 1) {
      const a = left.decide({ observation, contenderId: 'alpha', tick });
      const b = right.decide({ observation, contenderId: 'alpha', tick });
      expect(a).toEqual(b);
    }
  });

  it('targets a visible player when shooting and one is visible', () => {
    const bot = new RandomBot({ seed: 13 });
    const observation = buildObservation({
      visiblePlayers: [
        {
          contenderId: 'bravo',
          position: { x: 9, y: 4 },
          headingDegrees: 180,
          health: 80,
        },
      ],
    });
    const seenTargets = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const action = bot.decide({ observation, contenderId: 'alpha', tick: i });
      if (action.type === 'shoot') {
        seenTargets.add(`${action.target.x},${action.target.y}`);
      }
    }
    expect(seenTargets.has('9,4')).toBe(true);
    for (const target of seenTargets) {
      expect(target).toBe('9,4');
    }
  });
});
