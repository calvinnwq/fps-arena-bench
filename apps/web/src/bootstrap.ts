import {
  mountReplayViewerApp,
  type MountReplayViewerAppOptions,
  type ReplayViewerApp,
  type ReplayViewerAppHost,
} from './app.js';
import {
  createButtonControl,
  createCanvasHost,
  createFileInputControl,
  createListElement,
  createRangeControl,
  createSelectControl,
  createTextElement,
  createToggleElement,
  type ButtonLikeElement,
  type CanvasLikeElement,
  type FileInputLikeElement,
  type ListItemRenderer,
  type ListLikeElement,
  type RangeLikeElement,
  type SelectLikeElement,
  type TextLikeElement,
  type ToggleLikeElement,
} from './dom-adapters.js';
import type { EventFeedItemView, PlacementItemView } from './summary-binding.js';

export interface BootstrapListChildElement {
  textContent: string | null;
}

export type BootstrapListLikeElement = ListLikeElement<BootstrapListChildElement>;

export interface BootstrapReplayViewerElements {
  readonly canvas: CanvasLikeElement;
  readonly playPauseButton: ButtonLikeElement;
  readonly stepBackButton: ButtonLikeElement;
  readonly stepForwardButton: ButtonLikeElement;
  readonly resetButton: ButtonLikeElement;
  readonly scrubber: RangeLikeElement;
  readonly speedSelect: SelectLikeElement;
  readonly tickLabel: TextLikeElement;
  readonly controlsStatusLabel: TextLikeElement;
  readonly fileInput?: FileInputLikeElement;
  readonly summaryPanel: ToggleLikeElement;
  readonly errorPanel: ToggleLikeElement;
  readonly errorMessage: TextLikeElement;
  readonly matchIdLabel: TextLikeElement;
  readonly mapLabel: TextLikeElement;
  readonly summaryStatusLabel: TextLikeElement;
  readonly winnerLabel: TextLikeElement;
  readonly durationLabel: TextLikeElement;
  readonly reliabilityLabel: TextLikeElement;
  readonly latencyLabel: TextLikeElement;
  readonly placementsList: BootstrapListLikeElement;
  readonly eventFeedList: BootstrapListLikeElement;
}

export interface BootstrapReplayViewerOptions extends MountReplayViewerAppOptions {
  readonly placementRenderer?: ListItemRenderer<PlacementItemView, BootstrapListChildElement>;
  readonly eventFeedRenderer?: ListItemRenderer<EventFeedItemView, BootstrapListChildElement>;
}

export const formatPlacementItemText = (item: PlacementItemView): string => {
  const winnerMark = item.isWinner ? ' (winner)' : '';
  const s = item.stats;
  return `#${item.rank} ${item.displayName} [${item.adapterId}]${winnerMark} — kills ${s.kills}, deaths ${s.deaths}, damage ${s.damageDealt}/${s.damageTaken}, pickups ${s.pickupsCollected}`;
};

export const formatEventFeedItemText = (item: EventFeedItemView): string => {
  const marker = item.isKey ? '★' : '·';
  return `t${String(item.tick).padStart(3, '0')} ${marker} ${item.text}`;
};

export const defaultPlacementRenderer: ListItemRenderer<
  PlacementItemView,
  BootstrapListChildElement
> = (item, doc) => {
  const child = doc.createElement('li');
  child.textContent = formatPlacementItemText(item);
  return child;
};

export const defaultEventFeedRenderer: ListItemRenderer<
  EventFeedItemView,
  BootstrapListChildElement
> = (item, doc) => {
  const child = doc.createElement('li');
  child.textContent = formatEventFeedItemText(item);
  return child;
};

export function bootstrapReplayViewer(
  elements: BootstrapReplayViewerElements,
  options: BootstrapReplayViewerOptions = {},
): ReplayViewerApp {
  const placementRenderer = options.placementRenderer ?? defaultPlacementRenderer;
  const eventFeedRenderer = options.eventFeedRenderer ?? defaultEventFeedRenderer;

  const host: ReplayViewerAppHost = {
    canvas: createCanvasHost(elements.canvas),
    controls: {
      playPauseButton: createButtonControl(elements.playPauseButton),
      stepBackButton: createButtonControl(elements.stepBackButton),
      stepForwardButton: createButtonControl(elements.stepForwardButton),
      resetButton: createButtonControl(elements.resetButton),
      scrubber: createRangeControl(elements.scrubber),
      speedSelect: createSelectControl(elements.speedSelect),
      tickLabel: createTextElement(elements.tickLabel),
      statusLabel: createTextElement(elements.controlsStatusLabel),
    },
    summaryPanel: {
      panel: createToggleElement(elements.summaryPanel),
      errorPanel: createToggleElement(elements.errorPanel),
      errorMessage: createTextElement(elements.errorMessage),
      matchIdLabel: createTextElement(elements.matchIdLabel),
      mapLabel: createTextElement(elements.mapLabel),
      statusLabel: createTextElement(elements.summaryStatusLabel),
      winnerLabel: createTextElement(elements.winnerLabel),
      durationLabel: createTextElement(elements.durationLabel),
      reliabilityLabel: createTextElement(elements.reliabilityLabel),
      latencyLabel: createTextElement(elements.latencyLabel),
      placementsList: createListElement<PlacementItemView, BootstrapListChildElement>(
        elements.placementsList,
        placementRenderer,
      ),
      eventFeedList: createListElement<EventFeedItemView, BootstrapListChildElement>(
        elements.eventFeedList,
        eventFeedRenderer,
      ),
    },
    ...(elements.fileInput
      ? { fileInput: { fileInput: createFileInputControl(elements.fileInput) } }
      : {}),
  };

  const mountOptions: MountReplayViewerAppOptions = {
    ...(options.viewer !== undefined ? { viewer: options.viewer } : {}),
    ...(options.canvas !== undefined ? { canvas: options.canvas } : {}),
    ...(options.controls !== undefined ? { controls: options.controls } : {}),
    ...(options.fileInput !== undefined ? { fileInput: options.fileInput } : {}),
    ...(options.summaryPanel !== undefined ? { summaryPanel: options.summaryPanel } : {}),
  };

  return mountReplayViewerApp(host, mountOptions);
}
