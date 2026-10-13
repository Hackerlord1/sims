// No "server-only" import: the seed script (plain Node) also uses this guard.

export class DemoModeInProductionError extends Error {
  constructor() {
    super("DEMO_MODE=true is not permitted when NODE_ENV=production. Refusing to start.");
    this.name = "DemoModeInProductionError";
  }
}

type EnvLike = Record<string, string | undefined>;

/**
 * Blocks DEMO_MODE in production. `next build` also runs with NODE_ENV=production, so the build
 * phase is exempt: the guard fires when the production server boots (instrumentation) and on
 * every sign-in attempt.
 */
export function assertDemoModeAllowed(e: EnvLike): void {
  if (e.NEXT_PHASE === "phase-production-build") return;
  if (e.NODE_ENV === "production" && e.DEMO_MODE === "true") throw new DemoModeInProductionError();
}

export function isDemoMode(e: EnvLike): boolean {
  assertDemoModeAllowed(e);
  return e.DEMO_MODE === "true";
}
