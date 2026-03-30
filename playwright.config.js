const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './',
  testMatch: ['tests/**/*.spec.js', 'custom-packs/**/tests/**/*.spec.js'],
  fullyParallel: false,
  workers: 1,
  timeout: 300000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:1403',
    trace: 'on-first-retry',
    video: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required']
        }
      },
    },
  ],
});
