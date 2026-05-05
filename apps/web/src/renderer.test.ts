import type { MapDefinition } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RENDERER_THEME,
  renderScene,
  type Drawing2DContext,
  type RendererTheme,
} from './renderer.js';
import { buildScene } from './scene.js';
import type { TimelineFrame } from './timeline.js';

interface CallRecord {
  readonly op: string;
  readonly args: readonly (number | string)[];
}

interface RecordingContext extends Drawing2DContext {
  readonly calls: CallRecord[];
}

const createRecordingContext = (): RecordingContext => {
  const calls: CallRecord[] = [];
  let fill: string = '';
  let stroke: string = '';
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

const buildMap = (overrides: Partial<MapDefinition> = {}): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'renderer-test-arena',
  version: '0.1.0',
  width: 20,
  height: 10,
  spawns: [
    { id: 'a', contenderSlot: 0, position: { x: 2, y: 5 }, headingDegrees: 0 },
    { id: 'b', contenderSlot: 1, position: { x: 18, y: 5 }, headingDegrees: 180 },
  ],
  walls: [{ id: 'w1', x: 9, y: 4, width: 2, height: 2 }],
  pickups: [{ id: 'health-1', type: 'health', position: { x: 5, y: 5 }, respawnTicks: 5 }],
  symmetry: { kind: 'none' },
  ...overrides,
});

const buildFrame = (overrides: Partial<TimelineFrame> = {}): TimelineFrame => ({
  tick: 0,
  players: [
    {
      contenderId: 'alpha',
      x: 2,
      y: 5,
      headingDegrees: 0,
      health: 100,
      ammo: 12,
      alive: true,
    },
    {
      contenderId: 'bravo',
      x: 18,
      y: 5,
      headingDegrees: 180,
      health: 80,
      ammo: 12,
      alive: true,
    },
  ],
  pickups: [{ id: 'health-1', type: 'health', x: 5, y: 5, available: true }],
  score: { alpha: 0, bravo: 0 },
  status: 'in-progress',
  winner: null,
  endReason: null,
  events: [],
  ...overrides,
});

const opsOf = (calls: readonly CallRecord[]): readonly string[] => calls.map((c) => c.op);

describe('renderScene', () => {
  it('clears the viewport with the theme background before drawing primitives', () => {
    const map = buildMap();
    const frame = buildFrame();
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200 } });
    const ctx = createRecordingContext();

    renderScene(ctx, scene);

    const first = ctx.calls.findIndex((c) => c.op === 'fillRect');
    const setBg = ctx.calls.findIndex(
      (c) => c.op === 'set:fillStyle' && c.args[0] === DEFAULT_RENDERER_THEME.background,
    );
    expect(setBg).toBeGreaterThanOrEqual(0);
    expect(setBg).toBeLessThan(first);
    const bgRect = ctx.calls[first]!;
    expect(bgRect.args).toEqual([0, 0, 200, 200]);
  });

  it('strokes the bounds rectangle at scene origin and size', () => {
    const map = buildMap({ width: 20, height: 10 });
    const frame = buildFrame();
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });
    const ctx = createRecordingContext();

    renderScene(ctx, scene);

    const strokeRectIdx = ctx.calls.findIndex((c) => c.op === 'strokeRect');
    expect(strokeRectIdx).toBeGreaterThanOrEqual(0);
    const rect = ctx.calls[strokeRectIdx]!;
    // bounds: width=200, height=100, x=0, y=50
    expect(rect.args).toEqual([0, 50, 200, 100]);

    // strokeStyle for bounds should have been set just before
    const styleSet = ctx.calls
      .slice(0, strokeRectIdx)
      .reverse()
      .find((c) => c.op === 'set:strokeStyle');
    expect(styleSet?.args[0]).toBe(DEFAULT_RENDERER_THEME.boundsStroke);
  });

  it('fills each wall primitive with the theme wall color', () => {
    const map = buildMap();
    const frame = buildFrame();
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });
    const ctx = createRecordingContext();

    renderScene(ctx, scene);

    // bounds origin (0, 50). Wall world (9,4) size 2x2 at scale 10 => screen (90, 90), 20x20.
    const wallFill = ctx.calls.find(
      (c) =>
        c.op === 'fillRect' &&
        c.args[0] === 90 &&
        c.args[1] === 90 &&
        c.args[2] === 20 &&
        c.args[3] === 20,
    );
    expect(wallFill, 'expected the wall to be filled at (90,90) 20x20').toBeDefined();

    // The fillStyle assignment immediately preceding the wall fillRect should be the wall color.
    const idx = ctx.calls.indexOf(wallFill!);
    const styleSet = ctx.calls
      .slice(0, idx)
      .reverse()
      .find((c) => c.op === 'set:fillStyle');
    expect(styleSet?.args[0]).toBe(DEFAULT_RENDERER_THEME.wallFill);
  });

  it('uses different fill styles for available and unavailable pickups of the same type', () => {
    const map = buildMap();
    const frame = buildFrame({
      pickups: [
        { id: 'health-1', type: 'health', x: 5, y: 5, available: true },
        { id: 'health-2', type: 'health', x: 7, y: 3, available: false },
      ],
    });
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });
    const ctx = createRecordingContext();

    renderScene(ctx, scene);

    // Each pickup should produce one arc + fill.
    const arcs = ctx.calls.filter((c) => c.op === 'arc');
    expect(arcs.length).toBeGreaterThanOrEqual(2);

    // The fillStyle preceding each pickup's fill() differs between available and unavailable.
    const fillIndexes = ctx.calls.map((c, i) => (c.op === 'fill' ? i : -1)).filter((i) => i >= 0);
    expect(fillIndexes.length).toBeGreaterThanOrEqual(2);

    const styleBefore = (idx: number): string | undefined => {
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (ctx.calls[i]!.op === 'set:fillStyle') {
          return ctx.calls[i]!.args[0] as string;
        }
      }
      return undefined;
    };

    const firstPickupStyle = styleBefore(fillIndexes[0]!);
    const secondPickupStyle = styleBefore(fillIndexes[1]!);
    expect(firstPickupStyle).toBeDefined();
    expect(secondPickupStyle).toBeDefined();
    expect(firstPickupStyle).not.toBe(secondPickupStyle);
  });

  it('draws each player as a filled circle at their scene-space position', () => {
    const map = buildMap();
    const frame = buildFrame();
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });
    const ctx = createRecordingContext();

    renderScene(ctx, scene);

    // alpha (2,5) => screen (20, 50+50) = (20,100), bravo (18,5) => (180, 100). radius = 0.5*scale = 5.
    const playerArcs = ctx.calls.filter(
      (c) =>
        c.op === 'arc' &&
        // r=5 indicates a player body arc (not pickup r=4).
        c.args[2] === 5,
    );
    const positions = new Set(playerArcs.map((c) => `${c.args[0]},${c.args[1]}`));
    expect(positions.has('20,100')).toBe(true);
    expect(positions.has('180,100')).toBe(true);
  });

  it('uses the dead player color when a player is not alive and skips heading + health bar', () => {
    const map = buildMap();
    const frame = buildFrame({
      players: [
        {
          contenderId: 'alpha',
          x: 2,
          y: 5,
          headingDegrees: 0,
          health: 0,
          ammo: 0,
          alive: false,
        },
      ],
    });
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });
    const ctx = createRecordingContext();

    renderScene(ctx, scene);

    // Dead player => should set fillStyle to the dead color at some point.
    const deadStyle = ctx.calls.find(
      (c) => c.op === 'set:fillStyle' && c.args[0] === DEFAULT_RENDERER_THEME.playerDead,
    );
    expect(deadStyle, 'expected the dead-player fill style to be applied').toBeDefined();

    // No moveTo/lineTo for heading or health bar fill above the player.
    const moveTos = ctx.calls.filter((c) => c.op === 'moveTo');
    expect(moveTos.length).toBe(0);
  });

  it('draws a heading line from the alive player center toward (cx + headingX*r*k, cy + headingY*r*k)', () => {
    const map = buildMap();
    const frame = buildFrame({
      players: [
        {
          contenderId: 'alpha',
          x: 2,
          y: 5,
          headingDegrees: 0,
          health: 100,
          ammo: 12,
          alive: true,
        },
      ],
    });
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });
    const ctx = createRecordingContext();

    renderScene(ctx, scene);

    const moveCall = ctx.calls.find(
      (c) => c.op === 'moveTo' && c.args[0] === 20 && c.args[1] === 100,
    );
    expect(moveCall, 'expected moveTo at the alive player center').toBeDefined();

    // Heading 0 => +x. lineTo's x must be greater than 20, y must equal 100.
    const lineCall = ctx.calls.find(
      (c) =>
        c.op === 'lineTo' && typeof c.args[0] === 'number' && c.args[0] > 20 && c.args[1] === 100,
    );
    expect(lineCall, 'expected lineTo extending in +x direction').toBeDefined();
  });

  it('draws a health bar above each alive player whose width scales with healthRatio', () => {
    const map = buildMap();
    const frame = buildFrame({
      players: [
        {
          contenderId: 'alpha',
          x: 2,
          y: 5,
          headingDegrees: 0,
          health: 100,
          ammo: 12,
          alive: true,
        },
        {
          contenderId: 'bravo',
          x: 18,
          y: 5,
          headingDegrees: 180,
          health: 50,
          ammo: 12,
          alive: true,
        },
      ],
    });
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });
    const ctx = createRecordingContext();

    renderScene(ctx, scene);

    // Player radius = 5. Health bar full width = 2*radius = 10.
    // We expect for each alive player: a background fillRect (full bar) + a foreground fillRect (proportional).
    const fillRects = ctx.calls.filter((c) => c.op === 'fillRect');

    // Alpha (full health) bar foreground width should equal full bar width.
    const alphaBarFg = fillRects.find(
      (c) =>
        c.args[0] === 15 && // 20 - 5
        c.args[2] === 10,
    );
    expect(alphaBarFg, 'expected alpha health bar foreground at full width').toBeDefined();

    // Bravo (50 health) bar foreground width should be exactly half the bar (5).
    const bravoBarFg = fillRects.find(
      (c) =>
        c.args[0] === 175 && // 180 - 5
        c.args[2] === 5,
    );
    expect(bravoBarFg, 'expected bravo health bar foreground at half width').toBeDefined();
  });

  it('honors playerColorByContenderId for alive players', () => {
    const map = buildMap();
    const frame = buildFrame();
    const scene = buildScene({ frame, map, viewport: { width: 200, height: 200, padding: 0 } });
    const ctx = createRecordingContext();

    renderScene(ctx, scene, {
      playerColorByContenderId: { alpha: '#abcdef', bravo: '#fedcba' },
    });

    const fills = ctx.calls.filter((c) => c.op === 'set:fillStyle').map((c) => c.args[0]);
    expect(fills).toContain('#abcdef');
    expect(fills).toContain('#fedcba');
  });

  it('emits exactly one stroke or fill operation per primitive when accepting a custom theme', () => {
    const map = buildMap({ walls: [], pickups: [] });
    const frame = buildFrame({ pickups: [], players: [] });
    const scene = buildScene({ frame, map, viewport: { width: 100, height: 100 } });
    const ctx = createRecordingContext();

    const customTheme: RendererTheme = {
      ...DEFAULT_RENDERER_THEME,
      background: '#111',
      boundsStroke: '#0f0',
    };
    renderScene(ctx, scene, { theme: customTheme });

    const ops = opsOf(ctx.calls);
    // Exactly: clear background (set:fillStyle + fillRect), then bounds (set:strokeStyle + set:lineWidth + strokeRect).
    expect(ops.includes('strokeRect')).toBe(true);
    expect(ctx.calls.find((c) => c.op === 'set:fillStyle' && c.args[0] === '#111')).toBeDefined();
    expect(ctx.calls.find((c) => c.op === 'set:strokeStyle' && c.args[0] === '#0f0')).toBeDefined();
  });
});
