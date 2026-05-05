import {
  applyTick,
  createMatchState,
  hashMatchState,
  type AcceptedActionInput,
} from '@fps-arena-bench/core';
import { MatchRecorder } from '@fps-arena-bench/replay';
import type { Action, MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';
import { describe, expect, it } from 'vitest';

import {
  bindReplayFileInput,
  type FileInputBindingHost,
  type LoadFileResult,
  type ReplayFile,
  type ReplayFileInputElement,
} from './file-input-binding.js';
import { ReplayViewer } from './viewer.js';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildTestMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'file-input-arena',
  version: '0.3.0',
  width: 10,
  height: 10,
  spawns: [
    { id: 'alpha-spawn', contenderSlot: 0, position: { x: 2, y: 5 }, headingDegrees: 0 },
    { id: 'bravo-spawn', contenderSlot: 1, position: { x: 8, y: 5 }, headingDegrees: 180 },
  ],
  walls: [],
  pickups: [],
  symmetry: { kind: 'none' },
});

const buildTestConfig = (): MatchConfig => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'file-input-match',
  rulesetVersion: 'ruleset.v0.1',
  map: { id: 'file-input-arena', version: '0.3.0', hash: VALID_HASH },
  seed: 1,
  maxTicks: 4,
  contenders: [
    { id: 'alpha', adapterId: 'mock-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'mock-bot', displayName: 'Bravo' },
  ],
  actionTimeoutMs: 1_000,
  invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
  capture: { safeReplay: true, privateDebug: false },
});

const noop = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

const buildArtifact = () => {
  const map = buildTestMap();
  const config = buildTestConfig();
  const state = createMatchState({ config, map });
  const recorder = new MatchRecorder({
    matchId: config.id,
    config,
    map,
    initialPreTickHash: hashMatchState(state),
    timeoutBudgetMs: config.actionTimeoutMs,
  });
  for (let tick = 0; tick < config.maxTicks; tick += 1) {
    const inputs: AcceptedActionInput[] = state.players
      .filter((p) => p.alive)
      .map((p) => ({ contenderId: p.contenderId, action: noop() }));
    const beforeTick = state.tick;
    const result = applyTick(state, inputs);
    recorder.recordTick({ tick: beforeTick, inputs, result });
    if (state.status === 'finished') break;
  }
  return recorder.build({ state });
};

const buildArtifactJson = (): string => JSON.stringify(buildArtifact());

const createFakeFile = (
  name: string,
  content: string,
  overrideSize?: number,
): ReplayFile => ({
  name,
  size: overrideSize ?? content.length,
  text: () => Promise.resolve(content),
});

const createFailingFile = (name: string, size: number, error: Error): ReplayFile => ({
  name,
  size,
  text: () => Promise.reject(error),
});

interface FakeFileInput extends ReplayFileInputElement {
  fireChange(): void;
  setFiles(files: readonly ReplayFile[]): void;
  readonly listeners: Array<() => void>;
}

const createFakeFileInput = (): FakeFileInput => {
  const listeners: Array<() => void> = [];
  let pending: readonly ReplayFile[] = [];
  const input: FakeFileInput = {
    getFiles: () => pending,
    addEventListener(type, listener) {
      if (type === 'change') listeners.push(listener);
    },
    removeEventListener(type, listener) {
      if (type !== 'change') return;
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    },
    fireChange() {
      for (const listener of [...listeners]) listener();
    },
    setFiles(files) {
      pending = files;
    },
    listeners,
  };
  return input;
};

interface FakeHost extends FileInputBindingHost {
  fileInput: FakeFileInput;
}

const createFakeHost = (): FakeHost => ({
  fileInput: createFakeFileInput(),
});

describe('bindReplayFileInput', () => {
  it('emits a no-file error when change fires with no files selected', async () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const results: LoadFileResult[] = [];
    bindReplayFileInput(host, viewer, { onResult: (r) => results.push(r) });

    host.fileInput.fireChange();
    await Promise.resolve();

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('no-file');
      expect(result.file).toBeNull();
    }
    expect(viewer.getSnapshot().status).toBe('idle');
  });

  it('loads a valid replay file via loadFile and transitions the viewer to ready', async () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const binding = bindReplayFileInput(host, viewer);
    const file = createFakeFile('replay.safe.json', buildArtifactJson());

    const result = await binding.loadFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.status).toBe('ready');
      expect(result.file.name).toBe('replay.safe.json');
    }
    expect(viewer.getSnapshot().status).toBe('ready');
  });

  it('loads a valid replay file via the change event flow', async () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const results: LoadFileResult[] = [];
    bindReplayFileInput(host, viewer, { onResult: (r) => results.push(r) });

    const file = createFakeFile('replay.safe.json', buildArtifactJson());
    host.fileInput.setFiles([file]);
    host.fileInput.fireChange();
    await new Promise((r) => setTimeout(r, 0));

    expect(results).toHaveLength(1);
    expect(results[0]!.ok).toBe(true);
    expect(viewer.getSnapshot().status).toBe('ready');
  });

  it('rejects files larger than the configured maxBytes', async () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const binding = bindReplayFileInput(host, viewer, { maxBytes: 16 });
    const file = createFakeFile('big.json', 'a'.repeat(64));

    const result = await binding.loadFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('too-large');
      expect(result.error.message).toContain('16');
      expect(result.error.message).toContain('big.json');
    }
    expect(viewer.getSnapshot().status).toBe('idle');
  });

  it('rejects files larger than the default MAX_REPLAY_INPUT_BYTES', async () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const binding = bindReplayFileInput(host, viewer);
    const file = createFakeFile('huge.json', '', 64 * 1024 * 1024);

    const result = await binding.loadFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('too-large');
    }
  });

  it('returns a read-error and redacts local paths from the message', async () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const binding = bindReplayFileInput(host, viewer);
    const file = createFailingFile(
      'replay.safe.json',
      32,
      new Error('Could not open /Users/somebody/secret/replay.safe.json'),
    );

    const result = await binding.loadFile(file);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('read-error');
      expect(result.error.message).not.toContain('/Users/somebody');
      expect(result.error.message).not.toContain('secret/replay.safe.json');
    }
    expect(viewer.getSnapshot().status).toBe('idle');
  });

  it('only loads the first file when multiple files are selected', async () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const calls: string[] = [];
    const original = createFakeFile('first.json', buildArtifactJson());
    const wrappedFirst: ReplayFile = {
      ...original,
      text: () => {
        calls.push('first');
        return original.text();
      },
    };
    const second: ReplayFile = {
      name: 'second.json',
      size: 4,
      text: () => {
        calls.push('second');
        return Promise.resolve('null');
      },
    };
    bindReplayFileInput(host, viewer);

    host.fileInput.setFiles([wrappedFirst, second]);
    host.fileInput.fireChange();
    await new Promise((r) => setTimeout(r, 0));

    expect(calls).toEqual(['first']);
    expect(viewer.getSnapshot().status).toBe('ready');
  });

  it('forwards invalid JSON content into the viewer error state', async () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const binding = bindReplayFileInput(host, viewer);
    const file = createFakeFile('broken.json', '{not json');

    const result = await binding.loadFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.status).toBe('error');
      if (result.snapshot.status === 'error') {
        expect(result.snapshot.error.kind).toBe('invalid-json');
      }
    }
    expect(viewer.getSnapshot().status).toBe('error');
  });

  it('detaches the change listener on dispose', async () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const results: LoadFileResult[] = [];
    const binding = bindReplayFileInput(host, viewer, {
      onResult: (r) => results.push(r),
    });

    binding.dispose();

    expect(host.fileInput.listeners).toHaveLength(0);

    host.fileInput.setFiles([createFakeFile('replay.safe.json', buildArtifactJson())]);
    host.fileInput.fireChange();
    await new Promise((r) => setTimeout(r, 0));

    expect(results).toHaveLength(0);
    expect(viewer.getSnapshot().status).toBe('idle');
  });

  it('rejects loadFile calls after dispose', async () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const binding = bindReplayFileInput(host, viewer);
    binding.dispose();

    await expect(
      binding.loadFile(createFakeFile('replay.safe.json', buildArtifactJson())),
    ).rejects.toThrow(/disposed/i);
  });

  it('is idempotent across multiple dispose calls', () => {
    const viewer = new ReplayViewer();
    const host = createFakeHost();
    const binding = bindReplayFileInput(host, viewer);

    expect(() => {
      binding.dispose();
      binding.dispose();
    }).not.toThrow();
    expect(host.fileInput.listeners).toHaveLength(0);
  });
});
