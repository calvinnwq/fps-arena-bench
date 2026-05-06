import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

import {
  ADAPTER_DEFAULT_MAX_OUTPUT_BYTES,
  parseActionResponse,
  type ParseActionResult,
} from './parse-action.js';

const ADAPTER_ID = 'test-adapter';

const expectError = (
  result: ParseActionResult,
  code: 'invalid-json' | 'schema-failure' | 'timeout' | 'aborted' | 'output-cap' | 'process-error',
): void => {
  if (result.ok) {
    throw new Error('Expected error result, got ok.');
  }
  expect(result.error.code).toBe(code);
  expect(result.error.adapterId).toBe(ADAPTER_ID);
  expect(result.error.schemaVersion).toBe(SCHEMA_VERSION);
  expect(result.error.message.length).toBeGreaterThan(0);
};

describe('parseActionResponse', () => {
  it('parses a valid noop action JSON object', () => {
    const raw = JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'noop' });
    const result = parseActionResponse(raw, { adapterId: ADAPTER_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected ok result.');
    }
    expect(result.action).toEqual({ schemaVersion: SCHEMA_VERSION, type: 'noop' });
  });

  it('parses a valid move action JSON object with surrounding whitespace', () => {
    const raw = `\n   ${JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      type: 'move',
      direction: { x: 1, y: 0 },
    })}\n`;
    const result = parseActionResponse(raw, { adapterId: ADAPTER_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected ok result.');
    }
    expect(result.action.type).toBe('move');
  });

  it('returns invalid-json for empty output', () => {
    const result = parseActionResponse('', { adapterId: ADAPTER_ID });
    expectError(result, 'invalid-json');
    if (result.ok) return;
    expect(result.error.retryable).toBe(true);
  });

  it('returns invalid-json for unparseable JSON', () => {
    const result = parseActionResponse('{not json}', { adapterId: ADAPTER_ID });
    expectError(result, 'invalid-json');
  });

  it('returns invalid-json for prose-then-json (model leaked rationale)', () => {
    // Strict: we accept exactly one JSON object, no prose markdown rationale around it.
    const raw = `Here is my action:\n${JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      type: 'noop',
    })}`;
    const result = parseActionResponse(raw, { adapterId: ADAPTER_ID });
    expectError(result, 'invalid-json');
  });

  it('returns schema-failure for valid JSON that does not match action schema', () => {
    const raw = JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'fly' });
    const result = parseActionResponse(raw, { adapterId: ADAPTER_ID });
    expectError(result, 'schema-failure');
  });

  it('returns schema-failure when JSON is an array, not object', () => {
    const raw = JSON.stringify([{ schemaVersion: SCHEMA_VERSION, type: 'noop' }]);
    const result = parseActionResponse(raw, { adapterId: ADAPTER_ID });
    expectError(result, 'schema-failure');
  });

  it('returns schema-failure when move direction is zero on both axes', () => {
    const raw = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      type: 'move',
      direction: { x: 0, y: 0 },
    });
    const result = parseActionResponse(raw, { adapterId: ADAPTER_ID });
    expectError(result, 'schema-failure');
  });

  it('returns output-cap when output exceeds maxOutputBytes', () => {
    const big = 'x'.repeat(64);
    const result = parseActionResponse(big, { adapterId: ADAPTER_ID, maxOutputBytes: 32 });
    expectError(result, 'output-cap');
  });

  it('default maxOutputBytes is 16 KiB and applies when option omitted', () => {
    expect(ADAPTER_DEFAULT_MAX_OUTPUT_BYTES).toBe(16 * 1024);
    const big = 'x'.repeat(ADAPTER_DEFAULT_MAX_OUTPUT_BYTES + 1);
    const result = parseActionResponse(big, { adapterId: ADAPTER_ID });
    expectError(result, 'output-cap');
  });

  it('counts bytes by UTF-8 length, not characters', () => {
    // Each emoji is 4 bytes in UTF-8; 8 emojis = 32 bytes which exceeds the cap.
    const raw = '😀'.repeat(8);
    const result = parseActionResponse(raw, { adapterId: ADAPTER_ID, maxOutputBytes: 31 });
    expectError(result, 'output-cap');
  });

  it('error messages are redacted (no /Users path leaks)', () => {
    // Force an invalid-json error with a sensitive-looking string in the input — we don't
    // include the raw input in the message, but if we did, it should be redacted.
    const raw = '{ "type": "/Users/somebody/secret/file.json" ';
    const result = parseActionResponse(raw, { adapterId: ADAPTER_ID });
    expectError(result, 'invalid-json');
    if (result.ok) return;
    expect(result.error.message).not.toContain('/Users/somebody/secret/file.json');
  });

  it('output-cap classifies as non-retryable', () => {
    const big = 'x'.repeat(64);
    const result = parseActionResponse(big, { adapterId: ADAPTER_ID, maxOutputBytes: 32 });
    if (result.ok) throw new Error('Expected error');
    expect(result.error.retryable).toBe(false);
  });

  it('schema-failure classifies as retryable (model can produce a different action next tick)', () => {
    const raw = JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'fly' });
    const result = parseActionResponse(raw, { adapterId: ADAPTER_ID });
    if (result.ok) throw new Error('Expected error');
    expect(result.error.retryable).toBe(true);
  });
});
