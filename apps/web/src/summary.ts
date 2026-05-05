import type { EndReason, TickEvent } from '@fps-arena-bench/core';
import type { ResultSummary } from '@fps-arena-bench/schemas';

import type { ReplayTimeline } from './timeline.js';

export interface ContenderStats {
  readonly kills: number;
  readonly deaths: number;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly survivalTicks: number;
  readonly pickupsCollected: number;
}

export interface ContenderPlacementSummary {
  readonly rank: number;
  readonly contenderId: string;
  readonly displayName: string;
  readonly adapterId: string;
  readonly isWinner: boolean;
  readonly stats: ContenderStats;
}

export interface ReplaySummaryWinner {
  readonly contenderId: string;
  readonly displayName: string;
}

export interface ReplaySummary {
  readonly matchId: string;
  readonly mapId: string;
  readonly mapVersion: string;
  readonly status: 'in-progress' | 'finished';
  readonly endReason: EndReason | null;
  readonly durationTicks: number;
  readonly winner: ReplaySummaryWinner | null;
  readonly placements: readonly ContenderPlacementSummary[];
  readonly contenderOrder: readonly string[];
  readonly reliability: ResultSummary['reliability'];
  readonly latency: ResultSummary['latency'];
}

export interface FormatTickEventOptions {
  readonly displayNameByContenderId?: Readonly<Record<string, string>>;
}

const ZERO_STATS: ContenderStats = {
  kills: 0,
  deaths: 0,
  damageDealt: 0,
  damageTaken: 0,
  survivalTicks: 0,
  pickupsCollected: 0,
};

export function buildReplaySummary(timeline: ReplayTimeline): ReplaySummary {
  const { config, map, result, frames } = timeline;
  const finalFrame = frames[frames.length - 1]!;
  const contenderById = new Map(config.contenders.map((c) => [c.id, c]));
  const displayName = (contenderId: string): string =>
    contenderById.get(contenderId)?.displayName ?? contenderId;

  const placements: ContenderPlacementSummary[] = result.placements
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => {
      const contender = contenderById.get(entry.contenderId);
      const stats = result.stats[entry.contenderId] ?? ZERO_STATS;
      return {
        rank: entry.rank,
        contenderId: entry.contenderId,
        displayName: contender?.displayName ?? entry.contenderId,
        adapterId: contender?.adapterId ?? '',
        isWinner: result.winner === entry.contenderId,
        stats,
      };
    });

  const winner: ReplaySummaryWinner | null =
    result.winner === null
      ? null
      : { contenderId: result.winner, displayName: displayName(result.winner) };

  return {
    matchId: timeline.matchId,
    mapId: map.id,
    mapVersion: map.version,
    status: finalFrame.status,
    endReason: finalFrame.endReason,
    durationTicks: result.ticksElapsed,
    winner,
    placements,
    contenderOrder: config.contenders.map((c) => c.id),
    reliability: result.reliability,
    latency: result.latency,
  };
}

export function isKeyTickEvent(event: TickEvent): boolean {
  switch (event.type) {
    case 'shoot':
    case 'shoot-no-ammo':
    case 'pickup-collected':
    case 'pickup-respawned':
    case 'elimination':
    case 'match-ended':
      return true;
    default:
      return false;
  }
}

export function formatTickEvent(
  event: TickEvent,
  options: FormatTickEventOptions = {},
): string {
  const lookup = options.displayNameByContenderId;
  const name = (contenderId: string): string => lookup?.[contenderId] ?? contenderId;

  switch (event.type) {
    case 'turn':
      return `${name(event.contenderId)} turned ${event.fromHeading}° → ${event.toHeading}°`;
    case 'move':
      return event.blocked
        ? `${name(event.contenderId)} was blocked`
        : `${name(event.contenderId)} moved`;
    case 'shoot':
      if (event.hitContenderId !== null) {
        return `${name(event.contenderId)} hit ${name(event.hitContenderId)} for ${event.damage} damage`;
      }
      return `${name(event.contenderId)} shot and missed`;
    case 'shoot-no-ammo':
      return `${name(event.contenderId)} tried to shoot (no ammo)`;
    case 'noop':
      return `${name(event.contenderId)} idle`;
    case 'pickup-collected':
      return `${name(event.contenderId)} picked up ${event.pickupType} (+${event.amount})`;
    case 'pickup-respawned':
      return `Pickup ${event.pickupId} respawned`;
    case 'elimination':
      if (event.killerContenderId !== null) {
        return `${name(event.killerContenderId)} eliminated ${name(event.contenderId)}`;
      }
      return `${name(event.contenderId)} was eliminated`;
    case 'match-ended':
      if (event.winner !== null) {
        return `Match ended (${event.reason}): ${name(event.winner)} won`;
      }
      return `Match ended (${event.reason}): no winner`;
  }
}
