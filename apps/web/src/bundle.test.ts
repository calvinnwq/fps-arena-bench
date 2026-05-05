import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildOptions, findLeakedNodeBuiltins } from '../scripts/bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');

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
});
