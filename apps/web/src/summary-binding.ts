import {
  buildViewerControlsViewModel,
  type ControlsErrorView,
  type ControlsSummaryView,
  type ControlsViewModel,
  type EventFeedEntry,
} from './controls.js';
import type { ContenderPlacementSummary, ContenderStats } from './summary.js';
import type { ReplayViewer, ViewerSnapshot } from './viewer.js';

export interface PanelTextElement {
  textContent: string | null;
}

export interface PanelToggleElement {
  hidden: boolean;
}

export interface PlacementItemView {
  readonly rank: number;
  readonly contenderId: string;
  readonly displayName: string;
  readonly adapterId: string;
  readonly isWinner: boolean;
  readonly stats: ContenderStats;
}

export interface EventFeedItemView {
  readonly tick: number;
  readonly text: string;
  readonly isKey: boolean;
}

export interface PanelListElement<T> {
  setItems(items: readonly T[]): void;
}

export interface SummaryPanelHost {
  readonly panel: PanelToggleElement;
  readonly errorPanel: PanelToggleElement;
  readonly errorMessage: PanelTextElement;
  readonly matchIdLabel: PanelTextElement;
  readonly mapLabel: PanelTextElement;
  readonly statusLabel: PanelTextElement;
  readonly winnerLabel: PanelTextElement;
  readonly durationLabel: PanelTextElement;
  readonly reliabilityLabel: PanelTextElement;
  readonly latencyLabel: PanelTextElement;
  readonly placementsList: PanelListElement<PlacementItemView>;
  readonly eventFeedList: PanelListElement<EventFeedItemView>;
}

export interface BindReplaySummaryPanelOptions {
  readonly speedPresets?: readonly number[];
}

export interface SummaryPanelBinding {
  refresh(): void;
  dispose(): void;
}

const formatReliabilityLabel = (reliability: ControlsSummaryView['reliability']): string =>
  `timeouts ${reliability.timeouts} · fallback ${reliability.fallbackActions} · invalid-json ${reliability.invalidJson} · schema ${reliability.schemaFailures} · repairs ${reliability.repairSuccesses}/${reliability.repairAttempts}`;

const formatLatencyMs = (ms: number): string => {
  const rounded = Math.round(ms * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
};

const formatLatencyLabel = (latency: ControlsSummaryView['latency']): string =>
  `avg ${formatLatencyMs(latency.averageMs)}ms · p50 ${formatLatencyMs(latency.p50Ms)}ms · p95 ${formatLatencyMs(latency.p95Ms)}ms · budget ${formatLatencyMs(latency.timeoutBudgetMs)}ms`;

const placementToView = (placement: ContenderPlacementSummary): PlacementItemView => ({
  rank: placement.rank,
  contenderId: placement.contenderId,
  displayName: placement.displayName,
  adapterId: placement.adapterId,
  isWinner: placement.isWinner,
  stats: placement.stats,
});

const eventEntryToView = (entry: EventFeedEntry): EventFeedItemView => ({
  tick: entry.tick,
  text: entry.text,
  isKey: entry.isKey,
});

const clearAll = (host: SummaryPanelHost): void => {
  host.panel.hidden = true;
  host.errorPanel.hidden = true;
  host.errorMessage.textContent = '';
  host.matchIdLabel.textContent = '';
  host.mapLabel.textContent = '';
  host.statusLabel.textContent = '';
  host.winnerLabel.textContent = '';
  host.durationLabel.textContent = '';
  host.reliabilityLabel.textContent = '';
  host.latencyLabel.textContent = '';
  host.placementsList.setItems([]);
  host.eventFeedList.setItems([]);
};

const applyError = (host: SummaryPanelHost, error: ControlsErrorView): void => {
  host.panel.hidden = true;
  host.errorPanel.hidden = false;
  host.errorMessage.textContent = error.message;
  host.matchIdLabel.textContent = '';
  host.mapLabel.textContent = '';
  host.statusLabel.textContent = '';
  host.winnerLabel.textContent = '';
  host.durationLabel.textContent = '';
  host.reliabilityLabel.textContent = '';
  host.latencyLabel.textContent = '';
  host.placementsList.setItems([]);
  host.eventFeedList.setItems([]);
};

const applyReady = (host: SummaryPanelHost, vm: ControlsViewModel): void => {
  const summary = vm.summary;
  if (summary === null) {
    clearAll(host);
    return;
  }
  host.panel.hidden = false;
  host.errorPanel.hidden = true;
  host.errorMessage.textContent = '';
  host.matchIdLabel.textContent = summary.matchId;
  host.mapLabel.textContent = summary.mapLabel;
  host.statusLabel.textContent = summary.statusLabel;
  host.winnerLabel.textContent = summary.winnerLabel;
  host.durationLabel.textContent = summary.durationLabel;
  host.reliabilityLabel.textContent = formatReliabilityLabel(summary.reliability);
  host.latencyLabel.textContent = formatLatencyLabel(summary.latency);
  host.placementsList.setItems(summary.placements.map(placementToView));
  host.eventFeedList.setItems(vm.eventFeed.map(eventEntryToView));
};

export function bindReplaySummaryPanel(
  host: SummaryPanelHost,
  viewer: ReplayViewer,
  options: BindReplaySummaryPanelOptions = {},
): SummaryPanelBinding {
  const buildOptions = options.speedPresets ? { speedPresets: options.speedPresets } : {};

  const renderForSnapshot = (snapshot: ViewerSnapshot): void => {
    const vm = buildViewerControlsViewModel(snapshot, buildOptions);
    if (vm.status === 'idle') {
      clearAll(host);
      return;
    }
    if (vm.status === 'error' && vm.error !== null) {
      applyError(host, vm.error);
      return;
    }
    applyReady(host, vm);
  };

  const unsubscribe = viewer.subscribe(renderForSnapshot);
  renderForSnapshot(viewer.getSnapshot());

  let disposed = false;

  return {
    refresh: () => {
      if (disposed) return;
      renderForSnapshot(viewer.getSnapshot());
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
    },
  };
}
