#!/usr/bin/env node
// Runs before `next start`. Loads env files exactly as Next.js does (production mode) and refuses
// to launch with DEMO_MODE=true. Defence in depth alongside src/instrumentation-node.ts and the
// sign-in guard.
import nextEnv from "@next/env";
import { resolve } from "node:path";

process.env.NODE_ENV ??= "production";
nextEnv.loadEnvConfig(resolve(import.meta.dirname, ".."), false);

if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "true") {
  console.error("[SIMS] FATAL: DEMO_MODE=true is not permitted when NODE_ENV=production. Set DEMO_MODE=false before starting.");
  process.exit(1);
}
