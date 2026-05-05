import { describe, expect, it } from 'vitest';

import { MockAdapter } from '@fps-arena-bench/adapters';
import { ChaserBot, PickupSeekerBot, RandomBot } from '@fps-arena-bench/bots';

import { BUILTIN_ADAPTER_IDS, createBuiltinRegistry } from './registry.js';

describe('createBuiltinRegistry', () => {
  it('exposes baseline bot ids and the deterministic mock adapter', () => {
    expect(BUILTIN_ADAPTER_IDS).toEqual(
      expect.arrayContaining([
        'baseline-random',
        'random-bot',
        'baseline-chaser',
        'chaser-bot',
        'baseline-pickup-seeker',
        'pickup-seeker-bot',
        'mock',
        'mock-adapter',
      ]),
    );
  });

  it('builds a RandomBot for baseline-random / random-bot', () => {
    const registry = createBuiltinRegistry();
    const provider = registry.build({
      contenderId: 'alpha',
      adapterId: 'random-bot',
      displayName: 'Alpha',
      seed: 7,
    });
    expect(provider).toBeInstanceOf(RandomBot);
    expect(provider.metadata.adapterId).toBe('random-bot');
    expect(provider.metadata.kind).toBe('bot');
  });

  it('builds a ChaserBot for chaser-bot', () => {
    const registry = createBuiltinRegistry();
    const provider = registry.build({
      contenderId: 'alpha',
      adapterId: 'chaser-bot',
      displayName: undefined,
      seed: 7,
    });
    expect(provider).toBeInstanceOf(ChaserBot);
  });

  it('builds a PickupSeekerBot for pickup-seeker-bot', () => {
    const registry = createBuiltinRegistry();
    const provider = registry.build({
      contenderId: 'alpha',
      adapterId: 'pickup-seeker-bot',
      displayName: undefined,
      seed: 7,
    });
    expect(provider).toBeInstanceOf(PickupSeekerBot);
  });

  it('builds a MockAdapter for adapterId "mock"', () => {
    const registry = createBuiltinRegistry();
    const provider = registry.build({
      contenderId: 'alpha',
      adapterId: 'mock',
      displayName: 'Mock Alpha',
      seed: 11,
    });
    expect(provider).toBeInstanceOf(MockAdapter);
    expect(provider.metadata.adapterId).toBe('mock');
    expect(provider.metadata.kind).toBe('mock');
    expect(provider.metadata.displayName).toBe('Mock Alpha');
  });

  it('builds a MockAdapter for the mock-adapter alias', () => {
    const registry = createBuiltinRegistry();
    const provider = registry.build({
      contenderId: 'alpha',
      adapterId: 'mock-adapter',
      displayName: undefined,
      seed: 11,
    });
    expect(provider).toBeInstanceOf(MockAdapter);
    expect(provider.metadata.adapterId).toBe('mock-adapter');
  });

  it('throws when an unknown adapterId is requested', () => {
    const registry = createBuiltinRegistry();
    expect(() =>
      registry.build({
        contenderId: 'alpha',
        adapterId: 'definitely-missing',
        displayName: undefined,
        seed: 7,
      }),
    ).toThrowError(/definitely-missing/);
  });

  it('honors override factories that take precedence over built-ins', () => {
    let calls = 0;
    const registry = createBuiltinRegistry({
      mock: (request) => {
        calls += 1;
        return new RandomBot({ seed: request.seed, adapterId: request.adapterId });
      },
    });
    const provider = registry.build({
      contenderId: 'alpha',
      adapterId: 'mock',
      displayName: undefined,
      seed: 7,
    });
    expect(calls).toBe(1);
    expect(provider).toBeInstanceOf(RandomBot);
  });
});
