import { createHash } from 'node:crypto';

import type { MatchState, PickupState, PlayerState } from './state.js';

interface RngStateAccessor {
  __state?: number;
}

const playerKey = (player: PlayerState): string =>
  [
    player.contenderId,
    String(player.position.x),
    String(player.position.y),
    String(player.headingDegrees),
    String(player.health),
    String(player.ammo),
    player.alive ? '1' : '0',
  ].join('|');

const pickupKey = (pickup: PickupState): string =>
  [
    pickup.id,
    pickup.type,
    String(pickup.position.x),
    String(pickup.position.y),
    String(pickup.respawnTicks ?? -1),
    pickup.available ? '1' : '0',
    String(pickup.availableAtTick),
  ].join('|');

const scoreKey = (score: Record<string, number>): string =>
  Object.keys(score)
    .sort()
    .map((id) => `${id}=${String(score[id])}`)
    .join(',');

export function canonicalizeMatchState(state: MatchState): string {
  const players = [...state.players]
    .sort((left, right) => left.contenderId.localeCompare(right.contenderId))
    .map(playerKey)
    .join(';');

  const pickups = [...state.pickups]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(pickupKey)
    .join(';');

  const rngState = (state.rng as unknown as RngStateAccessor).__state ?? 0;

  return [
    `tick=${state.tick}`,
    `status=${state.status}`,
    `winner=${state.winner ?? ''}`,
    `endReason=${state.endReason ?? ''}`,
    `rng=${rngState}`,
    `score=${scoreKey(state.score)}`,
    `players=${players}`,
    `pickups=${pickups}`,
  ].join('\n');
}

export function hashMatchState(state: MatchState): string {
  const canonical = canonicalizeMatchState(state);
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${digest}`;
}
