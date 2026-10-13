// Node.js-only startup: refuse DEMO_MODE in production, then start the background job worker.
export async function registerNode() {
  const { assertDemoModeAllowed, DemoModeInProductionError } = await import("@/server/demo-guard");
  try {
    assertDemoModeAllowed(process.env);
  } catch (e) {
    if (e instanceof DemoModeInProductionError) {
      console.error(`[SIMS] FATAL: ${e.message}`);
      // Try to leave a security alert for administrators; never block shutdown on it.
      try {
        const { createPrismaClient } = await import("@/server/prisma-client");
        const db = createPrismaClient();
        await db.securityAlert.create({ data: { type: "DEMO_MODE_IN_PRODUCTION", severity: "CRITICAL", message: e.message } });
        await db.$disconnect();
      } catch {
        /* database may be unreachable */
      }
      process.exit(1);
    }
    throw e;
  }
  if (process.env.DEMO_MODE === "true") {
    console.warn("[SIMS] DEMO MODE is active. The development administrator account is enabled. Do not use with real data.");
  }
  // Statement parsing, large imports and reminder sweeps run off the request path. Set
  // JOBS_INLINE=false when a separate `npm run worker` process handles them.
  if (process.env.JOBS_INLINE !== "false" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startWorker } = await import("@/server/jobs/worker");
    startWorker();
  }
}
