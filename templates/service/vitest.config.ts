import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage',
      experimentalAstAwareRemapping: true,
      all: true,
      include: ['src/**'],
      exclude: ['**/*.d.ts', 'test/**', 'dist/**', 'src/server.ts', 'src/smoke.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 65,
        statements: 80,
      },
    },
  },
})
