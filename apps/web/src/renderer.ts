import type { PickupType } from '@fps-arena-bench/core';

import type { PickupPrimitive, PlayerPrimitive, Scene, ScenePrimitive } from './scene.js';

export interface Drawing2DContext {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): void;
  fill(): void;
  stroke(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
}

export interface RendererTheme {
  readonly background: string;
  readonly boundsStroke: string;
  readonly boundsLineWidth: number;
  readonly wallFill: string;
  readonly pickupColors: Readonly<Record<PickupType, string>>;
  readonly pickupUnavailable: string;
  readonly playerPalette: readonly string[];
  readonly playerStroke: string;
  readonly playerStrokeWidth: number;
  readonly playerDead: string;
  readonly heading: string;
  readonly headingLineWidth: number;
  readonly healthBarBackground: string;
  readonly healthBarForeground: string;
}

export const DEFAULT_RENDERER_THEME: RendererTheme = {
  background: '#0b1020',
  boundsStroke: '#5b6479',
  boundsLineWidth: 2,
  wallFill: '#3a4255',
  pickupColors: {
    health: '#3ad07c',
    ammo: '#f1c151',
    armor: '#6da9ff',
  },
  pickupUnavailable: '#2c3142',
  playerPalette: ['#ff6e6e', '#6ea8ff', '#c3a4ff', '#7be4d2'],
  playerStroke: '#0b1020',
  playerStrokeWidth: 1,
  playerDead: '#5a5a5a',
  heading: '#f5f7ff',
  headingLineWidth: 2,
  healthBarBackground: '#1d2335',
  healthBarForeground: '#7be4d2',
};

export interface RenderSceneOptions {
  readonly theme?: RendererTheme;
  readonly playerColorByContenderId?: Readonly<Record<string, string>>;
}

const HEADING_LENGTH_FACTOR = 1.5;
const HEALTH_BAR_HEIGHT_FACTOR = 0.25;
const HEALTH_BAR_GAP = 2;
const FULL_CIRCLE = Math.PI * 2;

const drawCircle = (
  ctx: Drawing2DContext,
  cx: number,
  cy: number,
  radius: number,
): void => {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, FULL_CIRCLE);
};

const renderPickup = (
  ctx: Drawing2DContext,
  pickup: PickupPrimitive,
  theme: RendererTheme,
): void => {
  ctx.fillStyle = pickup.available
    ? theme.pickupColors[pickup.pickupType]
    : theme.pickupUnavailable;
  drawCircle(ctx, pickup.cx, pickup.cy, pickup.radius);
  ctx.fill();
};

const colorForPlayer = (
  player: PlayerPrimitive,
  paletteIndex: number,
  theme: RendererTheme,
  override: Readonly<Record<string, string>> | undefined,
): string => {
  if (!player.alive) return theme.playerDead;
  const explicit = override?.[player.contenderId];
  if (explicit !== undefined) return explicit;
  if (theme.playerPalette.length === 0) return theme.playerStroke;
  return theme.playerPalette[paletteIndex % theme.playerPalette.length]!;
};

const renderPlayer = (
  ctx: Drawing2DContext,
  player: PlayerPrimitive,
  paletteIndex: number,
  theme: RendererTheme,
  override: Readonly<Record<string, string>> | undefined,
): void => {
  ctx.fillStyle = colorForPlayer(player, paletteIndex, theme, override);
  drawCircle(ctx, player.cx, player.cy, player.radius);
  ctx.fill();

  ctx.strokeStyle = theme.playerStroke;
  ctx.lineWidth = theme.playerStrokeWidth;
  drawCircle(ctx, player.cx, player.cy, player.radius);
  ctx.stroke();

  if (!player.alive) return;

  ctx.strokeStyle = theme.heading;
  ctx.lineWidth = theme.headingLineWidth;
  ctx.beginPath();
  ctx.moveTo(player.cx, player.cy);
  ctx.lineTo(
    player.cx + player.headingX * player.radius * HEADING_LENGTH_FACTOR,
    player.cy + player.headingY * player.radius * HEADING_LENGTH_FACTOR,
  );
  ctx.stroke();

  const barWidth = player.radius * 2;
  const barHeight = Math.max(1, player.radius * HEALTH_BAR_HEIGHT_FACTOR);
  const barX = player.cx - player.radius;
  const barY = player.cy - player.radius - barHeight - HEALTH_BAR_GAP;
  ctx.fillStyle = theme.healthBarBackground;
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = theme.healthBarForeground;
  ctx.fillRect(barX, barY, barWidth * player.healthRatio, barHeight);
};

export function renderScene(
  ctx: Drawing2DContext,
  scene: Scene,
  options: RenderSceneOptions = {},
): void {
  const theme = options.theme ?? DEFAULT_RENDERER_THEME;
  const playerColorByContenderId = options.playerColorByContenderId;

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, scene.viewport.width, scene.viewport.height);

  let playerCount = 0;
  for (const primitive of scene.primitives) {
    renderPrimitive(
      ctx,
      primitive,
      theme,
      playerColorByContenderId,
      () => playerCount++,
    );
  }
}

const renderPrimitive = (
  ctx: Drawing2DContext,
  primitive: ScenePrimitive,
  theme: RendererTheme,
  override: Readonly<Record<string, string>> | undefined,
  nextPlayerIndex: () => number,
): void => {
  switch (primitive.kind) {
    case 'bounds':
      ctx.strokeStyle = theme.boundsStroke;
      ctx.lineWidth = theme.boundsLineWidth;
      ctx.strokeRect(primitive.x, primitive.y, primitive.width, primitive.height);
      return;
    case 'wall':
      ctx.fillStyle = theme.wallFill;
      ctx.fillRect(primitive.x, primitive.y, primitive.width, primitive.height);
      return;
    case 'pickup':
      renderPickup(ctx, primitive, theme);
      return;
    case 'player': {
      const idx = nextPlayerIndex();
      renderPlayer(ctx, primitive, idx, theme, override);
      return;
    }
  }
};
