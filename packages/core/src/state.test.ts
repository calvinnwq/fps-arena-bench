import { describe, expect, test } from 'vitest';

import { createMatchState } from './state.js';
import { buildTestMap, buildTestMatchConfig } from './test-fixtures.js';

describe('createMatchState', () => {
  test('rejects non-cardinal spawn headings', () => {
    const map = buildTestMap();
    map.spawns[0] = { ...map.spawns[0]!, headingDegrees: 45 };
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });

    expect(() => createMatchState({ config, map })).toThrow(
      'headingDegrees (45) must be a multiple of 90 in [0, 360).',
    );
  });
});
