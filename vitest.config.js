import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.js'],
    pool: 'vmThreads',
    poolOptions: {
      vmThreads: {
        singleThread: true,
      },
    },
  },
});
