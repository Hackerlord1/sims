import "server-only";
import type { Prisma } from "@prisma/client";
import type { prisma as Client, Tx } from "@/server/db";

type Db = Tx | typeof Client;
type NotificationRow = Prisma.NotificationCreateManyInput & { dedupeKey: string };

/**
 * Creates notifications, skipping any whose (userId, dedupeKey) already exists or repeats within
 * the batch. Replaces `createMany({ skipDuplicates: true })`, which on MariaDB is INSERT IGNORE: that
 * also turns other errors (over-long values, constraint failures) into silently dropped rows.
 * Here only known duplicates are skipped; any other failure is raised.
 * Returns the number of notifications created.
 */
export async function createNotifications(db: Db, rows: NotificationRow[]): Promise<number> {
  const unique = new Map<string, NotificationRow>();
  for (const r of rows) unique.set(`${r.userId}\u0000${r.dedupeKey}`, r);
  if (!unique.size) return 0;
  const keys = [...new Set([...unique.values()].map((r) => r.dedupeKey))];
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 1000) {
    const found = await db.notification.findMany({ where: { dedupeKey: { in: keys.slice(i, i + 1000) } }, select: { userId: true, dedupeKey: true } });
    for (const f of found) existing.add(`${f.userId}\u0000${f.dedupeKey}`);
  }
  const fresh = [...unique.entries()].filter(([k]) => !existing.has(k)).map(([, r]) => r);
  let created = 0;
  for (let i = 0; i < fresh.length; i += 1000) {
    created += (await db.notification.createMany({ data: fresh.slice(i, i + 1000) })).count;
  }
  return created;
}
