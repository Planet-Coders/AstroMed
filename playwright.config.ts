import { defineConfig } from "@playwright/test";

/**
 * UI tests against the dev server and its database. `globalSetup` re-seeds the synthetic
 * crew (SIM-1) so every run starts from the same normal / missing / anomalous cases.
 * Uses the installed Microsoft Edge by default; set PW_CHANNEL=chromium to use Playwright's.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Removes the throwaway guest accounts the tests sign up with (see tests/e2e/testAccounts.ts).
  globalTeardown: "./tests/e2e/global-teardown.ts",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    channel: process.env.PW_CHANNEL ?? "msedge",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
