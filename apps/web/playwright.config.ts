import { defineConfig, devices } from '@playwright/test'

// Test infrastructure ports (matching docker-compose.test.yml and .env.test)
const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://smoker:smoker_dev@localhost:5433/smoker_test'
const TEST_REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380/1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `DATABASE_URL=${TEST_DB_URL} REDIS_URL=${TEST_REDIS_URL} npm run dev -w @smoker/api`,
      port: 4000,
      reuseExistingServer: !process.env.CI,
      cwd: '../..',
    },
    {
      command: 'npm run dev -w @smoker/web',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      cwd: '../..',
    },
  ],
})
