#!/usr/bin/env node
/**
 * Production entrypoint for cPanel's "Setup Node.js App".
 *
 * cPanel assigns PORT dynamically, requires binding to 0.0.0.0, and sends SIGTERM
 * on restart — this server handles all three.
 *
 * Run the preflight script BEFORE this file (see package.json "start" script).
 */

// 1. NODE_ENV must be set BEFORE requiring Next.js, otherwise it boots in dev mode.
process.env.NODE_ENV = process.env.NODE_ENV || "production";

// 2. Load .env files exactly like Next.js does in production.
//    @next/env is a transitive dependency of next, so it's already installed.
const path = require("node:path");
const nextEnv = require("@next/env");
nextEnv.loadEnvConfig(__dirname, false /* dev = false, i.e. production rules */);

// 3. Defence-in-depth: refuse to start with DEMO_MODE=true in production.
//    (Mirrors scripts/preflight.mjs — belt and braces, in case preflight was skipped.)
if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "true") {
  console.error("[SIMS] FATAL: DEMO_MODE=true is not permitted when NODE_ENV=production.");
  process.exit(1);
}

// 4. Now safe to require Next.js and start the server.
const http = require("node:http");
const next = require("next");

const port = parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      // Next.js also handles its own URL parsing; passing true gives query object.
      handle(req, res).catch((err) => {
        console.error("[SIMS] Request handler error:", err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });
    });

    // cPanel/Passenger may proxy WebSocket upgrade requests; Next handles them fine.
    server.on("upgrade", (req, socket, head) => {
      // If you later add WebSocket support, wire it here.
      socket.destroy();
    });

    server.listen(port, hostname, () => {
      console.log(`[SIMS] Ready on http://${hostname}:${port}`);
    });

    // Graceful shutdown — Passenger sends SIGTERM on restart.
    const shutdown = (signal) => {
      console.log(`[SIMS] Received ${signal}, closing server…`);
      server.close(() => {
        console.log("[SIMS] Server closed. Bye.");
        process.exit(0);
      });
      // Force-exit if connections don't drain within 10s.
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error("[SIMS] Failed to start Next.js:", err);
    process.exit(1);
  });
