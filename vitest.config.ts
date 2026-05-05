import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@fps-arena-bench/schemas': new URL('./packages/schemas/src/index.ts', import.meta.url)
        .pathname,
      '@fps-arena-bench/contracts': new URL('./packages/contracts/src/index.ts', import.meta.url)
        .pathname,
      '@fps-arena-bench/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
      '@fps-arena-bench/bots': new URL('./packages/bots/src/index.ts', import.meta.url).pathname,
      '@fps-arena-bench/replay': new URL('./packages/replay/src/index.ts', import.meta.url)
        .pathname,
      '@fps-arena-bench/cli': new URL('./packages/cli/src/index.ts', import.meta.url).pathname,
      '@fps-arena-bench/web': new URL('./apps/web/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
  },
});
