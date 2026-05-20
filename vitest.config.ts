import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src/renderer/src') },
  },
  test: {
    globals: true,
    environment: 'node', // default; overridden below
    sequence: { shuffle: true },
    environmentMatchGlobs: [
      ['src/renderer/**', 'jsdom'],
      ['src/main/**', 'node'],
      ['src/preload/**', 'jsdom'], // preload runs in renderer-side context
      ['src/shared/**', 'node'],
    ],
    setupFiles: ['src/test/setup.ts'],
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.tsx',
      'src/**/__tests__/**/*.property.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/main/**', 'src/preload/**', 'src/renderer/src/**'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.property.test.ts',
        '**/__tests__/**',
        'src/renderer/src/data/chineseRecipes.ts',
        'src/renderer/src/data/westernRecipes.ts',
        'src/renderer/src/main.tsx',
        '**/*.css',
      ],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 75,
        statements: 80,
        'src/renderer/src/components/**': {
          lines: 50,
          branches: 40,
          functions: 50,
          statements: 50,
        },
        'src/renderer/src/pages/**': {
          lines: 50,
          branches: 40,
          functions: 50,
          statements: 50,
        },
      },
    },
  },
})
