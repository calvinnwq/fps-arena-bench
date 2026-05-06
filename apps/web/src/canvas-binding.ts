import {
  DEFAULT_RENDERER_THEME,
  renderScene,
  type Drawing2DContext,
  type RendererTheme,
} from './renderer.js';
import { buildScene, type SceneViewport } from './scene.js';
import type { ReplayViewer, ViewerSnapshot } from './viewer.js';

export interface CanvasBindingHost {
  readonly width: number;
  readonly height: number;
  getContext(type: '2d'): Drawing2DContext | null;
}

export interface BindReplayCanvasOptions {
  readonly theme?: RendererTheme;
  readonly playerColorByContenderId?: Readonly<Record<string, string>>;
  readonly padding?: number;
}

export interface CanvasBinding {
  render(): void;
  dispose(): void;
}

const clearWithBackground = (
  ctx: Drawing2DContext,
  width: number,
  height: number,
  theme: RendererTheme,
): void => {
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);
};

export function bindReplayCanvas(
  host: CanvasBindingHost,
  viewer: ReplayViewer,
  options: BindReplayCanvasOptions = {},
): CanvasBinding {
  const ctx = host.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for replay viewer binding.');
  }

  const theme = options.theme ?? DEFAULT_RENDERER_THEME;
  const padding = options.padding;
  const playerColorByContenderId = options.playerColorByContenderId;

  const renderForSnapshot = (snapshot: ViewerSnapshot): void => {
    const width = host.width;
    const height = host.height;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    if (width <= 0 || height <= 0) return;

    if (snapshot.status !== 'ready') {
      clearWithBackground(ctx, width, height, theme);
      return;
    }

    const viewport: SceneViewport =
      padding === undefined ? { width, height } : { width, height, padding };

    const scene = buildScene({
      frame: snapshot.frame,
      map: snapshot.timeline.map,
      viewport,
    });
    if (playerColorByContenderId === undefined) {
      renderScene(ctx, scene, { theme });
    } else {
      renderScene(ctx, scene, { theme, playerColorByContenderId });
    }
  };

  const render = (): void => {
    renderForSnapshot(viewer.getSnapshot());
  };

  const unsubscribe = viewer.subscribe(renderForSnapshot);
  render();

  return {
    render,
    dispose: () => {
      unsubscribe();
    },
  };
}
