// Browser-bundle shim for the `node:crypto` import in
// @fps-arena-bench/core/src/hash.ts. The viewer never calls hashMatchState
// (it consumes already-validated replay artifacts and rebuilds via applyTick),
// so this stub exists purely to satisfy esbuild's resolver. If a future code
// path drags hashMatchState into the browser bundle, the thrown Error makes
// the regression visible at first call instead of failing at module load.

export function createHash() {
  throw new Error(
    'createHash is not available in the browser replay-viewer bundle; ' +
      'hashMatchState must only be called server-side.',
  );
}

export default { createHash };
