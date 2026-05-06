import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { applyTick, createMatchState, hashMatchState } from '@fps-arena-bench/core';
import type { AcceptedActionInput } from '@fps-arena-bench/core';
import { MatchRecorder } from '@fps-arena-bench/replay';
import type { Action, MapDefinition, MatchConfig } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

import { buildOptions, findLeakedNodeBuiltins } from '../scripts/bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const VALID_HASH = `sha256:${'a'.repeat(64)}`;

const buildBundleSmokeMap = (): MapDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'bundle-smoke-arena',
  version: '0.1.0',
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

const buildBundleSmokeConfig = (): MatchConfig => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'bundle-smoke-match',
  rulesetVersion: 'ruleset.v0.1',
  map: { id: 'bundle-smoke-arena', version: '0.1.0', hash: VALID_HASH },
  seed: 1,
  maxTicks: 2,
  contenders: [
    { id: 'alpha', adapterId: 'mock-bot', displayName: 'Alpha' },
    { id: 'bravo', adapterId: 'mock-bot', displayName: 'Bravo' },
  ],
  actionTimeoutMs: 1_000,
  invalidActionPolicy: { maxInvalidActions: 3, fallbackAction: 'noop' },
  capture: { safeReplay: true, privateDebug: false },
});

const noop = (): Action => ({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

const buildSerializedReplay = (): string => {
  const map = buildBundleSmokeMap();
  const config = buildBundleSmokeConfig();
  const state = createMatchState({ config, map });
  const recorder = new MatchRecorder({
    matchId: config.id,
    config,
    map,
    initialPreTickHash: hashMatchState(state),
    timeoutBudgetMs: config.actionTimeoutMs,
  });

  while (state.status === 'in-progress') {
    const inputs: AcceptedActionInput[] = state.players
      .filter((player) => player.alive)
      .map((player) => ({ contenderId: player.contenderId, action: noop() }));
    const tick = state.tick;
    const result = applyTick(state, inputs);
    recorder.recordTick({ tick, inputs, result });
  }

  return JSON.stringify(recorder.build({ state }));
};

const importBundledLoaderSmoke = async (serializedReplay: string) => {
  const options = buildOptions({
    write: false,
    outfile: resolve(appRoot, 'dist/loader-smoke.bundle.test.js'),
    sourcemap: false,
    stdin: {
      contents: `
          import { loadReplayFromString } from './src/loader.ts';
          export const loaded = loadReplayFromString(${JSON.stringify(serializedReplay)});
        `,
      resolveDir: appRoot,
      sourcefile: 'loader-smoke-entry.ts',
    },
  });
  delete options.entryPoints;
  const result = await build(options);
  const bundleText = result.outputFiles![0]!.text;
  const encoded = Buffer.from(bundleText, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`) as Promise<{
    readonly loaded: {
      readonly ok: boolean;
      readonly timeline?: { readonly frames: readonly unknown[] };
      readonly error?: { readonly message: string };
    };
  }>;
};

describe('browser bundle config', () => {
  it('produces an in-memory ESM bundle with no node: builtins and no node:crypto string', async () => {
    const result = await build(
      buildOptions({
        write: false,
        outfile: resolve(appRoot, 'dist/entry.bundle.test.js'),
        sourcemap: false,
      }),
    );

    expect(findLeakedNodeBuiltins(result.metafile)).toEqual([]);

    expect(result.outputFiles).toBeDefined();
    expect(result.outputFiles!.length).toBeGreaterThan(0);
    const bundleText = result.outputFiles![0]!.text;

    expect(bundleText).not.toContain('node:crypto');
    expect(bundleText).toContain('REPLAY_VIEWER_ELEMENT_IDS');
    expect(bundleText).toContain('bootReplayViewerFromDocument');
  });

  it('writes only ES module syntax (no CommonJS require) for the browser', async () => {
    const result = await build(
      buildOptions({
        write: false,
        outfile: resolve(appRoot, 'dist/entry.bundle.test.js'),
        sourcemap: false,
      }),
    );

    const bundleText = result.outputFiles![0]!.text;
    expect(bundleText).not.toMatch(/\brequire\s*\(/);
    expect(bundleText).not.toMatch(/\bmodule\.exports\b/);
  });

  it('loads a safe replay through the browser-targeted bundle without calling node crypto', async () => {
    const mod = await importBundledLoaderSmoke(buildSerializedReplay());

    expect(mod.loaded.ok).toBe(true);
    expect(mod.loaded.timeline?.frames.length).toBeGreaterThan(1);
  });
});
