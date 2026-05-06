import type { LoadReplayErrorKind } from './loader.js';
import {
  formatTickEvent,
  isKeyTickEvent,
  type ContenderPlacementSummary,
  type ReplaySummary,
} from './summary.js';
import type { ViewerSnapshot } from './viewer.js';

export const DEFAULT_SPEED_PRESETS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8];

export interface SpeedOption {
  readonly value: number;
  readonly label: string;
  readonly selected: boolean;
}

export interface ControlsScrubber {
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly disabled: boolean;
}

export interface ControlsErrorView {
  readonly kind: LoadReplayErrorKind;
  readonly message: string;
}

export interface ControlsSummaryView {
  readonly matchId: string;
  readonly mapLabel: string;
  readonly statusLabel: string;
  readonly winnerLabel: string;
  readonly durationLabel: string;
  readonly placements: readonly ContenderPlacementSummary[];
  readonly reliability: ReplaySummary['reliability'];
  readonly latency: ReplaySummary['latency'];
}

export interface EventFeedEntry {
  readonly tick: number;
  readonly text: string;
  readonly isKey: boolean;
}

export interface ControlsViewModel {
  readonly status: 'idle' | 'error' | 'ready';
  readonly statusLabel: string;
  readonly playPauseLabel: 'Play' | 'Pause';
  readonly playPauseDisabled: boolean;
  readonly stepBackDisabled: boolean;
  readonly stepForwardDisabled: boolean;
  readonly resetDisabled: boolean;
  readonly scrubber: ControlsScrubber;
  readonly tickLabel: string;
  readonly speedOptions: readonly SpeedOption[];
  readonly speedDisabled: boolean;
  readonly error: ControlsErrorView | null;
  readonly summary: ControlsSummaryView | null;
  readonly eventFeed: readonly EventFeedEntry[];
}

export interface BuildViewerControlsOptions {
  readonly speedPresets?: readonly number[];
}

const SPEED_EPSILON = 1e-9;

export function formatSpeedLabel(speed: number): string {
  const rounded = Math.round(speed * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}x`;
  const fixed = rounded.toFixed(2);
  const trimmed = fixed.replace(/\.?0+$/, '');
  return `${trimmed}x`;
}

const buildSpeedOptions = (
  currentSpeed: number,
  presets: readonly number[],
): readonly SpeedOption[] => {
  const sortedUnique = Array.from(new Set(presets))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  const matchesPreset = sortedUnique.some(
    (preset) => Math.abs(preset - currentSpeed) < SPEED_EPSILON,
  );
  const values = matchesPreset
    ? sortedUnique
    : [...sortedUnique, currentSpeed].sort((a, b) => a - b);

  return values.map((value) => ({
    value,
    label: formatSpeedLabel(value),
    selected: Math.abs(value - currentSpeed) < SPEED_EPSILON,
  }));
};

const idleViewModel = (speedOptions: readonly SpeedOption[]): ControlsViewModel => ({
  status: 'idle',
  statusLabel: 'Idle',
  playPauseLabel: 'Play',
  playPauseDisabled: true,
  stepBackDisabled: true,
  stepForwardDisabled: true,
  resetDisabled: true,
  scrubber: { min: 0, max: 0, value: 0, disabled: true },
  tickLabel: 'No replay loaded',
  speedOptions,
  speedDisabled: true,
  error: null,
  summary: null,
  eventFeed: [],
});

const buildSummaryView = (summary: ReplaySummary): ControlsSummaryView => {
  const winnerLabel = summary.winner === null ? 'No winner' : summary.winner.displayName;
  const statusLabel =
    summary.status === 'finished' ? `Finished — ${summary.endReason ?? 'unknown'}` : 'In progress';
  return {
    matchId: summary.matchId,
    mapLabel: `${summary.mapId} @ ${summary.mapVersion}`,
    statusLabel,
    winnerLabel,
    durationLabel: `${summary.durationTicks} ticks`,
    placements: summary.placements,
    reliability: summary.reliability,
    latency: summary.latency,
  };
};

const buildEventFeed = (
  snap: Extract<ViewerSnapshot, { status: 'ready' }>,
): readonly EventFeedEntry[] => {
  const displayNameByContenderId: Record<string, string> = {};
  for (const contender of snap.timeline.config.contenders) {
    displayNameByContenderId[contender.id] = contender.displayName ?? contender.id;
  }
  return snap.frame.events.map((event) => ({
    tick: snap.frame.tick,
    text: formatTickEvent(event, { displayNameByContenderId }),
    isKey: isKeyTickEvent(event),
  }));
};

export function buildViewerControlsViewModel(
  snapshot: ViewerSnapshot,
  options: BuildViewerControlsOptions = {},
): ControlsViewModel {
  const presets = options.speedPresets ?? DEFAULT_SPEED_PRESETS;

  if (snapshot.status === 'idle') {
    return idleViewModel(buildSpeedOptions(1, presets));
  }

  if (snapshot.status === 'error') {
    return {
      ...idleViewModel(buildSpeedOptions(1, presets)),
      status: 'error',
      statusLabel: 'Error',
      error: { kind: snapshot.error.kind, message: snapshot.error.message },
    };
  }

  const speedOptions = buildSpeedOptions(snapshot.speed, presets);
  const stepBackDisabled = snapshot.atStart;
  const stepForwardDisabled = snapshot.atEnd;
  const resetDisabled = snapshot.tick === 0 && !snapshot.isPlaying;

  return {
    status: 'ready',
    statusLabel: snapshot.isPlaying ? 'Playing' : 'Paused',
    playPauseLabel: snapshot.isPlaying ? 'Pause' : 'Play',
    playPauseDisabled: false,
    stepBackDisabled,
    stepForwardDisabled,
    resetDisabled,
    scrubber: {
      min: 0,
      max: snapshot.totalTicks,
      value: snapshot.tick,
      disabled: false,
    },
    tickLabel: `Tick ${snapshot.tick} / ${snapshot.totalTicks}`,
    speedOptions,
    speedDisabled: false,
    error: null,
    summary: buildSummaryView(snapshot.summary),
    eventFeed: buildEventFeed(snapshot),
  };
}
