import {
  buildViewerControlsViewModel,
  type ControlsViewModel,
  type SpeedOption,
} from './controls.js';
import type { ReplayViewer, ViewerSnapshot } from './viewer.js';

export interface ControlButtonElement {
  textContent: string | null;
  disabled: boolean;
  addEventListener(type: 'click', listener: () => void): void;
  removeEventListener(type: 'click', listener: () => void): void;
}

export interface ControlRangeElement {
  min: string;
  max: string;
  value: string;
  disabled: boolean;
  addEventListener(type: 'input', listener: () => void): void;
  removeEventListener(type: 'input', listener: () => void): void;
}

export interface ControlSelectElement {
  value: string;
  disabled: boolean;
  setOptions(options: readonly SpeedOption[]): void;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export interface ControlTextElement {
  textContent: string | null;
}

export interface ControlsBindingHost {
  readonly playPauseButton: ControlButtonElement;
  readonly stepBackButton: ControlButtonElement;
  readonly stepForwardButton: ControlButtonElement;
  readonly resetButton: ControlButtonElement;
  readonly scrubber: ControlRangeElement;
  readonly speedSelect: ControlSelectElement;
  readonly tickLabel: ControlTextElement;
  readonly statusLabel: ControlTextElement;
}

export interface BindReplayControlsOptions {
  readonly speedPresets?: readonly number[];
}

export interface ControlsBinding {
  refresh(): void;
  dispose(): void;
}

export function bindReplayControls(
  host: ControlsBindingHost,
  viewer: ReplayViewer,
  options: BindReplayControlsOptions = {},
): ControlsBinding {
  const buildOptions = options.speedPresets
    ? { speedPresets: options.speedPresets }
    : {};

  const handlePlayPause = (): void => viewer.togglePlayPause();
  const handleStepBack = (): void => viewer.step(-1);
  const handleStepForward = (): void => viewer.step(1);
  const handleReset = (): void => viewer.reset();
  const handleScrubberInput = (): void => {
    const next = Number.parseInt(host.scrubber.value, 10);
    if (Number.isFinite(next)) viewer.seek(next);
  };
  const handleSpeedChange = (): void => {
    const next = Number.parseFloat(host.speedSelect.value);
    if (Number.isFinite(next) && next > 0) viewer.setSpeed(next);
  };

  host.playPauseButton.addEventListener('click', handlePlayPause);
  host.stepBackButton.addEventListener('click', handleStepBack);
  host.stepForwardButton.addEventListener('click', handleStepForward);
  host.resetButton.addEventListener('click', handleReset);
  host.scrubber.addEventListener('input', handleScrubberInput);
  host.speedSelect.addEventListener('change', handleSpeedChange);

  const apply = (vm: ControlsViewModel): void => {
    host.playPauseButton.textContent = vm.playPauseLabel;
    host.playPauseButton.disabled = vm.playPauseDisabled;
    host.stepBackButton.disabled = vm.stepBackDisabled;
    host.stepForwardButton.disabled = vm.stepForwardDisabled;
    host.resetButton.disabled = vm.resetDisabled;

    host.scrubber.min = String(vm.scrubber.min);
    host.scrubber.max = String(vm.scrubber.max);
    host.scrubber.value = String(vm.scrubber.value);
    host.scrubber.disabled = vm.scrubber.disabled;

    host.speedSelect.setOptions(vm.speedOptions);
    host.speedSelect.disabled = vm.speedDisabled;

    host.statusLabel.textContent = vm.statusLabel;
    host.tickLabel.textContent = vm.tickLabel;
  };

  const renderForSnapshot = (snapshot: ViewerSnapshot): void => {
    apply(buildViewerControlsViewModel(snapshot, buildOptions));
  };

  const unsubscribe = viewer.subscribe(renderForSnapshot);
  renderForSnapshot(viewer.getSnapshot());

  let disposed = false;

  return {
    refresh: () => {
      if (disposed) return;
      renderForSnapshot(viewer.getSnapshot());
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      host.playPauseButton.removeEventListener('click', handlePlayPause);
      host.stepBackButton.removeEventListener('click', handleStepBack);
      host.stepForwardButton.removeEventListener('click', handleStepForward);
      host.resetButton.removeEventListener('click', handleReset);
      host.scrubber.removeEventListener('input', handleScrubberInput);
      host.speedSelect.removeEventListener('change', handleSpeedChange);
    },
  };
}
