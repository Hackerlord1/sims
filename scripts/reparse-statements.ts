// Re-parses every statement (or those given as arguments) using the configured parser.
// Usage: npm run reparse [statementId ...]
import { prisma } from "../src/server/db";
import { runStatementParse } from "../src/server/statements/service";

async function main() {
  // The app's own client: runStatementParse uses it too, so there is one MariaDB pool to close.
  const ids = process.argv.slice(2);
  const rows = await prisma.financialStatement.findMany({ where: ids.length ? { id: { in: ids } } : { isDeleted: false }, select: { id: true, reference: true } });
  for (const r of rows) {
    const res = await runStatementParse(r.id);
    console.log(r.reference, JSON.stringify(res));
  }
}
main()
  .catch((e: unknown) => {
    console.error("Re-parse failed:", e instanceof Error ? e.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
