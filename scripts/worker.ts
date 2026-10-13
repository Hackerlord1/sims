// Standalone background worker: `npm run worker`. Runs with the react-server condition so
// server-only modules load outside Next.js.
import { startWorker } from "../src/server/jobs/worker";

console.log("[SIMS] Worker started. Processing statement parsing, large imports and reminders.");
startWorker({ pollMs: 1500 });
setInterval(() => undefined, 1 << 30);
