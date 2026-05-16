import { defineConfig, devices } from "@playwright/test";

/**
 * BASE_URL controls where tests run:
 *   local:   BASE_URL not set → http://localhost:3000 (dev server auto-started)
 *   staging: BASE_URL=https://your-staging.vercel.app (no dev server started)
 *   prod:    BASE_URL=https://propelrfp.com (no dev server started)
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const isRemote = !!process.env.BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Auth setup — runs first, saves storageState
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
    },
    // Main test suite — uses saved auth state
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],

  // Only start dev server when running locally (no BASE_URL set)
  ...(isRemote
    ? {}
    : {
        webServer: {
          command: "pnpm dev",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 60_000,
        },
      }),
});
