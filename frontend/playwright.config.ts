/** Real-backend smoke gate; browser profiles and artifacts stay in the project. */
import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { backendOrigin, backendPort, browserOrigin, frontendPort } from './tests/test-server';

const windows = process.platform === 'win32';
const python = windows ? '"..\\.venv\\Scripts\\python.exe"' : 'python';
const vite = windows
  ? '"..\\.local\\node\\node.exe" node_modules\\vite\\bin\\vite.js'
  : 'node node_modules/vite/bin/vite.js';
const reports = process.env.E2E_REPORT_DIR;

export default defineConfig({
  testDir: './tests/e2e',
  tag: process.env.E2E_SIMPLE_ACCOUNTS === 'true' ? '@simple' : '@email',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['./tests/contracts/reporter.ts'],
    ...(reports ? [['blob', { outputDir: resolve(reports, 'blob') }] as const] : []),
  ],
  outputDir: reports ? resolve(reports, 'artifacts') : './test-results',
  use: {
    baseURL: browserOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
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
      command: `${python} -B ../backend/manage.py runserver 127.0.0.1:${backendPort} --noreload`,
      url: `${backendOrigin}/health/ready/`,
      env: {
        DJANGO_SETTINGS_MODULE: 'config.browser_test_settings',
        CSRF_TRUSTED_ORIGINS: browserOrigin,
        MARONITE_FEED_ENABLED: 'false',
        ACCOUNT_REGISTRATION_ENABLED: 'true',
        ACCOUNT_EMAIL_VERIFICATION_ENABLED:
          process.env.E2E_SIMPLE_ACCOUNTS === 'true' ? 'false' : 'true',
        ACCOUNT_PASSWORD_RESET_ENABLED:
          process.env.E2E_SIMPLE_ACCOUNTS === 'true' ? 'false' : 'true',
        ACCOUNT_VERIFICATION_REQUIRED: 'false',
        APP_PUBLIC_URL: browserOrigin,
        EMAIL_BACKEND: 'django.core.mail.backends.filebased.EmailBackend',
        EMAIL_FILE_PATH: process.env.EMAIL_FILE_PATH ?? resolve('../.cache/e2e-emails'),
        DJANGO_STORAGE_BACKEND: 'local',
        DJANGO_MEDIA_ROOT: process.env.E2E_MEDIA_ROOT ?? resolve('../.cache/e2e-media'),
        ACCOUNT_LOGIN_LIMIT: '1000',
        ACCOUNT_LOGIN_GLOBAL_LIMIT: '10000',
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `${vite} preview --host 127.0.0.1 --port ${frontendPort}`,
      url: browserOrigin,
      env: { BACKEND_ORIGIN: backendOrigin },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
