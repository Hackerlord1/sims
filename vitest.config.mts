import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// "server-only" throws outside the React server condition; stub it for tests.
const serverOnlyStub = fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url));

export default defineConfig({
  resolve: { tsconfigPaths: true, alias: { "server-only": serverOnlyStub } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: { name: "component", include: ["src/**/*.test.tsx"], environment: "jsdom", setupFiles: ["tests/component-setup.ts"] },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/env.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
