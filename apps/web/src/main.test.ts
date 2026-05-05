import { describe, expect, it } from 'vitest';

import { REPLAY_VIEWER_ELEMENT_IDS, bootReplayViewerFromDocument } from './main.js';
import type {
  ButtonLikeElement,
  CanvasLikeElement,
  FileInputLikeElement,
  RangeLikeElement,
  SelectLikeElement,
  TextLikeElement,
  ToggleLikeElement,
  ListLikeElement,
} from './dom-adapters.js';
import type { BootstrapListChildElement } from './bootstrap.js';
import type { Drawing2DContext } from './renderer.js';

const noopCtx = (): Drawing2DContext => {
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

const stubCanvas = (): CanvasLikeElement => {
  const ctx = noopCtx();
  return {
    width: 200,
    height: 150,
    getContext(type) {
      return type === '2d' ? ctx : null;
    },
  };
};

const stubButton = (): ButtonLikeElement => ({
  textContent: null,
  disabled: false,
  addEventListener() {},
  removeEventListener() {},
});

const stubRange = (): RangeLikeElement => ({
  min: '0',
  max: '0',
  value: '0',
  disabled: false,
  addEventListener() {},
  removeEventListener() {},
});

const stubSelect = (): SelectLikeElement => ({
  value: '1',
  disabled: false,
  ownerDocument: { createElement: () => ({ value: '', textContent: '' }) },
  replaceChildren() {},
  addEventListener() {},
  removeEventListener() {},
});

const stubText = (): TextLikeElement => ({ textContent: null });
const stubToggle = (): ToggleLikeElement => ({ hidden: false });
const stubFileInput = (): FileInputLikeElement => ({
  files: null,
  addEventListener() {},
  removeEventListener() {},
});
const stubList = (): ListLikeElement<BootstrapListChildElement> => ({
  ownerDocument: { createElement: () => ({ textContent: null }) },
  replaceChildren() {},
});

interface DocLike {
  getElementById(id: string): unknown;
}

const buildFullDocStubs = (): Record<string, unknown> => ({
  [REPLAY_VIEWER_ELEMENT_IDS.canvas]: stubCanvas(),
  [REPLAY_VIEWER_ELEMENT_IDS.playPauseButton]: stubButton(),
  [REPLAY_VIEWER_ELEMENT_IDS.stepBackButton]: stubButton(),
  [REPLAY_VIEWER_ELEMENT_IDS.stepForwardButton]: stubButton(),
  [REPLAY_VIEWER_ELEMENT_IDS.resetButton]: stubButton(),
  [REPLAY_VIEWER_ELEMENT_IDS.scrubber]: stubRange(),
  [REPLAY_VIEWER_ELEMENT_IDS.speedSelect]: stubSelect(),
  [REPLAY_VIEWER_ELEMENT_IDS.tickLabel]: stubText(),
  [REPLAY_VIEWER_ELEMENT_IDS.controlsStatusLabel]: stubText(),
  [REPLAY_VIEWER_ELEMENT_IDS.fileInput]: stubFileInput(),
  [REPLAY_VIEWER_ELEMENT_IDS.summaryPanel]: stubToggle(),
  [REPLAY_VIEWER_ELEMENT_IDS.errorPanel]: stubToggle(),
  [REPLAY_VIEWER_ELEMENT_IDS.errorMessage]: stubText(),
  [REPLAY_VIEWER_ELEMENT_IDS.matchIdLabel]: stubText(),
  [REPLAY_VIEWER_ELEMENT_IDS.mapLabel]: stubText(),
  [REPLAY_VIEWER_ELEMENT_IDS.summaryStatusLabel]: stubText(),
  [REPLAY_VIEWER_ELEMENT_IDS.winnerLabel]: stubText(),
  [REPLAY_VIEWER_ELEMENT_IDS.durationLabel]: stubText(),
  [REPLAY_VIEWER_ELEMENT_IDS.reliabilityLabel]: stubText(),
  [REPLAY_VIEWER_ELEMENT_IDS.latencyLabel]: stubText(),
  [REPLAY_VIEWER_ELEMENT_IDS.placementsList]: stubList(),
  [REPLAY_VIEWER_ELEMENT_IDS.eventFeedList]: stubList(),
});

const docFromStubs = (stubs: Record<string, unknown>): DocLike => ({
  getElementById: (id: string) => stubs[id] ?? null,
});

describe('REPLAY_VIEWER_ELEMENT_IDS', () => {
  it('exposes a stable id for every required element on the page', () => {
    expect(REPLAY_VIEWER_ELEMENT_IDS.canvas).toBe('replay-canvas');
    expect(REPLAY_VIEWER_ELEMENT_IDS.playPauseButton).toBe('replay-play-pause');
    expect(REPLAY_VIEWER_ELEMENT_IDS.stepBackButton).toBe('replay-step-back');
    expect(REPLAY_VIEWER_ELEMENT_IDS.stepForwardButton).toBe('replay-step-forward');
    expect(REPLAY_VIEWER_ELEMENT_IDS.resetButton).toBe('replay-reset');
    expect(REPLAY_VIEWER_ELEMENT_IDS.scrubber).toBe('replay-scrubber');
    expect(REPLAY_VIEWER_ELEMENT_IDS.speedSelect).toBe('replay-speed');
    expect(REPLAY_VIEWER_ELEMENT_IDS.tickLabel).toBe('replay-tick');
    expect(REPLAY_VIEWER_ELEMENT_IDS.controlsStatusLabel).toBe('replay-controls-status');
    expect(REPLAY_VIEWER_ELEMENT_IDS.fileInput).toBe('replay-file-input');
    expect(REPLAY_VIEWER_ELEMENT_IDS.summaryPanel).toBe('replay-summary-panel');
    expect(REPLAY_VIEWER_ELEMENT_IDS.errorPanel).toBe('replay-error-panel');
    expect(REPLAY_VIEWER_ELEMENT_IDS.errorMessage).toBe('replay-error-message');
    expect(REPLAY_VIEWER_ELEMENT_IDS.matchIdLabel).toBe('replay-match-id');
    expect(REPLAY_VIEWER_ELEMENT_IDS.mapLabel).toBe('replay-map');
    expect(REPLAY_VIEWER_ELEMENT_IDS.summaryStatusLabel).toBe('replay-summary-status');
    expect(REPLAY_VIEWER_ELEMENT_IDS.winnerLabel).toBe('replay-winner');
    expect(REPLAY_VIEWER_ELEMENT_IDS.durationLabel).toBe('replay-duration');
    expect(REPLAY_VIEWER_ELEMENT_IDS.reliabilityLabel).toBe('replay-reliability');
    expect(REPLAY_VIEWER_ELEMENT_IDS.latencyLabel).toBe('replay-latency');
    expect(REPLAY_VIEWER_ELEMENT_IDS.placementsList).toBe('replay-placements');
    expect(REPLAY_VIEWER_ELEMENT_IDS.eventFeedList).toBe('replay-event-feed');
  });
});

describe('bootReplayViewerFromDocument', () => {
  it('mounts the viewer in idle state when every element is present', () => {
    const stubs = buildFullDocStubs();
    const doc = docFromStubs(stubs);

    const app = bootReplayViewerFromDocument(doc);

    expect(app.viewer.getSnapshot().status).toBe('idle');
    expect(app.fileInputBinding).not.toBeNull();
    app.dispose();
  });

  it('omits the file-input binding when the file input element is absent', () => {
    const stubs = buildFullDocStubs();
    delete stubs[REPLAY_VIEWER_ELEMENT_IDS.fileInput];
    const doc = docFromStubs(stubs);

    const app = bootReplayViewerFromDocument(doc);

    expect(app.fileInputBinding).toBeNull();
    app.dispose();
  });

  it('throws a clear error when a required element is missing', () => {
    const stubs = buildFullDocStubs();
    delete stubs[REPLAY_VIEWER_ELEMENT_IDS.canvas];
    const doc = docFromStubs(stubs);

    expect(() => bootReplayViewerFromDocument(doc)).toThrow(/replay-canvas/);
  });

  it('throws when multiple required elements are missing and names them', () => {
    const stubs = buildFullDocStubs();
    delete stubs[REPLAY_VIEWER_ELEMENT_IDS.playPauseButton];
    delete stubs[REPLAY_VIEWER_ELEMENT_IDS.scrubber];
    const doc = docFromStubs(stubs);

    let captured: unknown = null;
    try {
      bootReplayViewerFromDocument(doc);
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(Error);
    const msg = captured instanceof Error ? captured.message : '';
    expect(msg).toContain('replay-play-pause');
    expect(msg).toContain('replay-scrubber');
  });

  it('forwards options through to bootstrapReplayViewer (custom renderer is honored)', () => {
    const stubs = buildFullDocStubs();
    const doc = docFromStubs(stubs);

    const app = bootReplayViewerFromDocument(doc, {
      placementRenderer: (item, d) => {
        const child = d.createElement('li');
        child.textContent = `OVERRIDE:${item.contenderId}`;
        return child;
      },
    });

    expect(app.viewer.getSnapshot().status).toBe('idle');
    app.dispose();
  });
});
