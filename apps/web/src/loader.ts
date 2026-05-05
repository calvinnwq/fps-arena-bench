import { redactString } from '@fps-arena-bench/replay';
import { validateReplaySafeArtifact } from '@fps-arena-bench/schemas';

import { ReplayTimelineError, buildReplayTimeline, type ReplayTimeline } from './timeline.js';

export const MAX_REPLAY_INPUT_BYTES = 32 * 1024 * 1024;

export type LoadReplayErrorKind =
  | 'invalid-json'
  | 'invalid-schema'
  | 'invalid-timeline'
  | 'unknown';

export interface LoadReplayError {
  readonly kind: LoadReplayErrorKind;
  readonly message: string;
}

export type LoadReplayResult =
  | { readonly ok: true; readonly timeline: ReplayTimeline }
  | { readonly ok: false; readonly error: LoadReplayError };

const sanitize = (message: string): string => redactString(message);

const fail = (kind: LoadReplayErrorKind, message: string): LoadReplayResult => ({
  ok: false,
  error: { kind, message: sanitize(message) },
});

export function loadReplayFromString(input: string): LoadReplayResult {
  if (typeof input !== 'string') {
    return fail('unknown', 'Replay input must be a string.');
  }
  if (input.length === 0) {
    return fail('invalid-json', 'Replay input is empty.');
  }
  if (input.length > MAX_REPLAY_INPUT_BYTES) {
    return fail('invalid-json', `Replay input exceeds the ${MAX_REPLAY_INPUT_BYTES} byte limit.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return fail('invalid-json', 'Replay file is not valid JSON.');
  }
  return loadReplayFromValue(parsed);
}

export function loadReplayFromValue(value: unknown): LoadReplayResult {
  let artifact: ReturnType<typeof validateReplaySafeArtifact>;
  try {
    artifact = validateReplaySafeArtifact(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Replay failed schema validation.';
    return fail('invalid-schema', message);
  }

  let timeline: ReplayTimeline;
  try {
    timeline = buildReplayTimeline(artifact);
  } catch (error) {
    if (error instanceof ReplayTimelineError) {
      return fail('invalid-timeline', error.message);
    }
    const message = error instanceof Error ? error.message : 'Replay failed to reconstruct.';
    return fail('unknown', message);
  }

  return { ok: true, timeline };
}
