import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./tests/integration/test-db";
import { E2E } from "./tests/e2e/env";

// E2E runs against the sims_test database on its own port so the development data is untouched.
const DATABASE_URL = testDatabaseUrl();

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  // First visits compile routes on demand in `next dev`, which can take several seconds on Windows.
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${E2E.port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /responsive/ },
    { name: "responsive", use: { ...devices["Desktop Chrome"] }, testMatch: /responsive/ },
  ],
  webServer: {
    // Prepare the test database first, then start the server against it.
    command: `node --import tsx tests/e2e/prepare-db.ts && ${process.env.E2E_PROD ? `npx next start -p ${E2E.port}` : `npx next dev -p ${E2E.port}`}`,
    url: `http://localhost:${E2E.port}/api/health`,
    reuseExistingServer: false,
    stdout: process.env.E2E_SERVER_LOG ? "pipe" : "ignore",
    stderr: "pipe",
    timeout: 240_000,
    env: { DATABASE_URL, DEMO_MODE: "true", STORAGE_DIR: E2E.storage, JOBS_INLINE: "true", APP_URL: `http://localhost:${E2E.port}` },
  },
});
