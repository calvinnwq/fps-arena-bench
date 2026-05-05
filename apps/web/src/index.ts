export const WEB_APP_VERSION = '0.0.0';

export { ReplayTimelineError, buildReplayTimeline, frameAtTick } from './timeline.js';
export type { PickupFrame, PlayerFrame, ReplayTimeline, TimelineFrame } from './timeline.js';
export {
  DEFAULT_PLAYER_SPEED,
  PLAYER_MAX_SPEED,
  PLAYER_MIN_SPEED,
  ReplayPlayer,
} from './player.js';
export type { ReplayPlayerListener, ReplayPlayerOptions, ReplayPlayerSnapshot } from './player.js';
export { buildScene } from './scene.js';
export type {
  BoundsPrimitive,
  BuildSceneInput,
  PickupPrimitive,
  PlayerPrimitive,
  Scene,
  ScenePrimitive,
  SceneViewport,
  WallPrimitive,
} from './scene.js';
export { DEFAULT_RENDERER_THEME, renderScene } from './renderer.js';
export type { Drawing2DContext, RendererTheme, RenderSceneOptions } from './renderer.js';
export { buildReplaySummary, formatTickEvent, isKeyTickEvent } from './summary.js';
export type {
  ContenderPlacementSummary,
  ContenderStats,
  FormatTickEventOptions,
  ReplaySummary,
  ReplaySummaryWinner,
} from './summary.js';
export { MAX_REPLAY_INPUT_BYTES, loadReplayFromString, loadReplayFromValue } from './loader.js';
export type { LoadReplayError, LoadReplayErrorKind, LoadReplayResult } from './loader.js';
export { ReplayViewer } from './viewer.js';
export type { ViewerListener, ViewerSnapshot } from './viewer.js';
export {
  DEFAULT_SPEED_PRESETS,
  buildViewerControlsViewModel,
  formatSpeedLabel,
} from './controls.js';
export type {
  BuildViewerControlsOptions,
  ControlsErrorView,
  ControlsScrubber,
  ControlsSummaryView,
  ControlsViewModel,
  EventFeedEntry,
  SpeedOption,
} from './controls.js';
