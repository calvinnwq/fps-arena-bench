import {
  applyTick,
  createMatchState,
  type AcceptedActionInput,
  type EndReason,
  type MatchState,
  type PickupState,
  type PickupType,
  type PlayerState,
  type TickEvent,
} from '@fps-arena-bench/core';
import { parseReplaySafeArtifact } from '@fps-arena-bench/replay';
import type {
  MapDefinition,
  MatchConfig,
  ReplaySafeArtifact,
  ResultSummary,
} from '@fps-arena-bench/schemas';

export interface PlayerFrame {
  readonly contenderId: string;
  readonly x: number;
  readonly y: number;
  readonly headingDegrees: number;
  readonly health: number;
  readonly ammo: number;
  readonly alive: boolean;
}

export interface PickupFrame {
  readonly id: string;
  readonly type: PickupType;
  readonly x: number;
  readonly y: number;
  readonly available: boolean;
}

export interface TimelineFrame {
  readonly tick: number;
  readonly players: readonly PlayerFrame[];
  readonly pickups: readonly PickupFrame[];
  readonly score: Readonly<Record<string, number>>;
  readonly status: 'in-progress' | 'finished';
  readonly winner: string | null;
  readonly endReason: EndReason | null;
  readonly events: readonly TickEvent[];
}

export interface ReplayTimeline {
  readonly matchId: string;
  readonly map: MapDefinition;
  readonly config: MatchConfig;
  readonly result: ResultSummary;
  readonly frames: readonly TimelineFrame[];
}

export class ReplayTimelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayTimelineError';
  }
}

const snapshotPlayer = (player: PlayerState): PlayerFrame => ({
  contenderId: player.contenderId,
  x: player.position.x,
  y: player.position.y,
  headingDegrees: player.headingDegrees,
  health: player.health,
  ammo: player.ammo,
  alive: player.alive,
});

const snapshotPickup = (pickup: PickupState): PickupFrame => ({
  id: pickup.id,
  type: pickup.type,
  x: pickup.position.x,
  y: pickup.position.y,
  available: pickup.available,
});

const snapshotFrame = (state: MatchState, events: readonly TickEvent[]): TimelineFrame => ({
  tick: state.tick,
  players: state.players.map(snapshotPlayer),
  pickups: state.pickups.map(snapshotPickup),
  score: { ...state.score },
  status: state.status,
  winner: state.winner,
  endReason: state.endReason,
  events,
});

const groupAcceptedActionsByTick = (
  artifact: ReplaySafeArtifact,
): Map<number, AcceptedActionInput[]> => {
  const grouped = new Map<number, AcceptedActionInput[]>();
  for (const accepted of artifact.acceptedActions) {
    const bucket = grouped.get(accepted.tick) ?? [];
    bucket.push({ contenderId: accepted.contenderId, action: accepted.action });
    grouped.set(accepted.tick, bucket);
  }
  return grouped;
};

export function buildReplayTimeline(input: ReplaySafeArtifact | string): ReplayTimeline {
  const artifact = typeof input === 'string' ? parseReplaySafeArtifact(input) : input;
  let state: MatchState;
  try {
    state = createMatchState({ config: artifact.config, map: artifact.map });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ReplayTimelineError(`Replay artifact is internally inconsistent: ${message}`);
  }

  const frames: TimelineFrame[] = [snapshotFrame(state, [])];
  const grouped = groupAcceptedActionsByTick(artifact);

  for (let tick = 0; tick < artifact.result.ticksElapsed; tick += 1) {
    if (state.status === 'finished') {
      throw new ReplayTimelineError(
        `Replay artifact reports ticksElapsed=${artifact.result.ticksElapsed} but the match finished at tick=${state.tick}.`,
      );
    }
    const inputs = grouped.get(tick) ?? [];
    const result = applyTick(state, inputs);
    frames.push(snapshotFrame(state, result.events));
  }

  return {
    matchId: artifact.matchId,
    map: artifact.map,
    config: artifact.config,
    result: artifact.result,
    frames,
  };
}

export function frameAtTick(timeline: ReplayTimeline, tick: number): TimelineFrame {
  if (!Number.isInteger(tick) || tick < 0 || tick >= timeline.frames.length) {
    throw new RangeError(
      `Tick ${tick} is out of range (timeline has frames 0..${timeline.frames.length - 1}).`,
    );
  }
  return timeline.frames[tick]!;
}
