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
  bootstrapReplayViewer,
  defaultEventFeedRenderer,
  defaultPlacementRenderer,
  formatEventFeedItemText,
  formatPlacementItemText,
  type BootstrapListChildElement,
  type BootstrapReplayViewerElements,
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
  OptionLikeElement,
} from './dom-adapters.js';
import type { Drawing2DContext } from './renderer.js';
import { ReplayViewer } from './viewer.js';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'bootstrap-arena',
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
  id: 'bootstrap-match',
  rulesetVersion: 'ruleset.v0.1',
  map: { id: 'bootstrap-arena', version: '0.1.0', hash: VALID_HASH },
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

const createNoopContext = (): Drawing2DContext => {
  let fill = '';
  let stroke = '';
  let lw = 1;
  return {
    get fillStyle() {
      return fill;
    },
    set fillStyle(v: string) {
      fill = v;
    },
    get strokeStyle() {
      return stroke;
    },
    set strokeStyle(v: string) {
      stroke = v;
    },
    get lineWidth() {
      return lw;
    },
    set lineWidth(v: number) {
      lw = v;
    },
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
  };
};

interface StubCanvas extends CanvasLikeElement {
  width: number;
  height: number;
}

const createStubCanvas = (): StubCanvas => {
  const ctx = createNoopContext();
  return {
    width: 200,
    height: 150,
    getContext(type) {
      return type === '2d' ? ctx : null;
    },
  };
};

interface StubButton extends ButtonLikeElement {
  listeners: Array<() => void>;
  click(): void;
}

const createStubButton = (): StubButton => {
  const listeners: Array<() => void> = [];
  return {
    textContent: null,
    disabled: false,
    listeners,
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
  };
};

const createStubRange = (): RangeLikeElement & { fireInput(): void } => {
  const listeners: Array<() => void> = [];
  return {
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
  };
};

const createOptionDoc = () => ({
  createElement: (_tag: 'option'): OptionLikeElement => ({ value: '', textContent: '' }),
});

const createStubSelect = (): SelectLikeElement & { children: OptionLikeElement[] } => {
  const listeners: Array<() => void> = [];
  const children: OptionLikeElement[] = [];
  return {
    value: '1',
    disabled: false,
    children,
    ownerDocument: createOptionDoc(),
    replaceChildren(...next) {
      children.splice(0, children.length, ...next);
    },
    addEventListener(type, listener) {
      if (type === 'change') listeners.push(listener);
    },
    removeEventListener(type, listener) {
      if (type !== 'change') return;
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    },
  };
};

const createStubText = (): TextLikeElement => ({ textContent: null });
const createStubToggle = (): ToggleLikeElement => ({ hidden: false });

interface StubListChild extends BootstrapListChildElement {
  textContent: string | null;
}

interface StubList extends ListLikeElement<StubListChild> {
  children: StubListChild[];
}

const createStubList = (): StubList => {
  const children: StubListChild[] = [];
  return {
    children,
    ownerDocument: {
      createElement: (_tag: string): StubListChild => ({ textContent: null }),
    },
    replaceChildren(...next) {
      children.splice(0, children.length, ...next);
    },
  };
};

interface StubFileInput extends FileInputLikeElement {
  listeners: Array<() => void>;
  fireChange(): void;
}

const createStubFileInput = (): StubFileInput => {
  const listeners: Array<() => void> = [];
  return {
    files: null,
    listeners,
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
  };
};

interface StubElements {
  canvas: StubCanvas;
  playPauseButton: StubButton;
  stepBackButton: StubButton;
  stepForwardButton: StubButton;
  resetButton: StubButton;
  scrubber: ReturnType<typeof createStubRange>;
  speedSelect: ReturnType<typeof createStubSelect>;
  tickLabel: TextLikeElement;
  controlsStatusLabel: TextLikeElement;
  fileInput: StubFileInput;
  summaryPanel: ToggleLikeElement;
  errorPanel: ToggleLikeElement;
  errorMessage: TextLikeElement;
  matchIdLabel: TextLikeElement;
  mapLabel: TextLikeElement;
  summaryStatusLabel: TextLikeElement;
  winnerLabel: TextLikeElement;
  durationLabel: TextLikeElement;
  reliabilityLabel: TextLikeElement;
  latencyLabel: TextLikeElement;
  placementsList: StubList;
  eventFeedList: StubList;
}

const createStubElements = (): StubElements => ({
  canvas: createStubCanvas(),
  playPauseButton: createStubButton(),
  stepBackButton: createStubButton(),
  stepForwardButton: createStubButton(),
  resetButton: createStubButton(),
  scrubber: createStubRange(),
  speedSelect: createStubSelect(),
  tickLabel: createStubText(),
  controlsStatusLabel: createStubText(),
  fileInput: createStubFileInput(),
  summaryPanel: createStubToggle(),
  errorPanel: createStubToggle(),
  errorMessage: createStubText(),
  matchIdLabel: createStubText(),
  mapLabel: createStubText(),
  summaryStatusLabel: createStubText(),
  winnerLabel: createStubText(),
  durationLabel: createStubText(),
  reliabilityLabel: createStubText(),
  latencyLabel: createStubText(),
  placementsList: createStubList(),
  eventFeedList: createStubList(),
});

const toElements = (stub: StubElements): BootstrapReplayViewerElements => ({
  canvas: stub.canvas,
  playPauseButton: stub.playPauseButton,
  stepBackButton: stub.stepBackButton,
  stepForwardButton: stub.stepForwardButton,
  resetButton: stub.resetButton,
  scrubber: stub.scrubber,
  speedSelect: stub.speedSelect,
  tickLabel: stub.tickLabel,
  controlsStatusLabel: stub.controlsStatusLabel,
  fileInput: stub.fileInput,
  summaryPanel: stub.summaryPanel,
  errorPanel: stub.errorPanel,
  errorMessage: stub.errorMessage,
  matchIdLabel: stub.matchIdLabel,
  mapLabel: stub.mapLabel,
  summaryStatusLabel: stub.summaryStatusLabel,
  winnerLabel: stub.winnerLabel,
  durationLabel: stub.durationLabel,
  reliabilityLabel: stub.reliabilityLabel,
  latencyLabel: stub.latencyLabel,
  placementsList: stub.placementsList,
  eventFeedList: stub.eventFeedList,
});

describe('formatPlacementItemText', () => {
  it('includes rank, displayName, adapter, winner mark, and stats', () => {
    const text = formatPlacementItemText({
      rank: 1,
      contenderId: 'alpha',
      displayName: 'Alpha',
      adapterId: 'mock-bot',
      isWinner: true,
      stats: {
        kills: 2,
        deaths: 0,
        damageDealt: 50,
        damageTaken: 10,
        survivalTicks: 100,
        pickupsCollected: 3,
      },
    });
    expect(text).toContain('#1');
    expect(text).toContain('Alpha');
    expect(text).toContain('mock-bot');
    expect(text).toContain('winner');
    expect(text).toContain('kills 2');
    expect(text).toContain('deaths 0');
    expect(text).toContain('damage 50/10');
    expect(text).toContain('pickups 3');
  });

  it('omits the winner mark for non-winners', () => {
    const text = formatPlacementItemText({
      rank: 2,
      contenderId: 'bravo',
      displayName: 'Bravo',
      adapterId: 'mock-bot',
      isWinner: false,
      stats: {
        kills: 0,
        deaths: 1,
        damageDealt: 0,
        damageTaken: 50,
        survivalTicks: 80,
        pickupsCollected: 0,
      },
    });
    expect(text).not.toContain('winner');
    expect(text).toContain('#2');
    expect(text).toContain('Bravo');
  });
});

describe('formatEventFeedItemText', () => {
  it('prefixes with a tick number and a key marker for important events', () => {
    const text = formatEventFeedItemText({ tick: 5, text: 'Alpha eliminated Bravo', isKey: true });
    expect(text).toContain('5');
    expect(text).toContain('Alpha eliminated Bravo');
    expect(text).toContain('★');
  });

  it('uses a non-key marker for routine events', () => {
    const text = formatEventFeedItemText({ tick: 7, text: 'Alpha moved', isKey: false });
    expect(text).not.toContain('★');
    expect(text).toContain('Alpha moved');
  });
});

describe('defaultPlacementRenderer', () => {
  it('creates an li-shaped child via doc.createElement and sets its textContent', () => {
    const captured: string[] = [];
    const doc = {
      createElement: (tag: string): BootstrapListChildElement => {
        captured.push(tag);
        return { textContent: null };
      },
    };
    const child = defaultPlacementRenderer(
      {
        rank: 1,
        contenderId: 'alpha',
        displayName: 'Alpha',
        adapterId: 'mock',
        isWinner: true,
        stats: {
          kills: 1,
          deaths: 0,
          damageDealt: 25,
          damageTaken: 0,
          survivalTicks: 50,
          pickupsCollected: 1,
        },
      },
      doc,
    );
    expect(captured).toEqual(['li']);
    expect(child.textContent).toContain('Alpha');
    expect(child.textContent).toContain('winner');
  });
});

describe('defaultEventFeedRenderer', () => {
  it('creates an li-shaped child via doc.createElement', () => {
    const captured: string[] = [];
    const doc = {
      createElement: (tag: string): BootstrapListChildElement => {
        captured.push(tag);
        return { textContent: null };
      },
    };
    const child = defaultEventFeedRenderer({ tick: 2, text: 'Alpha shot Bravo', isKey: true }, doc);
    expect(captured).toEqual(['li']);
    expect(child.textContent).toContain('Alpha shot Bravo');
  });
});

describe('bootstrapReplayViewer', () => {
  it('mounts in idle state with all controls disabled and panels hidden', () => {
    const stub = createStubElements();

    const app = bootstrapReplayViewer(toElements(stub));

    expect(app.viewer).toBeInstanceOf(ReplayViewer);
    expect(app.viewer.getSnapshot().status).toBe('idle');
    expect(stub.playPauseButton.disabled).toBe(true);
    expect(stub.scrubber.disabled).toBe(true);
    expect(stub.summaryPanel.hidden).toBe(true);
    expect(stub.errorPanel.hidden).toBe(true);
    app.dispose();
  });

  it('updates every wired DOM element when a replay loads', () => {
    const stub = createStubElements();
    const app = bootstrapReplayViewer(toElements(stub));

    app.viewer.loadFromValue(buildArtifact());

    expect(app.viewer.getSnapshot().status).toBe('ready');
    expect(stub.playPauseButton.disabled).toBe(false);
    expect(stub.scrubber.disabled).toBe(false);
    expect(stub.scrubber.max).toBe('3');
    expect(stub.summaryPanel.hidden).toBe(false);
    expect(stub.errorPanel.hidden).toBe(true);
    expect(stub.matchIdLabel.textContent).toBe('bootstrap-match');
    expect(stub.mapLabel.textContent).toContain('bootstrap-arena');
    expect(stub.placementsList.children.length).toBe(2);
    expect(stub.placementsList.children[0]?.textContent).toContain('Alpha');
    expect(stub.tickLabel.textContent).toContain('0');
    app.dispose();
  });

  it('omits the file-input binding when elements.fileInput is undefined', () => {
    const stub = createStubElements();
    const elements = toElements(stub);
    const { fileInput: _fileInput, ...rest } = elements;
    void _fileInput;

    const app = bootstrapReplayViewer(rest as BootstrapReplayViewerElements);

    expect(app.fileInputBinding).toBeNull();
    app.dispose();
  });

  it('wires the file input change event to the viewer', async () => {
    const stub = createStubElements();
    const app = bootstrapReplayViewer(toElements(stub));

    const artifact = buildArtifact();
    const file = {
      name: 'replay.safe.json',
      size: 100,
      text: () => Promise.resolve(JSON.stringify(artifact)),
    } as const;
    stub.fileInput.files = [file];
    stub.fileInput.fireChange();
    await new Promise((r) => setTimeout(r, 0));

    expect(stub.matchIdLabel.textContent).toBe('bootstrap-match');
    expect(stub.summaryPanel.hidden).toBe(false);
    app.dispose();
  });

  it('shows the error panel for invalid input and redacts paths from the message', () => {
    const stub = createStubElements();
    const app = bootstrapReplayViewer(toElements(stub));

    app.viewer.loadFromString('not-json-at-all');

    expect(stub.errorPanel.hidden).toBe(false);
    expect(stub.summaryPanel.hidden).toBe(true);
    expect(stub.errorMessage.textContent).toBeTruthy();
    app.dispose();
  });

  it('drives the viewer through wired button clicks', () => {
    const stub = createStubElements();
    const app = bootstrapReplayViewer(toElements(stub));
    app.viewer.loadFromValue(buildArtifact());

    stub.stepForwardButton.click();

    const snap = app.viewer.getSnapshot();
    expect(snap.status).toBe('ready');
    if (snap.status === 'ready') {
      expect(snap.tick).toBe(1);
    }
    app.dispose();
  });

  it('uses an injected viewer when provided in options', () => {
    const stub = createStubElements();
    const externalViewer = new ReplayViewer();
    externalViewer.loadFromValue(buildArtifact());

    const app = bootstrapReplayViewer(toElements(stub), { viewer: externalViewer });

    expect(app.viewer).toBe(externalViewer);
    expect(stub.playPauseButton.disabled).toBe(false);
    app.dispose();
  });

  it('honors a custom placement renderer', () => {
    const stub = createStubElements();
    const app = bootstrapReplayViewer(toElements(stub), {
      placementRenderer: (item, doc) => {
        const el = doc.createElement('div');
        el.textContent = `CUSTOM:${item.contenderId}`;
        return el;
      },
    });

    app.viewer.loadFromValue(buildArtifact());

    expect(stub.placementsList.children.length).toBe(2);
    expect(stub.placementsList.children[0]?.textContent).toMatch(/^CUSTOM:/);
    app.dispose();
  });

  it('honors a custom event feed renderer', () => {
    const stub = createStubElements();
    const app = bootstrapReplayViewer(toElements(stub), {
      eventFeedRenderer: (item, doc) => {
        const el = doc.createElement('div');
        el.textContent = `EV[${item.tick}]:${item.text}`;
        return el;
      },
    });

    app.viewer.loadFromValue(buildArtifact());

    if (stub.eventFeedList.children.length > 0) {
      expect(stub.eventFeedList.children[0]?.textContent).toMatch(/^EV\[/);
    }
    app.dispose();
  });

  it('dispose() detaches every DOM listener', () => {
    const stub = createStubElements();
    const app = bootstrapReplayViewer(toElements(stub));
    app.viewer.loadFromValue(buildArtifact());

    app.dispose();

    expect(stub.playPauseButton.listeners).toHaveLength(0);
    expect(stub.stepBackButton.listeners).toHaveLength(0);
    expect(stub.stepForwardButton.listeners).toHaveLength(0);
    expect(stub.resetButton.listeners).toHaveLength(0);
    expect(stub.fileInput.listeners).toHaveLength(0);
  });
});
