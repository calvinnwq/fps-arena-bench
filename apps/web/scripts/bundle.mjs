// Browser bundle script for the FPS Arena Bench replay viewer.
//
// Reads the TypeScript-compiled entry from dist/entry.js and emits a single
// browser-ready ESM bundle (dist/entry.bundle.js) that resolves the
// @fps-arena-bench/* workspace imports and tree-shakes Node-only code paths
// (e.g. hashMatchState's node:crypto import) out of the viewer.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');

export function buildOptions(overrides = {}) {
  const base = {
    entryPoints: [resolve(appRoot, 'dist/entry.js')],
    outfile: resolve(appRoot, 'dist/entry.bundle.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    sourcemap: true,
    minify: false,
    treeShaking: true,
    logLevel: 'silent',
    metafile: true,
    legalComments: 'none',
    // hashMatchState is the only Node-builtin caller in the engine and the
    // viewer never invokes it. Aliasing node:crypto to a throwing shim lets
    // esbuild resolve the import without dragging Node's crypto polyfill into
    // the browser bundle; the shim's Error makes any accidental future call
    // obvious instead of failing silently at module load.
    alias: {
      'node:crypto': resolve(here, 'node-crypto-shim.mjs'),
    },
  };
  return { ...base, ...overrides };
}

export function findLeakedNodeBuiltins(metafile) {
  return Object.keys(metafile?.inputs ?? {}).filter((file) => file.startsWith('node:'));
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const result = await build(buildOptions({ logLevel: 'info' }));
  const leaked = findLeakedNodeBuiltins(result.metafile);
  if (leaked.length > 0) {
    console.error(
      `Browser bundle leaked Node builtins: ${leaked.join(', ')}.\n` +
        'Trace the import chain back to its source and either tree-shake it or refactor.',
    );
    process.exit(1);
  }
}
