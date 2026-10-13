import { describe, expect, it } from "vitest";
import { assertDemoModeAllowed, DemoModeInProductionError, isDemoMode } from "./demo-guard";

describe("DEMO_MODE production block", () => {
  it("blocks DEMO_MODE=true in production", () => {
    expect(() => assertDemoModeAllowed({ NODE_ENV: "production", DEMO_MODE: "true" })).toThrow(DemoModeInProductionError);
    expect(() => isDemoMode({ NODE_ENV: "production", DEMO_MODE: "true" })).toThrow(DemoModeInProductionError);
  });

  it("allows production without demo mode", () => {
    expect(isDemoMode({ NODE_ENV: "production", DEMO_MODE: "false" })).toBe(false);
    expect(isDemoMode({ NODE_ENV: "production" })).toBe(false);
  });

  it("allows demo mode in development", () => {
    expect(isDemoMode({ NODE_ENV: "development", DEMO_MODE: "true" })).toBe(true);
  });

  it("does not fail `next build`, which also runs as production", () => {
    expect(() => assertDemoModeAllowed({ NODE_ENV: "production", DEMO_MODE: "true", NEXT_PHASE: "phase-production-build" })).not.toThrow();
  });
});
