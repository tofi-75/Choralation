/** Keep account-mode tags and produce an inspectable merged case inventory. */
import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const root = resolve(import.meta.dirname, '../../..');
export default defineConfig({
  testDir: resolve(root, 'frontend/tests/e2e'),
  reporter: [
    ['html', { outputFolder: resolve(root, 'frontend/playwright-report'), open: 'never' }],
    ['json', { outputFile: resolve(root, '.cache/browser-merged.json') }],
  ],
});
