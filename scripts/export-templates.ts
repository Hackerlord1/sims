/**
 * Writes every bulk-import template (CSV and Excel with a guide sheet) to samples/templates/ — the
 * same files the Data Administration Centre offers for download.
 *
 *   npm run templates
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const { IMPORTABLE } = await import("@/lib/imports");
  const { buildTemplate } = await import("@/server/imports/service");
  const dir = path.resolve(__dirname, "../samples/templates");
  mkdirSync(dir, { recursive: true });
  for (const key of IMPORTABLE) {
    for (const format of ["csv", "xlsx"] as const) {
      const t = await buildTemplate(key, format);
      writeFileSync(path.join(dir, t.filename), t.body);
    }
  }
  console.log(`Wrote ${IMPORTABLE.length * 2} templates to samples/templates/.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
