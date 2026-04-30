import type { MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';

import type { Rng } from './rng.js';
import { createRng } from './rng.js';
import type { RulesetConstants } from './ruleset.js';
import { RULESET_V0_1 } from './ruleset.js';

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface PlayerState {
  contenderId: string;
  position: Position;
  headingDegrees: number;
  health: number;
  ammo: number;
  alive: boolean;
}

export type PickupType = 'health' | 'ammo' | 'armor';

export interface PickupState {
  id: string;
  type: PickupType;
  position: Position;
  respawnTicks: number | undefined;
  available: boolean;
  /** Tick at which the pickup becomes available again. Equal to current tick when available. */
  availableAtTick: number;
}

export interface ContenderStats {
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  survivalTicks: number;
  pickupsCollected: number;
}

export type EndReason = 'last-survivor' | 'mutual-elimination' | 'max-ticks-reached';

export interface MatchState {
  readonly config: MatchConfig;
  readonly map: MapDefinition;
  readonly ruleset: RulesetConstants;
  readonly rng: Rng;
  tick: number;
  players: PlayerState[];
  pickups: PickupState[];
  score: Record<string, number>;
  stats: Record<string, ContenderStats>;
  status: 'in-progress' | 'finished';
  winner: string | null;
  endReason: EndReason | null;
}

export const createInitialStats = (): ContenderStats => ({
  kills: 0,
  deaths: 0,
  damageDealt: 0,
  damageTaken: 0,
  survivalTicks: 0,
  pickupsCollected: 0,
});

const sortById = <T extends { id: string }>(values: readonly T[]): T[] =>
  [...values].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

const sortByContenderId = <T extends { contenderId: string }>(values: readonly T[]): T[] =>
  [...values].sort((left, right) =>
    left.contenderId < right.contenderId ? -1 : left.contenderId > right.contenderId ? 1 : 0,
  );

export interface CreateMatchStateOptions {
  readonly config: MatchConfig;
  readonly map: MapDefinition;
  readonly ruleset?: RulesetConstants;
}

export function createMatchState({
  config,
  map,
  ruleset = RULESET_V0_1,
}: CreateMatchStateOptions): MatchState {
  if (config.map.id !== map.id) {
    throw new Error(`Match config map id (${config.map.id}) does not match map id (${map.id}).`);
  }
  if (config.map.version !== map.version) {
    throw new Error(
      `Match config map version (${config.map.version}) does not match map version (${map.version}).`,
    );
  }

  const slotToSpawn = new Map(map.spawns.map((spawn) => [spawn.contenderSlot, spawn]));
  const players: PlayerState[] = [];

  for (const [slot, contender] of config.contenders.entries()) {
    const spawn = slotToSpawn.get(slot);
    if (spawn === undefined) {
      throw new Error(
        `Map ${map.id} does not define a spawn for contender slot ${slot} (id=${contender.id}).`,
      );
    }

    players.push({
      contenderId: contender.id,
      position: { x: spawn.position.x, y: spawn.position.y },
      headingDegrees: spawn.headingDegrees,
      health: ruleset.health.initialHp,
      ammo: ruleset.weapon.initialAmmo,
      alive: true,
    });
  }

  const pickups: PickupState[] = map.pickups.map((pickup) => ({
    id: pickup.id,
    type: pickup.type,
    position: { x: pickup.position.x, y: pickup.position.y },
    respawnTicks: pickup.respawnTicks,
    available: true,
    availableAtTick: 0,
  }));

  const score: Record<string, number> = {};
  const stats: Record<string, ContenderStats> = {};
  for (const contender of config.contenders) {
    score[contender.id] = 0;
    stats[contender.id] = createInitialStats();
  }

  return {
    config,
    map,
    ruleset,
    rng: createRng(config.seed),
    tick: 0,
    players: sortByContenderId(players),
    pickups: sortById(pickups),
    score,
    stats,
    status: 'in-progress',
    winner: null,
    endReason: null,
  };
}

export const findPlayer = (state: MatchState, contenderId: string): PlayerState | undefined =>
  state.players.find((player) => player.contenderId === contenderId);

export const livePlayers = (state: MatchState): PlayerState[] =>
  state.players.filter((player) => player.alive);
