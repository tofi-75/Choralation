/** Real-backend smoke gate; browser profiles and artifacts stay in the project. */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--disable-crash-reporter', '--disable-breakpad'],
    },
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    ...[360, 430].map((width) => ({
      name: `mobile-${width}`,
      use: {
        browserName: 'chromium' as const,
        viewport: { width, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    })),
  ],
  webServer: [
    {
      command:
        '"..\\.venv\\Scripts\\python.exe" -B ..\\backend\\manage.py runserver 127.0.0.1:8001 --noreload',
      url: 'http://127.0.0.1:8001/health/ready/',
      env: { CSRF_TRUSTED_ORIGINS: 'http://127.0.0.1:5174' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        '"..\\.local\\node\\node.exe" node_modules\\vite\\bin\\vite.js --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174',
      env: { BACKEND_ORIGIN: 'http://127.0.0.1:8001' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
