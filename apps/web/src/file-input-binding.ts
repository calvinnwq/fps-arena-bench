import { redactString } from '@fps-arena-bench/replay';

import { MAX_REPLAY_INPUT_BYTES } from './loader.js';
import type { ReplayViewer, ViewerSnapshot } from './viewer.js';

export interface ReplayFile {
  readonly name: string;
  readonly size: number;
  text(): Promise<string>;
}

export interface ReplayFileInputElement {
  getFiles(): readonly ReplayFile[];
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export interface FileInputBindingHost {
  readonly fileInput: ReplayFileInputElement;
}

export type FileInputErrorKind = 'no-file' | 'too-large' | 'read-error';

export interface FileInputError {
  readonly kind: FileInputErrorKind;
  readonly message: string;
}

export type LoadFileResult =
  | {
      readonly ok: true;
      readonly file: ReplayFile;
      readonly snapshot: ViewerSnapshot;
    }
  | {
      readonly ok: false;
      readonly file: ReplayFile | null;
      readonly error: FileInputError;
    };

export interface BindReplayFileInputOptions {
  readonly maxBytes?: number;
  readonly onResult?: (result: LoadFileResult) => void;
}

export interface FileInputBinding {
  loadFile(file: ReplayFile): Promise<LoadFileResult>;
  dispose(): void;
}

const sanitize = (message: string): string => redactString(message);

export function bindReplayFileInput(
  host: FileInputBindingHost,
  viewer: ReplayViewer,
  options: BindReplayFileInputOptions = {},
): FileInputBinding {
  const maxBytes = options.maxBytes ?? MAX_REPLAY_INPUT_BYTES;
  const emit = (result: LoadFileResult): void => {
    options.onResult?.(result);
  };

  const loadFile = async (file: ReplayFile): Promise<LoadFileResult> => {
    if (file.size > maxBytes) {
      const result: LoadFileResult = {
        ok: false,
        file,
        error: {
          kind: 'too-large',
          message: sanitize(
            `Replay file "${file.name}" is ${file.size} bytes which exceeds the ${maxBytes} byte limit.`,
          ),
        },
      };
      emit(result);
      return result;
    }

    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read replay file.';
      const result: LoadFileResult = {
        ok: false,
        file,
        error: { kind: 'read-error', message: sanitize(message) },
      };
      emit(result);
      return result;
    }

    const snapshot = viewer.loadFromString(text);
    const result: LoadFileResult = { ok: true, file, snapshot };
    emit(result);
    return result;
  };

  const handleChange = (): void => {
    const files = host.fileInput.getFiles();
    if (files.length === 0) {
      emit({
        ok: false,
        file: null,
        error: { kind: 'no-file', message: 'No replay file selected.' },
      });
      return;
    }
    void loadFile(files[0]!);
  };

  host.fileInput.addEventListener('change', handleChange);

  let disposed = false;

  return {
    loadFile: (file) => {
      if (disposed) {
        return Promise.reject(new Error('FileInputBinding has been disposed.'));
      }
      return loadFile(file);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      host.fileInput.removeEventListener('change', handleChange);
    },
  };
}
