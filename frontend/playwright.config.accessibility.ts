import { defineConfig, devices } from '@playwright/test'

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './src/test/accessibility',
  /* Run tests in files in parallel */
  fullyParallel: false, // Sequential for accessibility tests
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Single worker for accessibility tests */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'accessibility-report' }],
    ['json', { outputFile: 'test-results/accessibility-results.json' }],
    ['junit', { outputFile: 'test-results/accessibility-results.xml' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    /* Record video for accessibility analysis */
    video: 'retain-on-failure',
    /* Reduce motion for accessibility testing */
    reducedMotion: 'reduce',
  },

  /* Configure projects for accessibility testing */
  projects: [
    {
      name: 'Desktop Accessibility',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Accessibility',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'High Contrast',
      use: { 
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
        extraHTTPHeaders: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  /* Global setup and teardown */
  globalSetup: './src/test/accessibility-setup.ts',

  /* Test timeout - longer for accessibility analysis */
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },

  /* Output directories */
  outputDir: 'test-results/accessibility',
})