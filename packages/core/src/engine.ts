import type { Action, MapDefinition } from '@fps-arena-bench/schemas';

import { hashMatchState } from './hash.js';
import type { MatchState, PickupState, PickupType, PlayerState, Position } from './state.js';
import { type AxisAlignedRectangle, isInFieldOfView, isLineOfSightClear } from './visibility.js';

export interface AcceptedActionInput {
  readonly contenderId: string;
  readonly action: Action;
}

export type TickEvent =
  | {
      readonly type: 'turn';
      readonly contenderId: string;
      readonly fromHeading: number;
      readonly toHeading: number;
    }
  | {
      readonly type: 'move';
      readonly contenderId: string;
      readonly from: Position;
      readonly to: Position;
      readonly blocked: boolean;
    }
  | {
      readonly type: 'shoot';
      readonly contenderId: string;
      readonly target: Position;
      readonly hitContenderId: string | null;
      readonly damage: number;
      readonly ammoSpent: number;
    }
  | {
      readonly type: 'shoot-no-ammo';
      readonly contenderId: string;
    }
  | {
      readonly type: 'noop';
      readonly contenderId: string;
    }
  | {
      readonly type: 'pickup-collected';
      readonly contenderId: string;
      readonly pickupId: string;
      readonly pickupType: PickupType;
      readonly amount: number;
    }
  | {
      readonly type: 'pickup-respawned';
      readonly pickupId: string;
    }
  | {
      readonly type: 'elimination';
      readonly contenderId: string;
      readonly killerContenderId: string | null;
    }
  | {
      readonly type: 'match-ended';
      readonly winner: string | null;
      readonly reason: NonNullable<MatchState['endReason']>;
    };

export interface TickResult {
  readonly preTickHash: string;
  readonly postTickHash: string;
  readonly events: readonly TickEvent[];
}

export interface TickEventsResult {
  readonly events: readonly TickEvent[];
}

const NORMALIZED_HEADING = (heading: number): number => ((heading % 360) + 360) % 360;

const sortByContenderId = <T extends { contenderId: string }>(values: readonly T[]): T[] =>
  [...values].sort((left, right) =>
    left.contenderId < right.contenderId ? -1 : left.contenderId > right.contenderId ? 1 : 0,
  );

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

const positionInBounds = (position: Position, map: MapDefinition): boolean =>
  position.x >= 0 && position.x <= map.width && position.y >= 0 && position.y <= map.height;

const positionInsideWall = (position: Position, wall: AxisAlignedRectangle): boolean =>
  position.x > wall.x &&
  position.x < wall.x + wall.width &&
  position.y > wall.y &&
  position.y < wall.y + wall.height;

const positionWalkable = (position: Position, map: MapDefinition): boolean => {
  if (!positionInBounds(position, map)) {
    return false;
  }
  for (const wall of map.walls) {
    if (positionInsideWall(position, wall)) {
      return false;
    }
  }
  return true;
};

const positionOccupiedByLivePlayer = (
  position: Position,
  state: MatchState,
  excludeContenderId: string,
): boolean =>
  state.players.some(
    (player) =>
      player.alive &&
      player.contenderId !== excludeContenderId &&
      samePosition(player.position, position),
  );

const applyActionsByContenderOrder = <T>(
  state: MatchState,
  actionLookup: Map<string, Action>,
  perPlayer: (player: PlayerState, action: Action | undefined) => T | undefined,
): T[] => {
  const results: T[] = [];
  for (const player of sortByContenderId(state.players)) {
    if (!player.alive) {
      continue;
    }
    const action = actionLookup.get(player.contenderId);
    const result = perPlayer(player, action);
    if (result !== undefined) {
      results.push(result);
    }
  }
  return results;
};

const applyTurns = (state: MatchState, actions: Map<string, Action>, events: TickEvent[]): void => {
  applyActionsByContenderOrder(state, actions, (player, action) => {
    if (action === undefined || action.type !== 'turn') {
      return;
    }
    const fromHeading = player.headingDegrees;
    player.headingDegrees = NORMALIZED_HEADING(fromHeading + action.degrees);
    if (player.headingDegrees !== fromHeading) {
      events.push({
        type: 'turn',
        contenderId: player.contenderId,
        fromHeading,
        toHeading: player.headingDegrees,
      });
    }
    return undefined;
  });
};

const applyMoves = (state: MatchState, actions: Map<string, Action>, events: TickEvent[]): void => {
  applyActionsByContenderOrder(state, actions, (player, action) => {
    if (action === undefined || action.type !== 'move') {
      return;
    }
    const from = player.position;
    const target: Position = {
      x: from.x + action.direction.x * state.ruleset.movement.tilesPerTick,
      y: from.y + action.direction.y * state.ruleset.movement.tilesPerTick,
    };
    const blocked =
      !positionWalkable(target, state.map) ||
      positionOccupiedByLivePlayer(target, state, player.contenderId);
    if (!blocked) {
      player.position = target;
    }
    events.push({
      type: 'move',
      contenderId: player.contenderId,
      from,
      to: blocked ? from : target,
      blocked,
    });
    return undefined;
  });
};

interface ShootSnapshotPlayer {
  readonly contenderId: string;
  readonly position: Position;
}

const resolveShootHit = (
  shooter: PlayerState,
  target: Position,
  opponents: readonly ShootSnapshotPlayer[],
  walls: readonly AxisAlignedRectangle[],
  rangeTiles: number,
): string | null => {
  const dx = target.x - shooter.position.x;
  const dy = target.y - shooter.position.y;
  if (dx === 0 && dy === 0) {
    return null;
  }
  if (!isInFieldOfView(shooter.position, shooter.headingDegrees, target)) {
    return null;
  }

  let bestHit: string | null = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  const rangeSq = rangeTiles * rangeTiles;

  for (const opponent of opponents) {
    if (opponent.contenderId === shooter.contenderId) {
      continue;
    }
    const ex = opponent.position.x - shooter.position.x;
    const ey = opponent.position.y - shooter.position.y;
    if (ex === 0 && ey === 0) {
      continue;
    }
    if (dx * ey - dy * ex !== 0) {
      continue;
    }
    if (dx * ex + dy * ey <= 0) {
      continue;
    }
    const distanceSq = ex * ex + ey * ey;
    if (distanceSq > rangeSq) {
      continue;
    }
    if (!isLineOfSightClear(shooter.position, opponent.position, walls)) {
      continue;
    }
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestHit = opponent.contenderId;
    }
  }

  return bestHit;
};

const applyShoots = (
  state: MatchState,
  actions: Map<string, Action>,
  events: TickEvent[],
  damageMap: Map<string, { damage: number; lastShooter: string | null }>,
): void => {
  const opponentsSnapshot: ShootSnapshotPlayer[] = state.players
    .filter((player) => player.alive)
    .map((player) => ({
      contenderId: player.contenderId,
      position: { x: player.position.x, y: player.position.y },
    }));

  applyActionsByContenderOrder(state, actions, (player, action) => {
    if (action === undefined || action.type !== 'shoot') {
      return;
    }
    if (player.ammo < state.ruleset.weapon.ammoPerShot) {
      events.push({ type: 'shoot-no-ammo', contenderId: player.contenderId });
      return;
    }

    player.ammo -= state.ruleset.weapon.ammoPerShot;
    const target = action.target;
    const hitContenderId = resolveShootHit(
      player,
      target,
      opponentsSnapshot,
      state.map.walls,
      state.ruleset.weapon.rangeTiles,
    );

    if (hitContenderId === null) {
      events.push({
        type: 'shoot',
        contenderId: player.contenderId,
        target,
        hitContenderId: null,
        damage: 0,
        ammoSpent: state.ruleset.weapon.ammoPerShot,
      });
      return;
    }

    const damage = state.ruleset.weapon.damage;
    const existing = damageMap.get(hitContenderId);
    damageMap.set(hitContenderId, {
      damage: (existing?.damage ?? 0) + damage,
      lastShooter: player.contenderId,
    });
    state.stats[player.contenderId]!.damageDealt += damage;
    events.push({
      type: 'shoot',
      contenderId: player.contenderId,
      target,
      hitContenderId,
      damage,
      ammoSpent: state.ruleset.weapon.ammoPerShot,
    });
    return;
  });
};

const applyDamageAndEliminations = (
  state: MatchState,
  damageMap: Map<string, { damage: number; lastShooter: string | null }>,
  events: TickEvent[],
): void => {
  for (const [victimId, payload] of damageMap) {
    const victim = state.players.find((player) => player.contenderId === victimId);
    if (victim === undefined || !victim.alive) {
      continue;
    }
    victim.health = Math.max(state.ruleset.health.minHp, victim.health - payload.damage);
    state.stats[victim.contenderId]!.damageTaken += payload.damage;
    if (victim.health <= state.ruleset.health.minHp) {
      victim.alive = false;
      victim.health = state.ruleset.health.minHp;
      state.stats[victim.contenderId]!.deaths += 1;
      if (payload.lastShooter !== null && payload.lastShooter !== victim.contenderId) {
        state.stats[payload.lastShooter]!.kills += 1;
        state.score[payload.lastShooter] = (state.score[payload.lastShooter] ?? 0) + 1;
      }
      events.push({
        type: 'elimination',
        contenderId: victim.contenderId,
        killerContenderId: payload.lastShooter ?? null,
      });
    }
  }
};

const applyNoopEvents = (
  state: MatchState,
  actions: Map<string, Action>,
  events: TickEvent[],
): void => {
  applyActionsByContenderOrder(state, actions, (player, action) => {
    if (action !== undefined && action.type === 'noop') {
      events.push({ type: 'noop', contenderId: player.contenderId });
    }
    return undefined;
  });
};

const applyPickupContents = (
  state: MatchState,
  player: PlayerState,
  pickup: PickupState,
): number => {
  switch (pickup.type) {
    case 'health': {
      const before = player.health;
      player.health = Math.min(
        state.ruleset.health.maxHp,
        player.health + state.ruleset.pickup.healthAmount,
      );
      return player.health - before;
    }
    case 'ammo': {
      const before = player.ammo;
      player.ammo = Math.min(
        state.ruleset.weapon.maxAmmo,
        player.ammo + state.ruleset.pickup.ammoAmount,
      );
      return player.ammo - before;
    }
    case 'armor': {
      const before = player.health;
      player.health = Math.min(
        state.ruleset.health.maxHp,
        player.health + state.ruleset.pickup.armorAmount,
      );
      return player.health - before;
    }
  }
};

const applyPickups = (state: MatchState, events: TickEvent[]): void => {
  for (const pickup of state.pickups) {
    if (!pickup.available) {
      continue;
    }
    const claimants = sortByContenderId(
      state.players.filter(
        (player) => player.alive && samePosition(player.position, pickup.position),
      ),
    );
    if (claimants.length === 0) {
      continue;
    }
    const winner = claimants[0]!;
    const amount = applyPickupContents(state, winner, pickup);
    pickup.available = false;
    pickup.availableAtTick =
      pickup.respawnTicks === undefined
        ? Number.POSITIVE_INFINITY
        : state.tick + pickup.respawnTicks;
    state.stats[winner.contenderId]!.pickupsCollected += 1;
    events.push({
      type: 'pickup-collected',
      contenderId: winner.contenderId,
      pickupId: pickup.id,
      pickupType: pickup.type,
      amount,
    });
  }
};

const respawnPickups = (state: MatchState, events: TickEvent[]): void => {
  for (const pickup of state.pickups) {
    if (!pickup.available && state.tick >= pickup.availableAtTick) {
      pickup.available = true;
      pickup.availableAtTick = state.tick;
      events.push({ type: 'pickup-respawned', pickupId: pickup.id });
    }
  }
};

const incrementSurvivalTicks = (state: MatchState): void => {
  for (const player of state.players) {
    if (player.alive) {
      state.stats[player.contenderId]!.survivalTicks += 1;
    }
  }
};

const evaluateEndCondition = (state: MatchState, events: TickEvent[]): void => {
  if (state.status === 'finished') {
    return;
  }

  const alive = state.players.filter((player) => player.alive);

  if (alive.length === 0) {
    state.status = 'finished';
    state.winner = null;
    state.endReason = 'mutual-elimination';
    events.push({ type: 'match-ended', winner: null, reason: 'mutual-elimination' });
    return;
  }

  if (alive.length === 1) {
    state.status = 'finished';
    state.winner = alive[0]!.contenderId;
    state.endReason = 'last-survivor';
    events.push({ type: 'match-ended', winner: state.winner, reason: 'last-survivor' });
    return;
  }

  if (state.tick >= state.config.maxTicks) {
    state.status = 'finished';
    state.endReason = 'max-ticks-reached';
    const ranked = [...alive].sort((left, right) => {
      const leftScore = state.score[left.contenderId] ?? 0;
      const rightScore = state.score[right.contenderId] ?? 0;
      if (leftScore !== rightScore) return rightScore - leftScore;
      if (left.health !== right.health) return right.health - left.health;
      return 0;
    });
    const top = ranked[0]!;
    const tied = ranked.filter(
      (player) =>
        (state.score[player.contenderId] ?? 0) === (state.score[top.contenderId] ?? 0) &&
        player.health === top.health,
    );
    state.winner = tied.length === 1 ? top.contenderId : null;
    events.push({
      type: 'match-ended',
      winner: state.winner,
      reason: 'max-ticks-reached',
    });
  }
};

const applyTickEffects = (
  state: MatchState,
  inputs: readonly AcceptedActionInput[],
): TickEventsResult => {
  if (state.status === 'finished') {
    throw new Error('Cannot apply tick to a finished match.');
  }

  const events: TickEvent[] = [];

  const actionLookup = new Map<string, Action>();
  for (const input of inputs) {
    if (actionLookup.has(input.contenderId)) {
      throw new Error(`Duplicate action for contender ${input.contenderId}.`);
    }
    actionLookup.set(input.contenderId, input.action);
  }

  applyTurns(state, actionLookup, events);
  applyMoves(state, actionLookup, events);

  const damageMap = new Map<string, { damage: number; lastShooter: string | null }>();
  applyShoots(state, actionLookup, events, damageMap);
  applyDamageAndEliminations(state, damageMap, events);

  applyPickups(state, events);
  applyNoopEvents(state, actionLookup, events);

  state.tick += 1;
  incrementSurvivalTicks(state);
  respawnPickups(state, events);
  evaluateEndCondition(state, events);

  return { events };
};

export function applyTick(state: MatchState, inputs: readonly AcceptedActionInput[]): TickResult {
  if (state.status === 'finished') {
    throw new Error('Cannot apply tick to a finished match.');
  }
  const preTickHash = hashMatchState(state);
  const { events } = applyTickEffects(state, inputs);
  const postTickHash = hashMatchState(state);
  return { preTickHash, postTickHash, events };
}

/**
 * Applies one tick to match state without computing state hashes.
 * Intended for replay/timeline reconstruction paths that need the same mutations
 * and events as `applyTick` without pre/post hash overhead.
 */
export function applyTickWithoutHashes(
  state: MatchState,
  inputs: readonly AcceptedActionInput[],
): TickEventsResult {
  return applyTickEffects(state, inputs);
}
