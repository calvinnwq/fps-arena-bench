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

import { mountReplayViewerApp, type ReplayViewerAppHost } from './app.js';
import type { CanvasBindingHost } from './canvas-binding.js';
import type {
  ControlButtonElement,
  ControlRangeElement,
  ControlSelectElement,
  ControlTextElement,
  ControlsBindingHost,
} from './controls-binding.js';
import type {
  FileInputBindingHost,
  ReplayFile,
  ReplayFileInputElement,
} from './file-input-binding.js';
import type { Drawing2DContext } from './renderer.js';
import type { SpeedOption } from './controls.js';
import type {
  EventFeedItemView,
  PanelListElement,
  PanelTextElement,
  PanelToggleElement,
  PlacementItemView,
  SummaryPanelHost,
} from './summary-binding.js';
import { ReplayViewer } from './viewer.js';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'app-arena',
  version: '0.1.0',
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
  id: 'app-match',
  rulesetVersion: 'ruleset.v0.1',
  map: { id: 'app-arena', version: '0.1.0', hash: VALID_HASH },
  seed: 1,
  maxTicks: 3,
  contenders: [
    { id: 'alpha', adapterId: 'mock-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'mock-bot', displayName: 'Bravo' },
  ],
  actionTimeoutMs: 1_000,
  invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
  capture: { safeReplay: true, privateDebug: false },
});

const noopAction = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

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
      .map((p) => ({ contenderId: p.contenderId, action: noopAction() }));
    const beforeTick = state.tick;
    const result = applyTick(state, inputs);
    recorder.recordTick({ tick: beforeTick, inputs, result });
    if (state.status === 'finished') break;
  }
  return recorder.build({ state });
};

interface CallRecord {
  readonly op: string;
  readonly args: readonly (number | string)[];
}

interface RecordingContext extends Drawing2DContext {
  readonly calls: CallRecord[];
}

const createRecordingContext = (): RecordingContext => {
  const calls: CallRecord[] = [];
  let fill = '';
  let stroke = '';
  let lineWidth = 1;
  const ctx: Drawing2DContext = {
    get fillStyle(): string {
      return fill;
    },
    set fillStyle(v: string) {
      fill = v;
      calls.push({ op: 'set:fillStyle', args: [v] });
    },
    get strokeStyle(): string {
      return stroke;
    },
    set strokeStyle(v: string) {
      stroke = v;
      calls.push({ op: 'set:strokeStyle', args: [v] });
    },
    get lineWidth(): number {
      return lineWidth;
    },
    set lineWidth(v: number) {
      lineWidth = v;
      calls.push({ op: 'set:lineWidth', args: [v] });
    },
    clearRect(x, y, w, h) {
      calls.push({ op: 'clearRect', args: [x, y, w, h] });
    },
    fillRect(x, y, w, h) {
      calls.push({ op: 'fillRect', args: [x, y, w, h] });
    },
    strokeRect(x, y, w, h) {
      calls.push({ op: 'strokeRect', args: [x, y, w, h] });
    },
    beginPath() {
      calls.push({ op: 'beginPath', args: [] });
    },
    arc(x, y, r, a, b) {
      calls.push({ op: 'arc', args: [x, y, r, a, b] });
    },
    fill() {
      calls.push({ op: 'fill', args: [] });
    },
    stroke() {
      calls.push({ op: 'stroke', args: [] });
    },
    moveTo(x, y) {
      calls.push({ op: 'moveTo', args: [x, y] });
    },
    lineTo(x, y) {
      calls.push({ op: 'lineTo', args: [x, y] });
    },
  };
  return Object.assign(ctx as RecordingContext, { calls });
};

interface FakeCanvas extends CanvasBindingHost {
  readonly ctx: RecordingContext;
  width: number;
  height: number;
}

const createFakeCanvas = (width = 120, height = 120): FakeCanvas => {
  const ctx = createRecordingContext();
  const fake: FakeCanvas = {
    width,
    height,
    ctx,
    getContext(type: '2d') {
      if (type !== '2d') return null;
      return ctx;
    },
  };
  return fake;
};

interface RecordingButton extends ControlButtonElement {
  readonly listeners: Array<() => void>;
  click(): void;
}

const createButton = (): RecordingButton => {
  const listeners: Array<() => void> = [];
  const button: RecordingButton = {
    textContent: null,
    disabled: false,
    addEventListener(type, listener) {
      if (type === 'click') listeners.push(listener);
    },
    removeEventListener(type, listener) {
      if (type !== 'click') return;
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    },
    click() {
      for (const listener of [...listeners]) listener();
    },
    listeners,
  };
  return button;
};

interface RecordingRange extends ControlRangeElement {
  readonly listeners: Array<() => void>;
  fireInput(): void;
}

const createRange = (): RecordingRange => {
  const listeners: Array<() => void> = [];
  const range: RecordingRange = {
    min: '0',
    max: '0',
    value: '0',
    disabled: false,
    addEventListener(type, listener) {
      if (type === 'input') listeners.push(listener);
    },
    removeEventListener(type, listener) {
      if (type !== 'input') return;
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    },
    fireInput() {
      for (const listener of [...listeners]) listener();
    },
    listeners,
  };
  return range;
};

interface RecordingSelect extends ControlSelectElement {
  options: readonly SpeedOption[];
  readonly listeners: Array<() => void>;
}

const createSelect = (): RecordingSelect => {
  const listeners: Array<() => void> = [];
  const select: RecordingSelect = {
    value: '1',
    disabled: false,
    options: [],
    setOptions(options) {
      select.options = options;
    },
    addEventListener(type, listener) {
      if (type === 'change') listeners.push(listener);
    },
    removeEventListener(type, listener) {
      if (type !== 'change') return;
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    },
    listeners,
  };
  return select;
};

const createText = (): ControlTextElement => ({ textContent: null });
const createPanelText = (): PanelTextElement => ({ textContent: null });
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

interface FakeFileInput extends ReplayFileInputElement {
  fireChange(): void;
  setFiles(files: readonly ReplayFile[]): void;
  readonly listeners: Array<() => void>;
}

const createFakeFileInput = (): FakeFileInput => {
  const listeners: Array<() => void> = [];
  let pending: readonly ReplayFile[] = [];
  const input: FakeFileInput = {
    getFiles: () => pending,
    addEventListener(type, listener) {
      if (type === 'change') listeners.push(listener);
    },
    removeEventListener(type, listener) {
      if (type !== 'change') return;
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    },
    fireChange() {
      for (const listener of [...listeners]) listener();
    },
    setFiles(files) {
      pending = files;
    },
    listeners,
  };
  return input;
};

interface FakeControls extends ControlsBindingHost {
  playPauseButton: RecordingButton;
  stepBackButton: RecordingButton;
  stepForwardButton: RecordingButton;
  resetButton: RecordingButton;
  scrubber: RecordingRange;
  speedSelect: RecordingSelect;
  tickLabel: ControlTextElement;
  statusLabel: ControlTextElement;
}

const createFakeControls = (): FakeControls => ({
  playPauseButton: createButton(),
  stepBackButton: createButton(),
  stepForwardButton: createButton(),
  resetButton: createButton(),
  scrubber: createRange(),
  speedSelect: createSelect(),
  tickLabel: createText(),
  statusLabel: createText(),
});

interface FakeSummary extends SummaryPanelHost {
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

const createFakeSummary = (): FakeSummary => ({
  panel: createToggle(),
  errorPanel: createToggle(),
  errorMessage: createPanelText(),
  matchIdLabel: createPanelText(),
  mapLabel: createPanelText(),
  statusLabel: createPanelText(),
  winnerLabel: createPanelText(),
  durationLabel: createPanelText(),
  reliabilityLabel: createPanelText(),
  latencyLabel: createPanelText(),
  placementsList: createList<PlacementItemView>(),
  eventFeedList: createList<EventFeedItemView>(),
});

interface FakeFileInputHost extends FileInputBindingHost {
  fileInput: FakeFileInput;
}

const createFakeFileInputHost = (): FakeFileInputHost => ({
  fileInput: createFakeFileInput(),
});

interface FakeAppHost extends ReplayViewerAppHost {
  canvas: FakeCanvas;
  controls: FakeControls;
  summaryPanel: FakeSummary;
  fileInput: FakeFileInputHost;
}

const createFakeHost = (): FakeAppHost => ({
  canvas: createFakeCanvas(),
  controls: createFakeControls(),
  summaryPanel: createFakeSummary(),
  fileInput: createFakeFileInputHost(),
});

const createFakeFile = (name: string, content: string): ReplayFile => ({
  name,
  size: content.length,
  text: () => Promise.resolve(content),
});

describe('mountReplayViewerApp', () => {
  it('returns a viewer in idle state and applies idle UI to every host', () => {
    const host = createFakeHost();

    const app = mountReplayViewerApp(host);

    expect(app.viewer).toBeInstanceOf(ReplayViewer);
    expect(app.viewer.getSnapshot().status).toBe('idle');
    expect(host.controls.playPauseButton.disabled).toBe(true);
    expect(host.controls.scrubber.disabled).toBe(true);
    expect(host.summaryPanel.panel.hidden).toBe(true);
    expect(host.summaryPanel.errorPanel.hidden).toBe(true);
    const fillRect = host.canvas.ctx.calls.find((c) => c.op === 'fillRect');
    expect(fillRect).toBeDefined();
    expect(fillRect?.args).toEqual([0, 0, 120, 120]);
  });

  it('updates canvas, controls, and summary panel when a replay loads', () => {
    const host = createFakeHost();
    const app = mountReplayViewerApp(host);

    app.viewer.loadFromValue(buildArtifact());

    expect(app.viewer.getSnapshot().status).toBe('ready');
    expect(host.controls.playPauseButton.disabled).toBe(false);
    expect(host.controls.scrubber.disabled).toBe(false);
    expect(host.summaryPanel.panel.hidden).toBe(false);
    expect(host.summaryPanel.errorPanel.hidden).toBe(true);
    expect(host.summaryPanel.matchIdLabel.textContent).toBe('app-match');
    expect(host.summaryPanel.placementsList.items.length).toBe(2);
    const arcs = host.canvas.ctx.calls.filter((c) => c.op === 'arc');
    expect(arcs.length).toBeGreaterThan(0);
  });

  it('uses an injected ReplayViewer instance when provided', () => {
    const host = createFakeHost();
    const externalViewer = new ReplayViewer();
    externalViewer.loadFromValue(buildArtifact());

    const app = mountReplayViewerApp(host, { viewer: externalViewer });

    expect(app.viewer).toBe(externalViewer);
    expect(host.controls.playPauseButton.disabled).toBe(false);
    expect(host.summaryPanel.panel.hidden).toBe(false);
  });

  it('omits the file input binding when the host does not provide one', () => {
    const host: ReplayViewerAppHost = {
      canvas: createFakeCanvas(),
      controls: createFakeControls(),
      summaryPanel: createFakeSummary(),
    };

    const app = mountReplayViewerApp(host);

    expect(app.fileInputBinding).toBeNull();
  });

  it('wires the file input change event to the viewer load flow', async () => {
    const host = createFakeHost();
    mountReplayViewerApp(host);

    const file = createFakeFile('replay.safe.json', JSON.stringify(buildArtifact()));
    host.fileInput.fileInput.setFiles([file]);
    host.fileInput.fileInput.fireChange();
    await new Promise((r) => setTimeout(r, 0));

    expect(host.summaryPanel.panel.hidden).toBe(false);
    expect(host.summaryPanel.matchIdLabel.textContent).toBe('app-match');
  });

  it('shows the error panel when a malformed string is loaded', () => {
    const host = createFakeHost();
    const app = mountReplayViewerApp(host);

    app.viewer.loadFromString('not json at all');

    expect(host.summaryPanel.errorPanel.hidden).toBe(false);
    expect(host.summaryPanel.panel.hidden).toBe(true);
    expect(host.summaryPanel.errorMessage.textContent).toBeTruthy();
    expect(host.controls.playPauseButton.disabled).toBe(true);
  });

  it('refresh() re-applies the current snapshot to all hosts', () => {
    const host = createFakeHost();
    const app = mountReplayViewerApp(host);
    app.viewer.loadFromValue(buildArtifact());

    const canvasCallsBefore = host.canvas.ctx.calls.length;
    const summaryCallsBefore = host.summaryPanel.placementsList.setOptionsCalls;

    app.refresh();

    expect(host.canvas.ctx.calls.length).toBeGreaterThan(canvasCallsBefore);
    expect(host.summaryPanel.placementsList.setOptionsCalls).toBeGreaterThan(summaryCallsBefore);
  });

  it('dispose() detaches every binding so further viewer changes do not mutate the hosts', () => {
    const host = createFakeHost();
    const app = mountReplayViewerApp(host);
    app.viewer.loadFromValue(buildArtifact());

    app.dispose();

    const canvasCallsAfterDispose = host.canvas.ctx.calls.length;
    const summaryCallsAfterDispose = host.summaryPanel.placementsList.setOptionsCalls;
    const playPauseLabelAfterDispose = host.controls.playPauseButton.textContent;

    app.viewer.step(1);

    expect(host.canvas.ctx.calls.length).toBe(canvasCallsAfterDispose);
    expect(host.summaryPanel.placementsList.setOptionsCalls).toBe(summaryCallsAfterDispose);
    expect(host.controls.playPauseButton.textContent).toBe(playPauseLabelAfterDispose);
    expect(host.controls.playPauseButton.listeners).toHaveLength(0);
    expect(host.fileInput.fileInput.listeners).toHaveLength(0);
  });

  it('dispose() is idempotent across multiple calls', () => {
    const host = createFakeHost();
    const app = mountReplayViewerApp(host);

    expect(() => {
      app.dispose();
      app.dispose();
    }).not.toThrow();
    expect(host.controls.playPauseButton.listeners).toHaveLength(0);
  });

  it('refresh() is a no-op after dispose()', () => {
    const host = createFakeHost();
    const app = mountReplayViewerApp(host);
    app.viewer.loadFromValue(buildArtifact());

    app.dispose();
    const canvasCallsAfter = host.canvas.ctx.calls.length;
    const summaryCallsAfter = host.summaryPanel.placementsList.setOptionsCalls;

    app.refresh();

    expect(host.canvas.ctx.calls.length).toBe(canvasCallsAfter);
    expect(host.summaryPanel.placementsList.setOptionsCalls).toBe(summaryCallsAfter);
  });

  it('control button clicks drive the viewer through the bindings', () => {
    const host = createFakeHost();
    const app = mountReplayViewerApp(host);
    app.viewer.loadFromValue(buildArtifact());

    expect(app.viewer.getSnapshot().status).toBe('ready');
    if (app.viewer.getSnapshot().status !== 'ready') return;

    host.controls.stepForwardButton.click();

    const snapshot = app.viewer.getSnapshot();
    expect(snapshot.status).toBe('ready');
    if (snapshot.status === 'ready') {
      expect(snapshot.tick).toBe(1);
    }
  });
});
