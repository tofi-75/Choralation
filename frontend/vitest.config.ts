/** DOM-level tests exercise visible auth/error behavior without a browser server. */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // Bound jsdom memory/CPU so local browser checks and CI remain deterministic.
    maxWorkers: 2,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
