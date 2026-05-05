import type { Action } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it } from 'vitest';

import { DEBUG_TRACE_FILENAME, createDebugTraceWriter } from './debug.js';

const noopAction = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

describe('createDebugTraceWriter', () => {
  it('exposes the canonical debug trace filename', () => {
    expect(DEBUG_TRACE_FILENAME).toBe('debug.private.jsonl');
  });

  it('produces no output when not enabled', () => {
    const writer = createDebugTraceWriter();
    writer.record({
      kind: 'action',
      tick: 0,
      contenderId: 'alpha',
      action: noopAction(),
    });
    writer.record({
      kind: 'prompt',
      tick: 0,
      contenderId: 'alpha',
      prompt: 'leak this prompt',
    });
    expect(writer.enabled).toBe(false);
    expect(writer.lines).toEqual([]);
    expect(writer.serialize()).toBe('');
  });

  it('writes JSONL lines and forwards them to the sink when enabled', () => {
    const sinkLines: string[] = [];
    const writer = createDebugTraceWriter({
      enabled: true,
      sink: (line) => sinkLines.push(line),
    });

    writer.record({
      kind: 'prompt',
      tick: 0,
      contenderId: 'alpha',
      prompt: 'tactical prompt body',
    });
    writer.record({
      kind: 'response',
      tick: 0,
      contenderId: 'alpha',
      response: '{"type":"noop"}',
    });
    writer.record({
      kind: 'error',
      tick: 1,
      contenderId: null,
      code: 'process-error',
      message: 'spawn failed',
    });

    expect(writer.enabled).toBe(true);
    expect(writer.lines).toHaveLength(3);
    expect(sinkLines).toHaveLength(3);
    const serialized = writer.serialize();
    const lines = serialized.trim().split('\n');
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    const first = JSON.parse(lines[0]!);
    expect(first.kind).toBe('prompt');
    expect(first.prompt).toBe('tactical prompt body');
  });
});
