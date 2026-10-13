/**
 * Read-only integrity check of stored files (evidence, statements, signed statements, reports):
 * every StoredFile row must have its file on disk with the SHA-256 recorded at upload.
 * Run after restoring a backup, or on a schedule. Exits 1 if any file is missing or altered.
 *
 *   npm run verify-storage
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

async function hashFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function main() {
  const { prisma } = await import("@/server/db");
  const { keyToPath, fileExists } = await import("@/server/storage");
  let checked = 0;
  const missing: string[] = [];
  const altered: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.storedFile.findMany({
      take: 500,
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, storageKey: true, sha256: true, originalName: true },
    });
    if (!batch.length) break;
    for (const f of batch) {
      checked++;
      if (!(await fileExists(f.storageKey))) missing.push(`${f.id} (${f.originalName})`);
      else if ((await hashFile(keyToPath(f.storageKey))) !== f.sha256) altered.push(`${f.id} (${f.originalName})`);
    }
    cursor = batch.at(-1)!.id;
  }
  console.log(`Checked ${checked} stored file(s): ${missing.length} missing, ${altered.length} with a different SHA-256.`);
  for (const m of missing) console.log(`  MISSING  ${m}`);
  for (const a of altered) console.log(`  ALTERED  ${a}`);
  await prisma.$disconnect();
  process.exit(missing.length || altered.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
