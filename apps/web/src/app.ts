import {
  bindReplayCanvas,
  type BindReplayCanvasOptions,
  type CanvasBinding,
  type CanvasBindingHost,
} from './canvas-binding.js';
import {
  bindReplayControls,
  type BindReplayControlsOptions,
  type ControlsBinding,
  type ControlsBindingHost,
} from './controls-binding.js';
import {
  bindReplayFileInput,
  type BindReplayFileInputOptions,
  type FileInputBinding,
  type FileInputBindingHost,
} from './file-input-binding.js';
import {
  bindReplaySummaryPanel,
  type BindReplaySummaryPanelOptions,
  type SummaryPanelBinding,
  type SummaryPanelHost,
} from './summary-binding.js';
import { ReplayViewer } from './viewer.js';

export interface ReplayViewerAppHost {
  readonly canvas: CanvasBindingHost;
  readonly controls: ControlsBindingHost;
  readonly summaryPanel: SummaryPanelHost;
  readonly fileInput?: FileInputBindingHost;
}

export interface MountReplayViewerAppOptions {
  readonly viewer?: ReplayViewer;
  readonly canvas?: BindReplayCanvasOptions;
  readonly controls?: BindReplayControlsOptions;
  readonly fileInput?: BindReplayFileInputOptions;
  readonly summaryPanel?: BindReplaySummaryPanelOptions;
}

export interface ReplayViewerApp {
  readonly viewer: ReplayViewer;
  readonly canvasBinding: CanvasBinding;
  readonly controlsBinding: ControlsBinding;
  readonly summaryBinding: SummaryPanelBinding;
  readonly fileInputBinding: FileInputBinding | null;
  refresh(): void;
  dispose(): void;
}

export function mountReplayViewerApp(
  host: ReplayViewerAppHost,
  options: MountReplayViewerAppOptions = {},
): ReplayViewerApp {
  const viewer = options.viewer ?? new ReplayViewer();

  const canvasBinding = bindReplayCanvas(host.canvas, viewer, options.canvas ?? {});
  const controlsBinding = bindReplayControls(host.controls, viewer, options.controls ?? {});
  const summaryBinding = bindReplaySummaryPanel(
    host.summaryPanel,
    viewer,
    options.summaryPanel ?? {},
  );
  const fileInputBinding: FileInputBinding | null = host.fileInput
    ? bindReplayFileInput(host.fileInput, viewer, options.fileInput ?? {})
    : null;

  let disposed = false;
  let rafId: number | null = null;
  let lastTimestamp: number | null = null;

  const _g = globalThis as {
    requestAnimationFrame?: (cb: (timestamp: number) => void) => number;
    cancelAnimationFrame?: (id: number) => void;
  };
  const raf = _g.requestAnimationFrame?.bind(globalThis) ?? null;
  const caf = _g.cancelAnimationFrame?.bind(globalThis) ?? null;

  const tickLoop = (timestamp: number): void => {
    if (disposed) { rafId = null; return; }
    const delta = lastTimestamp !== null ? timestamp - lastTimestamp : 0;
    lastTimestamp = timestamp;
    viewer.advance(delta);
    // Only reschedule if the listener didn't null rafId (e.g. replay reached end and auto-paused)
    if (rafId !== null) {
      rafId = raf!(tickLoop);
    }
  };

  const unsubscribeViewer = viewer.subscribe((snap) => {
    if (disposed || raf === null) return;
    const playing = snap.status === 'ready' && snap.isPlaying;
    if (playing && rafId === null) {
      lastTimestamp = null;
      rafId = raf(tickLoop);
    } else if (!playing && rafId !== null) {
      caf!(rafId);
      rafId = null;
      lastTimestamp = null;
    }
  });

  return {
    viewer,
    canvasBinding,
    controlsBinding,
    summaryBinding,
    fileInputBinding,
    refresh: () => {
      if (disposed) return;
      canvasBinding.render();
      controlsBinding.refresh();
      summaryBinding.refresh();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribeViewer();
      if (rafId !== null && caf !== null) {
        caf(rafId);
        rafId = null;
      }
      fileInputBinding?.dispose();
      summaryBinding.dispose();
      controlsBinding.dispose();
      canvasBinding.dispose();
    },
  };
}
