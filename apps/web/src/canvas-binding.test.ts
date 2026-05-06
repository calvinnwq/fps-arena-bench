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

import { bindReplayCanvas, type CanvasBindingHost } from './canvas-binding.js';
import { DEFAULT_RENDERER_THEME, type Drawing2DContext } from './renderer.js';
import { ReplayViewer } from './viewer.js';

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'canvas-binding-arena',
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
  id: 'canvas-binding-match',
  rulesetVersion: 'ruleset.v0.1',
  map: { id: 'canvas-binding-arena', version: '0.1.0', hash: `sha256:${'a'.repeat(64)}` },
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

const createFakeCanvas = (width = 200, height = 100): FakeCanvas => {
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

describe('bindReplayCanvas', () => {
  it('renders an idle background fill for an unloaded viewer', () => {
    const viewer = new ReplayViewer();
    const canvas = createFakeCanvas(80, 40);
    bindReplayCanvas(canvas, viewer);

    const fillRectCall = canvas.ctx.calls.find((call) => call.op === 'fillRect');
    expect(fillRectCall).toBeDefined();
    expect(fillRectCall?.args).toEqual([0, 0, 80, 40]);

    const lastFillStyleBeforeFill = (() => {
      const idx = canvas.ctx.calls.findIndex((c) => c.op === 'fillRect');
      for (let i = idx - 1; i >= 0; i -= 1) {
        const c = canvas.ctx.calls[i]!;
        if (c.op === 'set:fillStyle') return c.args[0];
      }
      return null;
    })();
    expect(lastFillStyleBeforeFill).toBe(DEFAULT_RENDERER_THEME.background);

    const drewWalls = canvas.ctx.calls.some(
      (c) => c.op === 'fillRect' && c.args[2] !== 80 && c.args[3] !== 40,
    );
    expect(drewWalls).toBe(false);
  });

  it('renders a ready scene with bounds and players after load', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromValue(artifact);

    const canvas = createFakeCanvas(120, 120);
    bindReplayCanvas(canvas, viewer);

    const strokeRect = canvas.ctx.calls.find((c) => c.op === 'strokeRect');
    expect(strokeRect).toBeDefined();
    expect(strokeRect?.args[2]).toBe(120);
    expect(strokeRect?.args[3]).toBe(120);

    const arcCalls = canvas.ctx.calls.filter((c) => c.op === 'arc');
    expect(arcCalls.length).toBeGreaterThanOrEqual(4);
  });

  it('re-renders when the viewer emits a player snapshot change', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromValue(artifact);

    const canvas = createFakeCanvas(60, 60);
    bindReplayCanvas(canvas, viewer);
    const initialCallCount = canvas.ctx.calls.length;

    viewer.step(1);

    expect(canvas.ctx.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('clears with the background fill on error snapshots', () => {
    const viewer = new ReplayViewer();
    const canvas = createFakeCanvas(50, 30);
    bindReplayCanvas(canvas, viewer);
    canvas.ctx.calls.length = 0;

    viewer.loadFromString('not json at all');

    const fillRectCall = canvas.ctx.calls.find((c) => c.op === 'fillRect');
    expect(fillRectCall).toBeDefined();
    expect(fillRectCall?.args).toEqual([0, 0, 50, 30]);

    const drewArcs = canvas.ctx.calls.some((c) => c.op === 'arc');
    expect(drewArcs).toBe(false);
  });

  it('honors a custom theme background', () => {
    const viewer = new ReplayViewer();
    const canvas = createFakeCanvas();
    const customTheme = { ...DEFAULT_RENDERER_THEME, background: '#abcdef' };
    bindReplayCanvas(canvas, viewer, { theme: customTheme });

    const idx = canvas.ctx.calls.findIndex((c) => c.op === 'fillRect');
    expect(idx).toBeGreaterThan(-1);
    let fillStyleBefore: string | null = null;
    for (let i = idx - 1; i >= 0; i -= 1) {
      const c = canvas.ctx.calls[i]!;
      if (c.op === 'set:fillStyle') {
        fillStyleBefore = String(c.args[0]);
        break;
      }
    }
    expect(fillStyleBefore).toBe('#abcdef');
  });

  it('forwards playerColorByContenderId override into the renderer', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromValue(artifact);

    const canvas = createFakeCanvas(120, 120);
    bindReplayCanvas(canvas, viewer, {
      playerColorByContenderId: { alpha: '#ff00ff', bravo: '#00ff00' },
    });

    const fillStyles = canvas.ctx.calls
      .filter((c) => c.op === 'set:fillStyle')
      .map((c) => String(c.args[0]));
    expect(fillStyles).toContain('#ff00ff');
    expect(fillStyles).toContain('#00ff00');
  });

  it('passes padding through to the scene builder', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromValue(artifact);

    const canvas = createFakeCanvas(120, 120);
    bindReplayCanvas(canvas, viewer, { padding: 10 });

    const strokeRect = canvas.ctx.calls.find((c) => c.op === 'strokeRect');
    expect(strokeRect).toBeDefined();
    expect(Number(strokeRect?.args[0])).toBeGreaterThanOrEqual(10);
    expect(Number(strokeRect?.args[1])).toBeGreaterThanOrEqual(10);
    expect(Number(strokeRect?.args[2])).toBeLessThanOrEqual(100);
    expect(Number(strokeRect?.args[3])).toBeLessThanOrEqual(100);
  });

  it('exposes a manual render() helper that re-uses the latest snapshot', () => {
    const viewer = new ReplayViewer();
    const canvas = createFakeCanvas(40, 40);
    const binding = bindReplayCanvas(canvas, viewer);
    const initial = canvas.ctx.calls.length;

    binding.render();

    expect(canvas.ctx.calls.length).toBeGreaterThan(initial);
  });

  it('dispose() unsubscribes so further viewer changes do not draw', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromValue(artifact);

    const canvas = createFakeCanvas(60, 60);
    const binding = bindReplayCanvas(canvas, viewer);
    binding.dispose();
    const after = canvas.ctx.calls.length;

    viewer.step(1);

    expect(canvas.ctx.calls.length).toBe(after);
  });

  it('skips drawing when the canvas viewport has zero area', () => {
    const artifact = buildArtifact();
    const viewer = new ReplayViewer();
    viewer.loadFromValue(artifact);

    const canvas = createFakeCanvas(0, 0);
    bindReplayCanvas(canvas, viewer);

    expect(canvas.ctx.calls.length).toBe(0);
  });

  it('throws when the canvas does not provide a 2D context', () => {
    const viewer = new ReplayViewer();
    const canvas: CanvasBindingHost = {
      width: 10,
      height: 10,
      getContext: () => null,
    };

    expect(() => bindReplayCanvas(canvas, viewer)).toThrow(/2d/i);
  });
});
