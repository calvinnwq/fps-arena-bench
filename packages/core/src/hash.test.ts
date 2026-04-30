import { describe, expect, test } from 'vitest';

import { hashMatchState } from './hash.js';
import { createMatchState } from './state.js';
import { buildTestMap, buildTestMatchConfig } from './test-fixtures.js';

describe('hashMatchState', () => {
  test('returns sha256:<64 hex digits>', () => {
    const map = buildTestMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const state = createMatchState({ config, map });
    const hash = hashMatchState(state);

    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('identical states produce identical hashes', () => {
    const map = buildTestMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const a = createMatchState({ config, map });
    const b = createMatchState({ config, map });

    expect(hashMatchState(a)).toBe(hashMatchState(b));
  });

  test('hash changes when player health changes', () => {
    const map = buildTestMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const state = createMatchState({ config, map });
    const before = hashMatchState(state);
    state.players[0]!.health -= 25;
    const after = hashMatchState(state);

    expect(before).not.toBe(after);
  });
});
