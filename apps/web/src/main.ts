import {
  bootstrapReplayViewer,
  type BootstrapReplayViewerElements,
  type BootstrapReplayViewerOptions,
} from './bootstrap.js';
import type {
  ButtonLikeElement,
  CanvasLikeElement,
  FileInputLikeElement,
  ListLikeElement,
  RangeLikeElement,
  SelectLikeElement,
  TextLikeElement,
  ToggleLikeElement,
} from './dom-adapters.js';
import type { BootstrapListChildElement } from './bootstrap.js';
import type { ReplayViewerApp } from './app.js';

export const REPLAY_VIEWER_ELEMENT_IDS = {
  canvas: 'replay-canvas',
  playPauseButton: 'replay-play-pause',
  stepBackButton: 'replay-step-back',
  stepForwardButton: 'replay-step-forward',
  resetButton: 'replay-reset',
  scrubber: 'replay-scrubber',
  speedSelect: 'replay-speed',
  tickLabel: 'replay-tick',
  controlsStatusLabel: 'replay-controls-status',
  fileInput: 'replay-file-input',
  summaryPanel: 'replay-summary-panel',
  errorPanel: 'replay-error-panel',
  errorMessage: 'replay-error-message',
  matchIdLabel: 'replay-match-id',
  mapLabel: 'replay-map',
  summaryStatusLabel: 'replay-summary-status',
  winnerLabel: 'replay-winner',
  durationLabel: 'replay-duration',
  reliabilityLabel: 'replay-reliability',
  latencyLabel: 'replay-latency',
  placementsList: 'replay-placements',
  eventFeedList: 'replay-event-feed',
} as const;

export interface DocumentLike {
  getElementById(id: string): unknown;
}

const REQUIRED_KEYS = [
  'canvas',
  'playPauseButton',
  'stepBackButton',
  'stepForwardButton',
  'resetButton',
  'scrubber',
  'speedSelect',
  'tickLabel',
  'controlsStatusLabel',
  'summaryPanel',
  'errorPanel',
  'errorMessage',
  'matchIdLabel',
  'mapLabel',
  'summaryStatusLabel',
  'winnerLabel',
  'durationLabel',
  'reliabilityLabel',
  'latencyLabel',
  'placementsList',
  'eventFeedList',
] as const satisfies ReadonlyArray<keyof typeof REPLAY_VIEWER_ELEMENT_IDS>;

export function bootReplayViewerFromDocument(
  doc: DocumentLike,
  options: BootstrapReplayViewerOptions = {},
): ReplayViewerApp {
  const lookup = (key: keyof typeof REPLAY_VIEWER_ELEMENT_IDS): unknown =>
    doc.getElementById(REPLAY_VIEWER_ELEMENT_IDS[key]);

  const missing: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (lookup(key) === null || lookup(key) === undefined) {
      missing.push(REPLAY_VIEWER_ELEMENT_IDS[key]);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `bootReplayViewerFromDocument: missing required element id(s): ${missing.join(', ')}`,
    );
  }

  const fileInputElement = lookup('fileInput') as FileInputLikeElement | null | undefined;

  const elements: BootstrapReplayViewerElements = {
    canvas: lookup('canvas') as CanvasLikeElement,
    playPauseButton: lookup('playPauseButton') as ButtonLikeElement,
    stepBackButton: lookup('stepBackButton') as ButtonLikeElement,
    stepForwardButton: lookup('stepForwardButton') as ButtonLikeElement,
    resetButton: lookup('resetButton') as ButtonLikeElement,
    scrubber: lookup('scrubber') as RangeLikeElement,
    speedSelect: lookup('speedSelect') as SelectLikeElement,
    tickLabel: lookup('tickLabel') as TextLikeElement,
    controlsStatusLabel: lookup('controlsStatusLabel') as TextLikeElement,
    summaryPanel: lookup('summaryPanel') as ToggleLikeElement,
    errorPanel: lookup('errorPanel') as ToggleLikeElement,
    errorMessage: lookup('errorMessage') as TextLikeElement,
    matchIdLabel: lookup('matchIdLabel') as TextLikeElement,
    mapLabel: lookup('mapLabel') as TextLikeElement,
    summaryStatusLabel: lookup('summaryStatusLabel') as TextLikeElement,
    winnerLabel: lookup('winnerLabel') as TextLikeElement,
    durationLabel: lookup('durationLabel') as TextLikeElement,
    reliabilityLabel: lookup('reliabilityLabel') as TextLikeElement,
    latencyLabel: lookup('latencyLabel') as TextLikeElement,
    placementsList: lookup('placementsList') as ListLikeElement<BootstrapListChildElement>,
    eventFeedList: lookup('eventFeedList') as ListLikeElement<BootstrapListChildElement>,
    ...(fileInputElement ? { fileInput: fileInputElement } : {}),
  };

  return bootstrapReplayViewer(elements, options);
}
