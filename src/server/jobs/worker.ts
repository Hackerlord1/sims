import "server-only";
import type { Job, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { claimNext, complete, enqueue, fail, recoverStale } from "@/server/jobs/queue";

type Handler = (payload: Record<string, unknown>) => Promise<unknown>;

const HANDLERS: Record<string, () => Promise<Handler>> = {
  STATEMENT_PARSE: async () => {
    const { runStatementParse } = await import("@/server/statements/service");
    return (p) => runStatementParse(String(p.statementId));
  },
  IMPORT_COMMIT: async () => {
    const { commitImportJob } = await import("@/server/imports/service");
    return (p) => commitImportJob(String(p.batchId), String(p.userId));
  },
  REMINDER_SWEEP: async () => {
    const { runReminderSweep } = await import("@/server/services/reminders");
    return () => runReminderSweep();
  },
};

async function runOne(job: Job) {
  try {
    const handler = await HANDLERS[job.type]?.();
    if (!handler) throw new Error(`No handler for job type ${job.type}`);
    const result = await handler((job.payload ?? {}) as Record<string, unknown>);
    await complete(job.id, (result ?? {}) as Prisma.InputJsonValue);
  } catch (e) {
    const retrying = await fail(job, e);
    console.error(
      JSON.stringify({ level: "error", at: new Date().toISOString(), job: job.id, type: job.type, attempt: job.attempts, retrying, error: e instanceof Error ? e.message.slice(0, 300) : "unknown" }),
    );
  }
}

/** Drains due jobs. Returns how many ran. */
export async function drainQueue(max = 20): Promise<number> {
  let n = 0;
  while (n < max) {
    const job = await claimNext();
    if (!job) break;
    await runOne(job);
    n++;
  }
  return n;
}

const REMINDER_INTERVAL_MS = 15 * 60_000;

/** Ensures one reminder sweep is queued per interval, however many workers are running. */
async function scheduleReminderSweep() {
  const recent = await prisma.job.findFirst({
    where: { type: "REMINDER_SWEEP", createdAt: { gte: new Date(Date.now() - REMINDER_INTERVAL_MS) } },
    select: { id: true },
  });
  if (!recent) await enqueue(prisma, "REMINDER_SWEEP", {});
}

let started = false;

/** Starts the in-process worker loop (used by the web server and by `npm run worker`). */
export function startWorker(opts: { pollMs?: number } = {}) {
  if (started) return;
  started = true;
  const pollMs = opts.pollMs ?? 2_000;
  let busy = false;
  let lastMaintenance = 0;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (Date.now() - lastMaintenance > 60_000) {
        lastMaintenance = Date.now();
        await recoverStale();
        await scheduleReminderSweep();
      }
      await drainQueue();
    } catch (e) {
      console.error(JSON.stringify({ level: "error", at: new Date().toISOString(), worker: "tick", error: e instanceof Error ? e.message.slice(0, 300) : "unknown" }));
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), pollMs);
  timer.unref?.();
  void tick();
}
