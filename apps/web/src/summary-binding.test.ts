import {
  applyTick,
  createMatchState,
  hashMatchState,
  type AcceptedActionInput,
} from '@fps-arena-bench/core';
import { MatchRecorder } from '@fps-arena-bench/replay';
import type { Action, MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it } from 'vitest';

import {
  bindReplaySummaryPanel,
  type EventFeedItemView,
  type PanelListElement,
  type PanelTextElement,
  type PanelToggleElement,
  type PlacementItemView,
  type SummaryPanelHost,
} from './summary-binding.js';
import { ReplayViewer } from './viewer.js';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'summary-binding-arena',
  version: '0.4.0',
  width: 10,
  height: 10,
  spawns: [
    { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 5 }, headingDegrees: 0 },
    { id: 'bravo-spawn', contenderSlot: 1, position: { x: 8, y: 5 }, headingDegrees: 180 },
  ],
  walls: [],
  pickups: [],
  symmetry: { kind: 'none' },
});

const buildTestConfig = (): MatchConfig => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'summary-binding-match',
  rulesetVersion: 'ruleset.v0.1',
  map: { id: 'summary-binding-arena', version: '0.4.0', hash: VALID_HASH },
  seed: 7,
  maxTicks: 4,
  contenders: [
    { id: 'alpha', adapterId: 'mock-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'mock-bot', displayName: 'Bravo' },
  ],
  actionTimeoutMs: 1_000,
  invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
  capture: { safeReplay: true, privateDebug: false },
});

const noop = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

const buildArtifact = () => {
  const map = buildTestMap();
  const config = buildTestConfig();
  const state = createMatchState({ config, map });
  const recorder = new MatchRecorder({
    matchId: config.id,
    config,
    map,
    initialPreTickHash: hashMatchState(state),
    timeoutBudgetMs: config.actionTimeoutMs,
  });
  for (let tick = 0; tick < config.maxTicks; tick += 1) {
    const inputs: AcceptedActionInput[] = state.players
      .filter((p) => p.alive)
      .map((p) => ({ contenderId: p.contenderId, action: noop() }));
    const beforeTick = state.tick;
    const result = applyTick(state, inputs);
    recorder.recordTick({ tick: beforeTick, inputs, result });
    if (state.status === 'finished') break;
  }
  return recorder.build({ state });
};

const createText = (): PanelTextElement => ({ textContent: null });
const createToggle = (): PanelToggleElement => ({ hidden: false });

interface RecordingList<T> extends PanelListElement<T> {
  items: readonly T[];
  setOptionsCalls: number;
}

const createList = <T>(): RecordingList<T> => {
  const list: RecordingList<T> = {
    items: [],
    setOptionsCalls: 0,
    setItems(items) {
      list.items = items;
      list.setOptionsCalls += 1;
    },
  };
  return list;
};

interface FakeHost extends SummaryPanelHost {
  panel: PanelToggleElement;
  errorPanel: PanelToggleElement;
  errorMessage: PanelTextElement;
  matchIdLabel: PanelTextElement;
  mapLabel: PanelTextElement;
  statusLabel: PanelTextElement;
  winnerLabel: PanelTextElement;
  durationLabel: PanelTextElement;
  reliabilityLabel: PanelTextElement;
  latencyLabel: PanelTextElement;
  placementsList: RecordingList<PlacementItemView>;
  eventFeedList: RecordingList<EventFeedItemView>;
}

const createHost = (): FakeHost => ({
  panel: createToggle(),
  errorPanel: createToggle(),
  errorMessage: createText(),
  matchIdLabel: createText(),
  mapLabel: createText(),
  statusLabel: createText(),
  winnerLabel: createText(),
  durationLabel: createText(),
  reliabilityLabel: createText(),
  latencyLabel: createText(),
  placementsList: createList<PlacementItemView>(),
  eventFeedList: createList<EventFeedItemView>(),
});

describe('bindReplaySummaryPanel', () => {
  it('hides both panels and clears all labels for an idle viewer', () => {
    const viewer = new ReplayViewer();
    const host = createHost();

    bindReplaySummaryPanel(host, viewer);

    expect(host.panel.hidden).toBe(true);
    expect(host.errorPanel.hidden).toBe(true);
    expect(host.matchIdLabel.textContent).toBe('');
    expect(host.mapLabel.textContent).toBe('');
    expect(host.statusLabel.textContent).toBe('');
    expect(host.winnerLabel.textContent).toBe('');
    expect(host.durationLabel.textContent).toBe('');
    expect(host.reliabilityLabel.textContent).toBe('');
    expect(host.latencyLabel.textContent).toBe('');
    expect(host.placementsList.items.length).toBe(0);
    expect(host.eventFeedList.items.length).toBe(0);
  });

  it('shows the summary panel and populates match labels on a ready load', () => {
    const viewer = new ReplayViewer();
    const host = createHost();
    bindReplaySummaryPanel(host, viewer);

    viewer.loadFromValue(buildArtifact());

    expect(host.panel.hidden).toBe(false);
    expect(host.errorPanel.hidden).toBe(true);
    expect(host.matchIdLabel.textContent).toBe('summary-binding-match');
    expect(host.mapLabel.textContent).toBe('summary-binding-arena @ 0.4.0');
    expect(host.statusLabel.textContent).toMatch(/^(In progress|Finished)/);
    expect(host.durationLabel.textContent).toMatch(/\d+ ticks/);
  });

  it('renders placements ordered by ascending rank with displayName, adapterId, and isWinner', () => {
    const viewer = new ReplayViewer();
    const host = createHost();
    bindReplaySummaryPanel(host, viewer);

    viewer.loadFromValue(buildArtifact());

    expect(host.placementsList.items.length).toBe(2);
    const ranks = host.placementsList.items.map((p) => p.rank);
    expect([...ranks]).toEqual([...ranks].slice().sort((a, b) => a - b));
    for (const item of host.placementsList.items) {
      expect(['Alpha', 'Bravo']).toContain(item.displayName);
      expect(item.adapterId).toBe('mock-bot');
      expect(typeof item.isWinner).toBe('boolean');
      expect(item.stats).toBeDefined();
      expect(item.stats.kills).toBeGreaterThanOrEqual(0);
    }
  });

  it('formats reliability and latency labels with key counters', () => {
    const viewer = new ReplayViewer();
    const host = createHost();
    bindReplaySummaryPanel(host, viewer);

    viewer.loadFromValue(buildArtifact());

    expect(host.reliabilityLabel.textContent).toMatch(/timeouts/i);
    expect(host.reliabilityLabel.textContent).toMatch(/fallback/i);
    expect(host.latencyLabel.textContent).toMatch(/p50/i);
    expect(host.latencyLabel.textContent).toMatch(/p95/i);
  });

  it('renders the per-frame event feed with displayName-bearing text and tick numbers', () => {
    const viewer = new ReplayViewer();
    const host = createHost();
    bindReplaySummaryPanel(host, viewer);

    viewer.loadFromValue(buildArtifact());

    const initial = host.eventFeedList.items;
    for (const entry of initial) {
      expect(entry.tick).toBe(0);
      expect(typeof entry.text).toBe('string');
      expect(entry.text).not.toContain('alpha');
      expect(entry.text).not.toContain('bravo');
    }

    viewer.step(1);

    const afterStep = host.eventFeedList.items;
    for (const entry of afterStep) {
      expect(entry.tick).toBe(1);
    }
  });

  it('shows the error panel with the redacted message on an error snapshot and hides the summary panel', () => {
    const viewer = new ReplayViewer();
    const host = createHost();
    bindReplaySummaryPanel(host, viewer);

    viewer.loadFromString('this is not json');

    expect(host.errorPanel.hidden).toBe(false);
    expect(host.panel.hidden).toBe(true);
    expect(host.errorMessage.textContent).toBeTruthy();
    expect(typeof host.errorMessage.textContent).toBe('string');
  });

  it('flips panel visibility when transitioning from error to ready', () => {
    const viewer = new ReplayViewer();
    const host = createHost();
    bindReplaySummaryPanel(host, viewer);

    viewer.loadFromString('not json');
    expect(host.errorPanel.hidden).toBe(false);
    expect(host.panel.hidden).toBe(true);

    viewer.loadFromValue(buildArtifact());

    expect(host.errorPanel.hidden).toBe(true);
    expect(host.panel.hidden).toBe(false);
  });

  it('clears placements and event feed when unloading after a ready load', () => {
    const viewer = new ReplayViewer();
    const host = createHost();
    bindReplaySummaryPanel(host, viewer);
    viewer.loadFromValue(buildArtifact());
    expect(host.placementsList.items.length).toBeGreaterThan(0);

    viewer.unload();

    expect(host.panel.hidden).toBe(true);
    expect(host.errorPanel.hidden).toBe(true);
    expect(host.placementsList.items.length).toBe(0);
    expect(host.eventFeedList.items.length).toBe(0);
  });

  it('refresh() re-applies the current snapshot to the host elements', () => {
    const viewer = new ReplayViewer();
    const host = createHost();
    const binding = bindReplaySummaryPanel(host, viewer);
    viewer.loadFromValue(buildArtifact());

    const callsBefore = host.placementsList.setOptionsCalls;
    binding.refresh();

    expect(host.placementsList.setOptionsCalls).toBeGreaterThan(callsBefore);
  });

  it('dispose() unsubscribes so subsequent viewer changes do not mutate the panel', () => {
    const viewer = new ReplayViewer();
    const host = createHost();
    const binding = bindReplaySummaryPanel(host, viewer);
    viewer.loadFromValue(buildArtifact());

    binding.dispose();

    const tickLabelSnapshot = host.eventFeedList.items;
    viewer.step(1);

    expect(host.eventFeedList.items).toBe(tickLabelSnapshot);
  });

  it('refresh() and dispose() are idempotent and dispose stops further refresh', () => {
    const viewer = new ReplayViewer();
    const host = createHost();
    const binding = bindReplaySummaryPanel(host, viewer);
    viewer.loadFromValue(buildArtifact());

    binding.dispose();
    binding.dispose();

    const before = host.placementsList.setOptionsCalls;
    binding.refresh();
    expect(host.placementsList.setOptionsCalls).toBe(before);
  });
});
