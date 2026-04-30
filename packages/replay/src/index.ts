export const REPLAY_PACKAGE_VERSION = '0.0.0';

export {
  REDACTION_PLACEHOLDER,
  UNSAFE_PATTERNS,
  assertReplaySafe,
  findUnsafeMatchesInString,
  findUnsafeStrings,
  isReplaySafeString,
  redactArgs,
  redactEnv,
  redactString,
  redactValue,
} from './redaction.js';
export type {
  FindUnsafeStringsOptions,
  RedactEnvOptions,
  UnsafeMatch,
  UnsafePattern,
} from './redaction.js';

export { buildReplaySafeArtifact, buildResultSummary } from './writer.js';
export type {
  BuildReplaySafeArtifactOptions,
  BuildResultSummaryOptions,
  FinalStateSnapshot,
  RecordedAcceptedAction,
  RecordedTick,
  ReliabilityCounters,
} from './writer.js';

export { MatchRecorder } from './recorder.js';
export type { BuildArtifactOptions, MatchRecorderOptions, RecordTickOptions } from './recorder.js';

export {
  ReplayReconstructionError,
  parseReplaySafeArtifact,
  reconstructFromReplaySafeArtifact,
} from './reader.js';
export type { HashMismatch, ReconstructOptions, ReplayReconstructionResult } from './reader.js';

export { DEBUG_TRACE_FILENAME, createDebugTraceWriter } from './debug.js';
export type { DebugRecord, DebugTraceWriter, DebugTraceWriterOptions } from './debug.js';
