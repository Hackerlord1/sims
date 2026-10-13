import { defineConfig, devices } from "@playwright/test";
import { PROD } from "./tests/e2e-prod/env";

// Production-mode smoke tests: `next start` on a production build (run `npm run build` first), with
// DEMO_MODE=false and a fresh sims_e2e_prod database bootstrapped by `npm run create-admin`.
export default defineConfig({
  testDir: "tests/e2e-prod",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PROD.port}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: `node --import tsx tests/e2e-prod/prepare.ts && npx next start -p ${PROD.port}`,
    url: `http://localhost:${PROD.port}/api/health`,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 240_000,
    env: {
      NODE_ENV: "production",
      DATABASE_URL: PROD.databaseUrl(),
      DEMO_MODE: "false",
      STORAGE_DIR: PROD.storage,
      JOBS_INLINE: "true",
      APP_URL: `http://localhost:${PROD.port}`,
    },
  },
});
