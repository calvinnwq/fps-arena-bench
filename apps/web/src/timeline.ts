import {
  applyTickWithoutHashes,
  canonicalizeMatchState,
  createMatchState,
  type AcceptedActionInput,
  type EndReason,
  type MatchState,
  type PickupState,
  type PickupType,
  type PlayerState,
  type TickEvent,
} from '@fps-arena-bench/core';
import {
  buildResultSummary,
  parseReplaySafeArtifact,
  type FinalStateSnapshot,
} from '@fps-arena-bench/replay';
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

const compareJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotateRight = (value: number, bits: number): number =>
  (value >>> bits) | (value << (32 - bits));

const sha256Hex = (input: string): string => {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const zeroPadding = (64 - ((bytes.length + 1 + 8) % 64)) % 64;
  const padded = new Uint8Array(bytes.length + 1 + zeroPadding + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const words = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight(words[index - 15]!, 7) ^
        rotateRight(words[index - 15]!, 18) ^
        (words[index - 15]! >>> 3);
      const s1 =
        rotateRight(words[index - 2]!, 17) ^
        rotateRight(words[index - 2]!, 19) ^
        (words[index - 2]! >>> 10);
      words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[index]! + words[index]!) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((value) => value.toString(16).padStart(8, '0'))
    .join('');
};

const hashMatchStateForViewer = (state: MatchState): string =>
  `sha256:${sha256Hex(canonicalizeMatchState(state))}`;

const finalStateSnapshot = (state: MatchState): FinalStateSnapshot => ({
  tick: state.tick,
  winner: state.winner,
  score: { ...state.score },
  stats: Object.fromEntries(
    Object.entries(state.stats).map(([id, entry]) => [id, { ...entry }]),
  ) as FinalStateSnapshot['stats'],
  aliveByContenderId: Object.fromEntries(
    state.players.map((player) => [player.contenderId, player.alive]),
  ),
});

const expectedResultFromState = (
  artifact: ReplaySafeArtifact,
  state: MatchState,
): ResultSummary => ({
  ...buildResultSummary({
    matchId: artifact.matchId,
    config: artifact.config,
    state: finalStateSnapshot(state),
    latenciesMs: [],
    reliability: artifact.result.reliability,
    timeoutBudgetMs: artifact.result.latency.timeoutBudgetMs,
  }),
  latency: artifact.result.latency,
});

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
  const expectedHashes = new Map(artifact.stateHashes.map((entry) => [entry.tick, entry.hash]));
  const initialHash = expectedHashes.get(0);
  if (
    initialHash !== undefined &&
    initialHash !== '' &&
    initialHash !== hashMatchStateForViewer(state)
  ) {
    throw new ReplayTimelineError(
      'Replay artifact initial state hash does not match reconstructed state.',
    );
  }
  for (const tick of grouped.keys()) {
    if (tick >= artifact.result.ticksElapsed) {
      throw new ReplayTimelineError(
        `Replay artifact includes accepted actions for unplayed tick=${tick}.`,
      );
    }
  }

  for (let tick = 0; tick < artifact.result.ticksElapsed; tick += 1) {
    if (state.status === 'finished') {
      throw new ReplayTimelineError(
        `Replay artifact reports ticksElapsed=${artifact.result.ticksElapsed} but the match finished at tick=${state.tick}.`,
      );
    }
    const inputs = grouped.get(tick) ?? [];
    const result = applyTickWithoutHashes(state, inputs);
    frames.push(snapshotFrame(state, result.events));
    const expectedHash = expectedHashes.get(state.tick);
    if (expectedHash !== undefined && expectedHash !== hashMatchStateForViewer(state)) {
      throw new ReplayTimelineError(
        `Replay artifact state hash for tick=${state.tick} does not match reconstructed state.`,
      );
    }
  }

  if (state.status !== 'finished') {
    throw new ReplayTimelineError(
      'Replay artifact result ends before the reconstructed match finished.',
    );
  }
  if (!compareJson(artifact.result, expectedResultFromState(artifact, state))) {
    throw new ReplayTimelineError(
      'Replay artifact result does not match reconstructed final state.',
    );
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
