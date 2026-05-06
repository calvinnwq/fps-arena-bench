import type { BuildOptions, Metafile } from 'esbuild';

export declare function buildOptions(overrides?: BuildOptions): BuildOptions;

export declare function findLeakedNodeBuiltins(metafile: Metafile | undefined): string[];
