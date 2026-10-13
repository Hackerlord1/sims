import "server-only";
import type { Job, Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/server/db";

export type JobType = "STATEMENT_PARSE" | "IMPORT_COMMIT" | "REMINDER_SWEEP";
export const MAX_ATTEMPTS = 3;

export async function enqueue(db: Tx | typeof prisma, type: JobType, payload: Prisma.InputJsonValue, runAfter = new Date()) {
  return db.job.create({ data: { type, payload, runAfter } });
}

/**
 * Claims the next due job. SKIP LOCKED lets several workers run without taking the same job: the
 * row stays locked until the claim commits, and other workers skip it rather than wait.
 * (MariaDB has no UPDATE … RETURNING and cannot select from the updated table in a subquery, so
 * the lock and the update are two statements in one transaction.)
 */
export async function claimNext(): Promise<Job | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM \`Job\`
      WHERE \`status\` = 'QUEUED' AND \`runAfter\` <= UTC_TIMESTAMP(3)
      ORDER BY \`createdAt\`
      LIMIT 1
      FOR UPDATE SKIP LOCKED`;
    const id = rows[0]?.id;
    if (!id) return null;
    return tx.job.update({ where: { id }, data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date() } });
  });
}

export async function complete(id: string, result: Prisma.InputJsonValue) {
  await prisma.job.update({ where: { id }, data: { status: "SUCCEEDED", result, finishedAt: new Date(), lastError: null } });
}

export async function fail(job: Job, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  const retry = job.attempts < MAX_ATTEMPTS;
  await prisma.job.update({
    where: { id: job.id },
    data: retry ? { status: "QUEUED", lastError: message, runAfter: new Date(Date.now() + 2 ** job.attempts * 5_000) } : { status: "FAILED", lastError: message, finishedAt: new Date() },
  });
  return retry;
}

/** Jobs left RUNNING by a crashed worker are returned to the queue. */
export async function recoverStale(olderThanMs = 15 * 60_000) {
  await prisma.job.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - olderThanMs) } },
    data: { status: "QUEUED" },
  });
}
