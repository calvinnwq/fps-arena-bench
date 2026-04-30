import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@fps-arena-bench/schemas': new URL('./packages/schemas/src/index.ts', import.meta.url)
        .pathname,
      '@fps-arena-bench/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
  },
});
