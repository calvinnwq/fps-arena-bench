import { describe, expect, it } from 'vitest';

import { ACTION_PROMPT_TEMPLATE_VERSION } from '@fps-arena-bench/contracts';
import { SCHEMA_VERSION, type Observation } from '@fps-arena-bench/schemas';

import { MockAdapter, MockAdapterError, simulateMockResponse } from './mock.js';

const baseObservation: Observation = {
  schemaVersion: SCHEMA_VERSION,
  rulesetVersion: 'ruleset.v0.1',
  matchId: 'mock-test',
  tick: 0,
  self: {
    contenderId: 'alpha',
    position: { x: 4, y: 5 },
    headingDegrees: 90,
    health: 80,
    ammo: 5,
  },
  visiblePlayers: [],
  visiblePickups: [],
  visibleWalls: [],
  score: { alpha: 0, bravo: 0 },
};

const observationWithVisibleEnemy: Observation = {
  ...baseObservation,
  tick: 4,
  visiblePlayers: [
    {
      contenderId: 'bravo',
      position: { x: 8, y: 5 },
      headingDegrees: 270,
      health: 60,
    },
  ],
};

const observationWithLowAmmo: Observation = {
  ...baseObservation,
  tick: 8,
  self: { ...baseObservation.self, ammo: 0 },
  visiblePlayers: [
    {
      contenderId: 'bravo',
      position: { x: 6, y: 5 },
      headingDegrees: 270,
      health: 70,
    },
  ],
};

describe('MockAdapter', () => {
  it('exposes adapter metadata of kind "mock"', () => {
    const adapter = new MockAdapter({ seed: 1 });
    expect(adapter.metadata.kind).toBe('mock');
    expect(adapter.metadata.adapterId).toBe('mock');
    expect(adapter.metadata.supportedActionSchema).toBe(SCHEMA_VERSION);
    expect(adapter.metadata.schemaVersion).toBe(SCHEMA_VERSION);
    expect(adapter.metadata.displayName.length).toBeGreaterThan(0);
  });

  it('honors custom adapterId and displayName', () => {
    const adapter = new MockAdapter({
      seed: 1,
      adapterId: 'mock-alpha',
      displayName: 'Mock Alpha',
    });
    expect(adapter.metadata.adapterId).toBe('mock-alpha');
    expect(adapter.metadata.displayName).toBe('Mock Alpha');
  });

  it('produces valid actions for arbitrary observations', () => {
    const adapter = new MockAdapter({ seed: 7 });
    const action = adapter.decide({
      observation: baseObservation,
      contenderId: 'alpha',
      tick: 0,
    });
    expect(['move', 'turn', 'shoot', 'noop']).toContain(action.type);
    expect(action.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('is deterministic given the same seed and observation sequence', () => {
    const adapterA = new MockAdapter({ seed: 42 });
    const adapterB = new MockAdapter({ seed: 42 });
    const observations: readonly Observation[] = [
      baseObservation,
      observationWithVisibleEnemy,
      observationWithLowAmmo,
    ];
    const decisionsA = observations.map((observation, i) =>
      adapterA.decide({ observation, contenderId: 'alpha', tick: i }),
    );
    const decisionsB = observations.map((observation, i) =>
      adapterB.decide({ observation, contenderId: 'alpha', tick: i }),
    );
    expect(decisionsA).toEqual(decisionsB);
  });

  it('different seeds yield different decision sequences', () => {
    const adapterA = new MockAdapter({ seed: 1 });
    const adapterB = new MockAdapter({ seed: 2 });
    const observations: readonly Observation[] = [
      baseObservation,
      baseObservation,
      baseObservation,
      baseObservation,
    ];
    const decisionsA = observations.map((observation, i) =>
      adapterA.decide({ observation, contenderId: 'alpha', tick: i }),
    );
    const decisionsB = observations.map((observation, i) =>
      adapterB.decide({ observation, contenderId: 'alpha', tick: i }),
    );
    expect(decisionsA).not.toEqual(decisionsB);
  });

  it('shoots at a visible enemy when ammo is available', () => {
    const adapter = new MockAdapter({ seed: 1 });
    const action = adapter.decide({
      observation: observationWithVisibleEnemy,
      contenderId: 'alpha',
      tick: 4,
    });
    expect(action.type).toBe('shoot');
    if (action.type === 'shoot') {
      expect(action.target).toEqual({ x: 8, y: 5 });
    }
  });

  it('does not shoot when ammo is zero', () => {
    const adapter = new MockAdapter({ seed: 1 });
    const action = adapter.decide({
      observation: observationWithLowAmmo,
      contenderId: 'alpha',
      tick: 8,
    });
    expect(action.type).not.toBe('shoot');
  });

  it('renders the action prompt via @fps-arena-bench/contracts on each decision', () => {
    const seenPrompts: string[] = [];
    const adapter = new MockAdapter({
      seed: 1,
      onPromptRendered: (prompt) => {
        seenPrompts.push(prompt);
      },
    });
    adapter.decide({ observation: baseObservation, contenderId: 'alpha', tick: 0 });
    expect(seenPrompts).toHaveLength(1);
    expect(seenPrompts[0]).toContain(`Prompt template version: ${ACTION_PROMPT_TEMPLATE_VERSION}`);
    expect(seenPrompts[0]).toContain(`Schema version: ${SCHEMA_VERSION}`);
  });

  it('supports a scripted simulate override for testing parse-failure paths', () => {
    const adapter = new MockAdapter({
      seed: 1,
      simulate: () => 'not json at all',
    });
    expect(() =>
      adapter.decide({ observation: baseObservation, contenderId: 'alpha', tick: 0 }),
    ).toThrow(MockAdapterError);
  });

  it('throws MockAdapterError carrying a structured AdapterError when simulation is invalid', () => {
    const adapter = new MockAdapter({
      seed: 1,
      simulate: () => '{"schemaVersion":"fps-arena-bench.schema.v0.1","type":"fly"}',
    });
    try {
      adapter.decide({ observation: baseObservation, contenderId: 'alpha', tick: 0 });
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MockAdapterError);
      if (!(error instanceof MockAdapterError)) throw error;
      expect(error.adapterError.code).toBe('schema-failure');
      expect(error.adapterError.adapterId).toBe('mock');
    }
  });

  it('respects abort signal by throwing aborted MockAdapterError before producing an action', () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = new MockAdapter({ seed: 1 });
    try {
      adapter.decide({
        observation: baseObservation,
        contenderId: 'alpha',
        tick: 0,
        signal: controller.signal,
      });
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MockAdapterError);
      if (!(error instanceof MockAdapterError)) throw error;
      expect(error.adapterError.code).toBe('aborted');
    }
  });

  it('produces actions whose move directions are unit grid axes', () => {
    const adapter = new MockAdapter({ seed: 99 });
    for (let i = 0; i < 25; i += 1) {
      const action = adapter.decide({
        observation: { ...baseObservation, tick: i },
        contenderId: 'alpha',
        tick: i,
      });
      if (action.type === 'move') {
        expect([-1, 0, 1]).toContain(action.direction.x);
        expect([-1, 0, 1]).toContain(action.direction.y);
        expect(action.direction.x === 0 && action.direction.y === 0).toBe(false);
      }
    }
  });

  it('produces actions whose turn degrees are -90/0/90/180', () => {
    const adapter = new MockAdapter({ seed: 33 });
    for (let i = 0; i < 25; i += 1) {
      const action = adapter.decide({
        observation: { ...baseObservation, tick: i },
        contenderId: 'alpha',
        tick: i,
      });
      if (action.type === 'turn') {
        expect([-90, 0, 90, 180]).toContain(action.degrees);
      }
    }
  });
});

describe('simulateMockResponse', () => {
  it('returns a JSON string parseable to a valid action', () => {
    const raw = simulateMockResponse({ observation: baseObservation, seed: 1 });
    const parsed = JSON.parse(raw);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(['move', 'turn', 'shoot', 'noop']).toContain(parsed.type);
  });

  it('emits no chain-of-thought, prose, or markdown — exactly one JSON object', () => {
    const raw = simulateMockResponse({ observation: baseObservation, seed: 1 });
    expect(raw.trim().startsWith('{')).toBe(true);
    expect(raw.trim().endsWith('}')).toBe(true);
    // No leading prose lines.
    expect(
      raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .every(
          (line, _, lines) =>
            lines.length === raw.split('\n').filter((l) => l.trim().length > 0).length,
        ),
    ).toBe(true);
  });
});
