import type { Action, Observation } from '@fps-arena-bench/schemas';

export const DEBUG_TRACE_FILENAME = 'debug.private.jsonl';

export type DebugRecord =
  | {
      readonly kind: 'observation';
      readonly tick: number;
      readonly contenderId: string;
      readonly observation: Observation;
    }
  | {
      readonly kind: 'prompt';
      readonly tick: number;
      readonly contenderId: string;
      readonly prompt: string;
    }
  | {
      readonly kind: 'response';
      readonly tick: number;
      readonly contenderId: string;
      readonly response: string;
    }
  | {
      readonly kind: 'action';
      readonly tick: number;
      readonly contenderId: string;
      readonly action: Action;
    }
  | {
      readonly kind: 'error';
      readonly tick: number;
      readonly contenderId: string | null;
      readonly code: string;
      readonly message: string;
    };

export interface DebugTraceWriterOptions {
  readonly enabled: boolean;
  readonly sink?: (line: string) => void;
}

export interface DebugTraceWriter {
  readonly enabled: boolean;
  readonly lines: readonly string[];
  record(entry: DebugRecord): void;
  serialize(): string;
}

const noopSink = (): void => {};

export function createDebugTraceWriter(
  options: DebugTraceWriterOptions = { enabled: false },
): DebugTraceWriter {
  const lines: string[] = [];
  const enabled = options.enabled;
  const sink = options.sink ?? noopSink;

  return {
    get enabled() {
      return enabled;
    },
    get lines() {
      return lines;
    },
    record(entry: DebugRecord): void {
      if (!enabled) {
        return;
      }
      const line = JSON.stringify(entry);
      lines.push(line);
      sink(line);
    },
    serialize(): string {
      return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
    },
  };
}
