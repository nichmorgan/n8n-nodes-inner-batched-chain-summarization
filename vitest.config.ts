import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      include: ['nodes/**/*.ts', 'utils/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**', '**/dist/**'],
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@utils': path.resolve(__dirname, 'utils'),
      'n8n-workflow': path.resolve(__dirname, 'test/mocks/n8n-workflow.ts'),
    },
  },
});