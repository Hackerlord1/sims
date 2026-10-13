import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { Tx } from "@/server/db";
import {
  counterKeys,
  formatAccessRequestRef,
  formatAdvanceRef,
  formatChangeRequestRef,
  formatBulkRef,
  formatCaseRef,
  formatDeletionRef,
  formatEvidenceRef,
  formatExpenseRef,
  formatImportRef,
  formatRecoveryRef,
  formatReportRef,
  formatStatementRef,
  formatSubFileRef,
  formatTaskRef,
  formatWriteOffRef,
  referenceYear,
} from "@/lib/references";

type Db = Tx | PrismaClient;

/**
 * Atomically allocates the next value of a named counter.
 * INSERT … ON DUPLICATE KEY UPDATE takes an exclusive row lock that is held until the transaction
 * ends, so concurrent callers are serialised and can never receive the same value; the follow-up
 * SELECT reads this transaction's own write. MariaDB has no RETURNING for this statement, so both
 * statements must share a transaction: a transaction client is used as is, the bare client is
 * wrapped in one. Call inside the transaction that creates the referenced row so a rolled-back
 * create also rolls back the counter (no gaps from failures).
 */
export async function nextSequence(db: Db, key: string): Promise<number> {
  if ("$transaction" in db) return db.$transaction((tx) => nextSequence(tx, key));
  await db.$executeRaw`
    INSERT INTO \`ReferenceCounter\` (\`key\`, \`value\`, \`updatedAt\`)
    VALUES (${key}, 1, UTC_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE \`value\` = \`value\` + 1, \`updatedAt\` = UTC_TIMESTAMP(3)`;
  const rows = await db.$queryRaw<{ value: number | bigint }[]>`SELECT \`value\` FROM \`ReferenceCounter\` WHERE \`key\` = ${key}`;
  const value = rows[0]?.value;
  if (value === undefined) throw new Error(`Counter allocation failed for ${key}`);
  return Number(value);
}

type YearKind = "case" | "expense" | "advance" | "recovery" | "writeOff" | "statement" | "importBatch" | "bulk" | "deletion" | "report" | "accessRequest" | "changeRequest";
const YEAR_FORMAT: Record<YearKind, (year: number, seq: number) => string> = {
  case: formatCaseRef,
  expense: formatExpenseRef,
  advance: formatAdvanceRef,
  recovery: formatRecoveryRef,
  writeOff: formatWriteOffRef,
  statement: formatStatementRef,
  importBatch: formatImportRef,
  bulk: formatBulkRef,
  deletion: formatDeletionRef,
  report: formatReportRef,
  accessRequest: formatAccessRequestRef,
  changeRequest: formatChangeRequestRef,
};

/** Next year-scoped reference, e.g. EXP-2026-00012. */
export async function nextYearReference(db: Db, kind: YearKind): Promise<string> {
  const year = referenceYear();
  const seq = await nextSequence(db, counterKeys[kind](year));
  return YEAR_FORMAT[kind](year, seq);
}

type CaseKind = "subFile" | "evidence" | "task";
const CASE_FORMAT: Record<CaseKind, (caseRef: string, seq: number) => string> = {
  subFile: formatSubFileRef,
  evidence: formatEvidenceRef,
  task: formatTaskRef,
};

/** Next case-scoped reference, e.g. SIMS/2026/0001/TSK-004. Returns the sequence too. */
export async function nextCaseReference(db: Db, kind: CaseKind, c: { id: string; reference: string }) {
  const sequence = await nextSequence(db, counterKeys[kind](c.id));
  return { sequence, reference: CASE_FORMAT[kind](c.reference, sequence) };
}
