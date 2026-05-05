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
      fileInputBinding?.dispose();
      summaryBinding.dispose();
      controlsBinding.dispose();
      canvasBinding.dispose();
    },
  };
}
