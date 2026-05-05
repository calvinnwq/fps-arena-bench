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
  bindReplayControls,
  type ControlButtonElement,
  type ControlRangeElement,
  type ControlSelectElement,
  type ControlTextElement,
  type ControlsBindingHost,
} from './controls-binding.js';
import { type SpeedOption } from './controls.js';
import { ReplayViewer } from './viewer.js';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'controls-binding-arena',
  version: '0.3.0',
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
  id: 'controls-binding-match',
  rulesetVersion: 'ruleset.v0.1',
  map: { id: 'controls-binding-arena', version: '0.3.0', hash: VALID_HASH },
  seed: 1,
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

interface FakeButton extends ControlButtonElement {
  click(): void;
  readonly clickListeners: Array<() => void>;
}

const createFakeButton = (): FakeButton => {
  const clickListeners: Array<() => void> = [];
  const button: FakeButton = {
    textContent: null,
    disabled: false,
    addEventListener(type, listener) {
      if (type === 'click') clickListeners.push(listener);
    },
    removeEventListener(type, listener) {
      if (type !== 'click') return;
      const idx = clickListeners.indexOf(listener);
      if (idx >= 0) clickListeners.splice(idx, 1);
    },
    click() {
      for (const listener of [...clickListeners]) listener();
    },
    clickListeners,
  };
  return button;
};

interface FakeRange extends ControlRangeElement {
  fireInput(value: string): void;
  readonly inputListeners: Array<() => void>;
}

const createFakeRange = (): FakeRange => {
  const inputListeners: Array<() => void> = [];
  const range: FakeRange = {
    min: '0',
    max: '0',
    value: '0',
    disabled: false,
    addEventListener(type, listener) {
      if (type === 'input') inputListeners.push(listener);
    },
    removeEventListener(type, listener) {
      if (type !== 'input') return;
      const idx = inputListeners.indexOf(listener);
      if (idx >= 0) inputListeners.splice(idx, 1);
    },
    fireInput(value: string) {
      this.value = value;
      for (const listener of [...inputListeners]) listener();
    },
    inputListeners,
  };
  return range;
};

interface FakeSelect extends ControlSelectElement {
  options: readonly SpeedOption[];
  fireChange(value: string): void;
  readonly changeListeners: Array<() => void>;
}

const createFakeSelect = (): FakeSelect => {
  const changeListeners: Array<() => void> = [];
  const select: FakeSelect = {
    value: '1',
    disabled: false,
    options: [],
    setOptions(options) {
      (select as { options: readonly SpeedOption[] }).options = options;
      const selected = options.find((o) => o.selected);
      if (selected) select.value = String(selected.value);
    },
    addEventListener(type, listener) {
      if (type === 'change') changeListeners.push(listener);
    },
    removeEventListener(type, listener) {
      if (type !== 'change') return;
      const idx = changeListeners.indexOf(listener);
      if (idx >= 0) changeListeners.splice(idx, 1);
    },
    fireChange(value: string) {
      this.value = value;
      for (const listener of [...changeListeners]) listener();
    },
    changeListeners,
  };
  return select;
};

const createFakeText = (): ControlTextElement => ({ textContent: null });

interface FakeHost extends ControlsBindingHost {
  playPauseButton: FakeButton;
  stepBackButton: FakeButton;
  stepForwardButton: FakeButton;
  resetButton: FakeButton;
  scrubber: FakeRange;
  speedSelect: FakeSelect;
  tickLabel: ControlTextElement;
  statusLabel: ControlTextElement;
}

const createFakeHost = (): FakeHost => ({
  playPauseButton: createFakeButton(),
  stepBackButton: createFakeButton(),
  stepForwardButton: createFakeButton(),
  resetButton: createFakeButton(),
  scrubber: createFakeRange(),
  speedSelect: createFakeSelect(),
  tickLabel: createFakeText(),
  statusLabel: createFakeText(),
});

describe('bindReplayControls', () => {
  it('renders an idle viewer with all controls disabled and idle labels', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    bindReplayControls(host, viewer);

    expect(host.playPauseButton.disabled).toBe(true);
    expect(host.playPauseButton.textContent).toBe('Play');
    expect(host.stepBackButton.disabled).toBe(true);
    expect(host.stepForwardButton.disabled).toBe(true);
    expect(host.resetButton.disabled).toBe(true);
    expect(host.scrubber.disabled).toBe(true);
    expect(host.speedSelect.disabled).toBe(true);
    expect(host.statusLabel.textContent).toBe('Idle');
    expect(host.tickLabel.textContent).toBe('No replay loaded');
    expect(host.speedSelect.options.length).toBeGreaterThan(0);
  });

  it('enables controls and writes scrubber range after a successful load', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    bindReplayControls(host, viewer);

    viewer.loadFromValue(buildArtifact());

    expect(host.playPauseButton.disabled).toBe(false);
    expect(host.playPauseButton.textContent).toBe('Play');
    expect(host.statusLabel.textContent).toBe('Paused');
    expect(host.stepBackButton.disabled).toBe(true);
    expect(host.stepForwardButton.disabled).toBe(false);
    expect(host.resetButton.disabled).toBe(true);
    expect(host.scrubber.disabled).toBe(false);
    expect(host.scrubber.min).toBe('0');
    expect(Number(host.scrubber.max)).toBeGreaterThan(0);
    expect(host.scrubber.value).toBe('0');
    expect(host.tickLabel.textContent).toBe(`Tick 0 / ${host.scrubber.max}`);
    expect(host.speedSelect.disabled).toBe(false);
    expect(host.speedSelect.value).toBe('10');
  });

  it('toggles play/pause when the play/pause button is clicked', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    bindReplayControls(host, viewer);
    viewer.loadFromValue(buildArtifact());

    host.playPauseButton.click();

    expect(host.playPauseButton.textContent).toBe('Pause');
    expect(host.statusLabel.textContent).toBe('Playing');

    host.playPauseButton.click();

    expect(host.playPauseButton.textContent).toBe('Play');
    expect(host.statusLabel.textContent).toBe('Paused');
  });

  it('advances the tick when the step-forward button is clicked', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    bindReplayControls(host, viewer);
    viewer.loadFromValue(buildArtifact());

    host.stepForwardButton.click();

    expect(host.scrubber.value).toBe('1');
    expect(host.tickLabel.textContent).toBe(`Tick 1 / ${host.scrubber.max}`);
    expect(host.stepBackButton.disabled).toBe(false);
  });

  it('seeks when the scrubber emits an input event', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    bindReplayControls(host, viewer);
    viewer.loadFromValue(buildArtifact());

    host.scrubber.fireInput('2');

    expect(host.scrubber.value).toBe('2');
    expect(host.tickLabel.textContent).toBe(`Tick 2 / ${host.scrubber.max}`);
    expect(host.stepBackButton.disabled).toBe(false);
  });

  it('updates speed when the speed select emits a change event', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    bindReplayControls(host, viewer);
    viewer.loadFromValue(buildArtifact());

    host.speedSelect.fireChange('2');

    expect(host.speedSelect.value).toBe('2');
    const selected = host.speedSelect.options.find((opt) => opt.selected);
    expect(selected?.value).toBe(2);
  });

  it('resets to tick 0 when the reset button is clicked from a non-zero tick', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    bindReplayControls(host, viewer);
    viewer.loadFromValue(buildArtifact());

    viewer.step(2);
    expect(host.scrubber.value).toBe('2');

    host.resetButton.click();

    expect(host.scrubber.value).toBe('0');
    expect(host.stepBackButton.disabled).toBe(true);
    expect(host.resetButton.disabled).toBe(true);
  });

  it('disables every interactive control on an error snapshot', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    bindReplayControls(host, viewer);

    viewer.loadFromString('not json at all');

    expect(host.statusLabel.textContent).toBe('Error');
    expect(host.playPauseButton.disabled).toBe(true);
    expect(host.stepBackButton.disabled).toBe(true);
    expect(host.stepForwardButton.disabled).toBe(true);
    expect(host.resetButton.disabled).toBe(true);
    expect(host.scrubber.disabled).toBe(true);
    expect(host.speedSelect.disabled).toBe(true);
  });

  it('uses provided speedPresets to populate the speed select options', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    bindReplayControls(host, viewer, { speedPresets: [0.5, 1, 3] });
    viewer.loadFromValue(buildArtifact());
    viewer.setSpeed(1);

    const values = host.speedSelect.options.map((o) => o.value);
    expect(values).toEqual([0.5, 1, 3]);
    expect(host.speedSelect.value).toBe('1');
  });

  it('removes all DOM listeners on dispose so subsequent UI events do not affect the viewer', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const binding = bindReplayControls(host, viewer);
    viewer.loadFromValue(buildArtifact());

    binding.dispose();

    expect(host.playPauseButton.clickListeners.length).toBe(0);
    expect(host.stepBackButton.clickListeners.length).toBe(0);
    expect(host.stepForwardButton.clickListeners.length).toBe(0);
    expect(host.resetButton.clickListeners.length).toBe(0);
    expect(host.scrubber.inputListeners.length).toBe(0);
    expect(host.speedSelect.changeListeners.length).toBe(0);

    const tickBefore = viewer.getSnapshot().status === 'ready'
      ? (viewer.getSnapshot() as { tick: number }).tick
      : -1;
    host.stepForwardButton.click();
    const tickAfter = viewer.getSnapshot().status === 'ready'
      ? (viewer.getSnapshot() as { tick: number }).tick
      : -1;
    expect(tickAfter).toBe(tickBefore);
  });

  it('stops updating DOM after dispose even when the viewer state changes', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const binding = bindReplayControls(host, viewer);

    viewer.loadFromValue(buildArtifact());
    binding.dispose();

    const tickLabelBefore = host.tickLabel.textContent;
    viewer.step(1);

    expect(host.tickLabel.textContent).toBe(tickLabelBefore);
  });
});
