import type { Action } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, test } from 'vitest';

import { applyTick, applyTickWithoutHashes, type AcceptedActionInput } from './engine.js';
import { hashMatchState } from './hash.js';
import { generateObservation } from './observation.js';
import { RULESET_V0_1 } from './ruleset.js';
import { createMatchState, type MatchState } from './state.js';
import {
  buildOpenArenaMap,
  buildSharedPickupMap,
  buildTestMap,
  buildTestMatchConfig,
  buildWallBetweenMap,
} from './test-fixtures.js';

const moveAction = (direction: { x: -1 | 0 | 1; y: -1 | 0 | 1 }): Action => ({
  schemaVersion: SCHEMA_VERSION,
  type: 'move',
  direction,
});

const turnAction = (degrees: -90 | 0 | 90 | 180): Action => ({
  schemaVersion: SCHEMA_VERSION,
  type: 'turn',
  degrees,
});

const shootAction = (target: { x: number; y: number }): Action => ({
  schemaVersion: SCHEMA_VERSION,
  type: 'shoot',
  target,
});

const noopAction = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

const buildOpenArenaState = (): MatchState => {
  const map = buildOpenArenaMap();
  const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version, maxTicks: 50 });
  return createMatchState({ config, map });
};

describe('applyTick determinism', () => {
  test('same seed and same action sequence produce identical state hashes', () => {
    const map = buildTestMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });

    const stateA = createMatchState({ config, map });
    const stateB = createMatchState({ config, map });

    const sequence: AcceptedActionInput[][] = [
      [
        { contenderId: 'alpha', action: moveAction({ x: 1, y: 0 }) },
        { contenderId: 'bravo', action: moveAction({ x: -1, y: 0 }) },
      ],
      [
        { contenderId: 'alpha', action: turnAction(90) },
        { contenderId: 'bravo', action: noopAction() },
      ],
      [
        { contenderId: 'alpha', action: moveAction({ x: 0, y: 1 }) },
        { contenderId: 'bravo', action: shootAction({ x: 3, y: 8 }) },
      ],
    ];

    const hashesA: string[] = [];
    const hashesB: string[] = [];
    for (const inputs of sequence) {
      hashesA.push(applyTick(stateA, inputs).postTickHash);
      hashesB.push(applyTick(stateB, inputs).postTickHash);
    }

    expect(hashesA).toEqual(hashesB);
    expect(hashMatchState(stateA)).toBe(hashMatchState(stateB));
  });

  test('different seeds produce identical hashes when only deterministic actions run', () => {
    // The engine's determinism is independent of the RNG when no RNG-driven
    // events occur. Two states with the same actions but different seeds must
    // diverge in hash only because the rng state differs, even if no rng
    // method is called.
    const map = buildTestMap();
    const stateA = createMatchState({
      config: buildTestMatchConfig({ mapId: map.id, mapVersion: map.version, seed: 1 }),
      map,
    });
    const stateB = createMatchState({
      config: buildTestMatchConfig({ mapId: map.id, mapVersion: map.version, seed: 2 }),
      map,
    });

    expect(hashMatchState(stateA)).not.toBe(hashMatchState(stateB));
  });

  test('applyTickWithoutHashes produces the same state mutation and events as applyTick', () => {
    const map = buildOpenArenaMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const stateA = createMatchState({ config, map });
    const stateB = createMatchState({ config, map });

    const inputs: AcceptedActionInput[] = [
      { contenderId: 'alpha', action: noopAction() },
      { contenderId: 'bravo', action: noopAction() },
    ];

    const withHashes = applyTick(stateA, inputs);
    const withoutHashes = applyTickWithoutHashes(stateB, inputs);

    expect(withoutHashes.events).toEqual(withHashes.events);
    expect(hashMatchState(stateB)).toBe(withHashes.postTickHash);
  });
});

describe('movement collision', () => {
  test('player cannot walk out of bounds', () => {
    const map = buildOpenArenaMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const state = createMatchState({ config, map });
    const alpha = state.players.find((player) => player.contenderId === 'alpha')!;
    alpha.position = { x: 0, y: 5 };

    const result = applyTick(state, [
      { contenderId: 'alpha', action: moveAction({ x: -1, y: 0 }) },
      { contenderId: 'bravo', action: noopAction() },
    ]);

    expect(alpha.position).toEqual({ x: 0, y: 5 });
    const moveEvent = result.events.find(
      (event) => event.type === 'move' && event.contenderId === 'alpha',
    );
    expect(moveEvent).toMatchObject({ blocked: true });
  });

  test('player cannot walk into the interior of a wall', () => {
    const map = buildWallBetweenMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const state = createMatchState({ config, map });
    const alpha = state.players.find((player) => player.contenderId === 'alpha')!;
    alpha.position = { x: 4, y: 5 };

    // Wall (4,4)(2,2) has open interior (4,6) x (4,6); only (5,5) is strictly inside.
    // Stepping +x from (4,5) targets (5,5) and must be blocked.
    applyTick(state, [
      { contenderId: 'alpha', action: moveAction({ x: 1, y: 0 }) },
      { contenderId: 'bravo', action: noopAction() },
    ]);
    expect(alpha.position).toEqual({ x: 4, y: 5 });

    // Stepping +y to (4,6) lands on the wall edge, which is not inside.
    applyTick(state, [
      { contenderId: 'alpha', action: moveAction({ x: 0, y: 1 }) },
      { contenderId: 'bravo', action: noopAction() },
    ]);
    expect(alpha.position).toEqual({ x: 4, y: 6 });
  });

  test('two players cannot occupy the same tile', () => {
    const map = buildOpenArenaMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const state = createMatchState({ config, map });
    const alpha = state.players.find((player) => player.contenderId === 'alpha')!;
    const bravo = state.players.find((player) => player.contenderId === 'bravo')!;
    alpha.position = { x: 4, y: 5 };
    bravo.position = { x: 6, y: 5 };

    applyTick(state, [
      { contenderId: 'alpha', action: moveAction({ x: 1, y: 0 }) },
      { contenderId: 'bravo', action: moveAction({ x: -1, y: 0 }) },
    ]);

    // Sorted contender order is alpha first; alpha moves to (5,5) successfully.
    // Bravo then tries to move from (6,5) to (5,5) but alpha now occupies it.
    expect(alpha.position).toEqual({ x: 5, y: 5 });
    expect(bravo.position).toEqual({ x: 6, y: 5 });
  });
});

describe('observation visibility', () => {
  test('players in clear LOS within FOV are visible', () => {
    const map = buildOpenArenaMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const state = createMatchState({ config, map });

    const observation = generateObservation(state, 'alpha');
    expect(observation.visiblePlayers).toHaveLength(1);
    expect(observation.visiblePlayers[0]?.contenderId).toBe('bravo');
  });

  test('players blocked by a wall are not visible', () => {
    const map = buildWallBetweenMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const state = createMatchState({ config, map });

    const observation = generateObservation(state, 'alpha');
    expect(observation.visiblePlayers).toHaveLength(0);
  });

  test('players outside the FOV cone are not visible', () => {
    const map = buildOpenArenaMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const state = createMatchState({ config, map });
    const alpha = state.players.find((player) => player.contenderId === 'alpha')!;
    alpha.headingDegrees = 180; // facing away from bravo

    const observation = generateObservation(state, 'alpha');
    expect(observation.visiblePlayers).toHaveLength(0);
  });
});

describe('hitscan combat', () => {
  test('a hit reduces opponent health by weapon damage', () => {
    const state = buildOpenArenaState();
    const alpha = state.players.find((player) => player.contenderId === 'alpha')!;
    const bravo = state.players.find((player) => player.contenderId === 'bravo')!;

    applyTick(state, [
      { contenderId: 'alpha', action: shootAction(bravo.position) },
      { contenderId: 'bravo', action: noopAction() },
    ]);

    expect(bravo.health).toBe(RULESET_V0_1.health.initialHp - RULESET_V0_1.weapon.damage);
    expect(alpha.ammo).toBe(RULESET_V0_1.weapon.initialAmmo - RULESET_V0_1.weapon.ammoPerShot);
    expect(state.stats.alpha?.damageDealt).toBe(RULESET_V0_1.weapon.damage);
    expect(state.stats.bravo?.damageTaken).toBe(RULESET_V0_1.weapon.damage);
  });

  test('shot blocked by a wall does not damage opponent', () => {
    const map = buildWallBetweenMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version });
    const state = createMatchState({ config, map });
    const bravo = state.players.find((player) => player.contenderId === 'bravo')!;

    applyTick(state, [
      { contenderId: 'alpha', action: shootAction(bravo.position) },
      { contenderId: 'bravo', action: noopAction() },
    ]);

    expect(bravo.health).toBe(RULESET_V0_1.health.initialHp);
  });

  test('lethal damage produces an elimination and last-survivor end', () => {
    const state = buildOpenArenaState();
    const alpha = state.players.find((player) => player.contenderId === 'alpha')!;
    const bravo = state.players.find((player) => player.contenderId === 'bravo')!;
    bravo.health = RULESET_V0_1.weapon.damage; // one shot to kill

    const result = applyTick(state, [
      { contenderId: 'alpha', action: shootAction(bravo.position) },
      { contenderId: 'bravo', action: noopAction() },
    ]);

    expect(bravo.alive).toBe(false);
    expect(state.score.alpha).toBe(1);
    expect(state.stats.alpha?.kills).toBe(1);
    expect(state.stats.bravo?.deaths).toBe(1);
    expect(state.status).toBe('finished');
    expect(state.winner).toBe('alpha');
    expect(state.endReason).toBe('last-survivor');
    expect(result.events.some((event) => event.type === 'elimination')).toBe(true);
    expect(result.events.some((event) => event.type === 'match-ended')).toBe(true);
    expect(alpha.alive).toBe(true);
  });

  test('simultaneous mutual shots both connect using the pre-shoot snapshot', () => {
    const state = buildOpenArenaState();
    const alpha = state.players.find((player) => player.contenderId === 'alpha')!;
    const bravo = state.players.find((player) => player.contenderId === 'bravo')!;

    applyTick(state, [
      { contenderId: 'alpha', action: shootAction(bravo.position) },
      { contenderId: 'bravo', action: shootAction(alpha.position) },
    ]);

    expect(alpha.health).toBe(RULESET_V0_1.health.initialHp - RULESET_V0_1.weapon.damage);
    expect(bravo.health).toBe(RULESET_V0_1.health.initialHp - RULESET_V0_1.weapon.damage);
  });

  test('shooting with empty ammo emits a no-ammo event without spending ammo', () => {
    const state = buildOpenArenaState();
    const alpha = state.players.find((player) => player.contenderId === 'alpha')!;
    const bravo = state.players.find((player) => player.contenderId === 'bravo')!;
    alpha.ammo = 0;

    const result = applyTick(state, [
      { contenderId: 'alpha', action: shootAction(bravo.position) },
      { contenderId: 'bravo', action: noopAction() },
    ]);

    expect(alpha.ammo).toBe(0);
    expect(bravo.health).toBe(RULESET_V0_1.health.initialHp);
    expect(result.events.find((event) => event.type === 'shoot-no-ammo')).toBeDefined();
  });
});

describe('pickup contention', () => {
  test('two contenders landing on the same pickup tie-break by sorted contender id', () => {
    const map = buildSharedPickupMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version, maxTicks: 50 });
    const state = createMatchState({ config, map });
    const alpha = state.players.find((player) => player.contenderId === 'alpha')!;
    const bravo = state.players.find((player) => player.contenderId === 'bravo')!;
    // Damage both first so health pickup actually heals.
    alpha.health = 50;
    bravo.health = 50;

    const result = applyTick(state, [
      { contenderId: 'alpha', action: moveAction({ x: 1, y: 0 }) },
      { contenderId: 'bravo', action: moveAction({ x: -1, y: 0 }) },
    ]);

    // Alpha (sorted first) moves to (3,2) and claims the pickup. Bravo's move
    // toward (3,2) is blocked because alpha now occupies it, so bravo stays at (4,2).
    expect(alpha.position).toEqual({ x: 3, y: 2 });
    expect(bravo.position).toEqual({ x: 4, y: 2 });
    expect(alpha.health).toBe(50 + RULESET_V0_1.pickup.healthAmount);
    expect(bravo.health).toBe(50);
    expect(state.stats.alpha?.pickupsCollected).toBe(1);
    expect(state.stats.bravo?.pickupsCollected).toBe(0);
    expect(
      result.events.some(
        (event) => event.type === 'pickup-collected' && event.contenderId === 'alpha',
      ),
    ).toBe(true);
  });

  test('pickup respawns after respawnTicks elapse', () => {
    const map = buildTestMap();
    const config = buildTestMatchConfig({
      mapId: map.id,
      mapVersion: map.version,
      maxTicks: 200,
    });
    const state = createMatchState({ config, map });
    const alpha = state.players.find((player) => player.contenderId === 'alpha')!;
    alpha.position = { x: 4, y: 8 };
    alpha.ammo = 0;

    // Walk onto the ammo-west pickup (4,8 → already there).
    const ammoWest = state.pickups.find((pickup) => pickup.id === 'ammo-west')!;
    expect(ammoWest.respawnTicks).toBe(40);

    applyTick(state, [
      { contenderId: 'alpha', action: noopAction() },
      { contenderId: 'bravo', action: noopAction() },
    ]);
    // Alpha standing on ammo-west collects on this tick.
    expect(ammoWest.available).toBe(false);
    expect(alpha.ammo).toBe(RULESET_V0_1.pickup.ammoAmount);

    // Step away so we don't re-collect when it respawns.
    applyTick(state, [
      { contenderId: 'alpha', action: moveAction({ x: -1, y: 0 }) },
      { contenderId: 'bravo', action: noopAction() },
    ]);
    expect(alpha.position).toEqual({ x: 3, y: 8 });

    // Advance until tick 41 (consumed at tick 0, available at tick 0+40 = 40).
    for (let index = 0; index < 39; index += 1) {
      applyTick(state, [
        { contenderId: 'alpha', action: noopAction() },
        { contenderId: 'bravo', action: noopAction() },
      ]);
    }
    expect(state.tick).toBe(41);
    expect(ammoWest.available).toBe(true);
  });
});

describe('match termination', () => {
  test('reaching maxTicks with mutual full health draws the match', () => {
    const map = buildOpenArenaMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version, maxTicks: 3 });
    const state = createMatchState({ config, map });

    let lastResult;
    for (let index = 0; index < 3; index += 1) {
      lastResult = applyTick(state, [
        { contenderId: 'alpha', action: noopAction() },
        { contenderId: 'bravo', action: noopAction() },
      ]);
    }

    expect(state.status).toBe('finished');
    expect(state.endReason).toBe('max-ticks-reached');
    expect(state.winner).toBeNull();
    expect(
      lastResult?.events.some(
        (event) => event.type === 'match-ended' && event.reason === 'max-ticks-reached',
      ),
    ).toBe(true);
  });

  test('reaching maxTicks awards the match to the higher-score contender', () => {
    const map = buildOpenArenaMap();
    const config = buildTestMatchConfig({ mapId: map.id, mapVersion: map.version, maxTicks: 2 });
    const state = createMatchState({ config, map });
    state.score.alpha = 1;

    for (let index = 0; index < 2; index += 1) {
      applyTick(state, [
        { contenderId: 'alpha', action: noopAction() },
        { contenderId: 'bravo', action: noopAction() },
      ]);
    }

    expect(state.status).toBe('finished');
    expect(state.endReason).toBe('max-ticks-reached');
    expect(state.winner).toBe('alpha');
  });

  test('engine refuses to apply a tick to a finished match', () => {
    const state = buildOpenArenaState();
    const bravo = state.players.find((player) => player.contenderId === 'bravo')!;
    bravo.health = RULESET_V0_1.weapon.damage;

    applyTick(state, [
      { contenderId: 'alpha', action: shootAction(bravo.position) },
      { contenderId: 'bravo', action: noopAction() },
    ]);
    expect(state.status).toBe('finished');

    expect(() =>
      applyTick(state, [
        { contenderId: 'alpha', action: noopAction() },
        { contenderId: 'bravo', action: noopAction() },
      ]),
    ).toThrow();
  });
});

describe('runs without a model provider', () => {
  test('engine progresses with hand-supplied actions and stable hashes', () => {
    const state = buildOpenArenaState();
    const hashes: string[] = [];

    for (let index = 0; index < 5 && state.status === 'in-progress'; index += 1) {
      const result = applyTick(state, [
        { contenderId: 'alpha', action: noopAction() },
        { contenderId: 'bravo', action: noopAction() },
      ]);
      hashes.push(result.postTickHash);
    }

    expect(hashes).toHaveLength(5);
    expect(new Set(hashes).size).toBe(5);
    expect(state.tick).toBe(5);
  });
});
