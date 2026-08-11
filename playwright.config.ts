import { defineConfig, devices } from '@playwright/test';

const localChromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './app/client/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    ...(localChromiumExecutable === undefined
      ? {}
      : { launchOptions: { executablePath: localChromiumExecutable } }),
  },
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://127.0.0.1:3000/api/health',
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        SERVER_CONFIGURATION_PATH: 'server_configuration.test.json',
        SESSION_HMAC_SECRET: 'playwright-session-secret-with-at-least-thirty-two-characters',
        RATE_LIMIT_HMAC_SECRET: 'playwright-rate-secret-with-at-least-thirty-two-characters',
        COOKIE_SECURE: 'false',
      },
    },
    {
      command: 'npm run dev:client',
      url: 'http://127.0.0.1:5173',
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: 'chromium-en',
      use: { ...devices['Desktop Chrome'], locale: 'en-US' },
    },
    {
      name: 'chromium-ru',
      use: { ...devices['Desktop Chrome'], locale: 'ru-RU' },
    },
    {
      name: 'chromium-touch',
      use: { ...devices['Desktop Chrome'], hasTouch: true, locale: 'en-US' },
    },
  ],
});
