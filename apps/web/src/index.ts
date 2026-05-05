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
export { bindReplayCanvas } from './canvas-binding.js';
export type {
  BindReplayCanvasOptions,
  CanvasBinding,
  CanvasBindingHost,
} from './canvas-binding.js';
export { bindReplayControls } from './controls-binding.js';
export type {
  BindReplayControlsOptions,
  ControlButtonElement,
  ControlRangeElement,
  ControlSelectElement,
  ControlTextElement,
  ControlsBinding,
  ControlsBindingHost,
} from './controls-binding.js';
export { bindReplayFileInput } from './file-input-binding.js';
export type {
  BindReplayFileInputOptions,
  FileInputBinding,
  FileInputBindingHost,
  FileInputError,
  FileInputErrorKind,
  LoadFileResult,
  ReplayFile,
  ReplayFileInputElement,
} from './file-input-binding.js';
export { bindReplaySummaryPanel } from './summary-binding.js';
export type {
  BindReplaySummaryPanelOptions,
  EventFeedItemView,
  PanelListElement,
  PanelTextElement,
  PanelToggleElement,
  PlacementItemView,
  SummaryPanelBinding,
  SummaryPanelHost,
} from './summary-binding.js';
export {
  createButtonControl,
  createCanvasHost,
  createFileInputControl,
  createListElement,
  createRangeControl,
  createSelectControl,
  createTextElement,
  createToggleElement,
} from './dom-adapters.js';
export { mountReplayViewerApp } from './app.js';
export type { MountReplayViewerAppOptions, ReplayViewerApp, ReplayViewerAppHost } from './app.js';
export {
  bootstrapReplayViewer,
  defaultEventFeedRenderer,
  defaultPlacementRenderer,
  formatEventFeedItemText,
  formatPlacementItemText,
} from './bootstrap.js';
export type {
  BootstrapListChildElement,
  BootstrapListLikeElement,
  BootstrapReplayViewerElements,
  BootstrapReplayViewerOptions,
} from './bootstrap.js';
export { REPLAY_VIEWER_ELEMENT_IDS, bootReplayViewerFromDocument } from './main.js';
export type { DocumentLike } from './main.js';
export type {
  ButtonLikeElement,
  CanvasLikeElement,
  FileInputLikeElement,
  ListItemRenderer,
  ListLikeElement,
  OptionLikeElement,
  RangeLikeElement,
  SelectLikeElement,
  TextLikeElement,
  ToggleLikeElement,
} from './dom-adapters.js';
