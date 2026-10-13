// Business reference formats. Pure formatting — sequence allocation lives in
// src/server/references.ts so it can run inside a database transaction.

export const REFERENCE_TIMEZONE = "Africa/Nairobi";

export function referenceYear(date: Date = new Date()): number {
  const year = new Intl.DateTimeFormat("en", { timeZone: REFERENCE_TIMEZONE, year: "numeric" }).format(date);
  return Number(year);
}

const pad = (n: number, width: number) => {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid sequence: ${n}`);
  return String(n).padStart(width, "0");
};

export const formatCaseRef = (year: number, seq: number) => `SIMS/${year}/${pad(seq, 4)}`;
export const formatSubFileRef = (caseRef: string, seq: number) => `${caseRef}/SF-${pad(seq, 2)}`;
export const formatEvidenceRef = (caseRef: string, seq: number) => `${caseRef}/EV-${pad(seq, 3)}`;
export const formatTaskRef = (caseRef: string, seq: number) => `${caseRef}/TSK-${pad(seq, 3)}`;
export const formatExpenseRef = (year: number, seq: number) => `EXP-${year}-${pad(seq, 5)}`;
export const formatAdvanceRef = (year: number, seq: number) => `ADV-${year}-${pad(seq, 4)}`;
export const formatRecoveryRef = (year: number, seq: number) => `REC-${year}-${pad(seq, 5)}`;
export const formatWriteOffRef = (year: number, seq: number) => `WO-${year}-${pad(seq, 4)}`;
export const formatStatementRef = (year: number, seq: number) => `FS-${year}-${pad(seq, 4)}`;
export const formatImportRef = (year: number, seq: number) => `IMP-${year}-${pad(seq, 5)}`;
export const formatBulkRef = (year: number, seq: number) => `BLK-${year}-${pad(seq, 5)}`;
export const formatDeletionRef = (year: number, seq: number) => `PDR-${year}-${pad(seq, 4)}`;
export const formatReportRef = (year: number, seq: number) => `RPT-${year}-${pad(seq, 5)}`;
export const formatAccessRequestRef = (year: number, seq: number) => `ACR-${year}-${pad(seq, 4)}`;
export const formatChangeRequestRef = (year: number, seq: number) => `CHG-${year}-${pad(seq, 5)}`;

/** Counter keys. Year-scoped keys restart numbering each year; case-scoped keys are per case. */
export const counterKeys = {
  case: (year: number) => `CASE:${year}`,
  expense: (year: number) => `EXP:${year}`,
  advance: (year: number) => `ADV:${year}`,
  recovery: (year: number) => `REC:${year}`,
  writeOff: (year: number) => `WO:${year}`,
  statement: (year: number) => `FS:${year}`,
  importBatch: (year: number) => `IMP:${year}`,
  bulk: (year: number) => `BLK:${year}`,
  deletion: (year: number) => `PDR:${year}`,
  report: (year: number) => `RPT:${year}`,
  accessRequest: (year: number) => `ACR:${year}`,
  changeRequest: (year: number) => `CHG:${year}`,
  subFile: (caseId: string) => `SF:${caseId}`,
  evidence: (caseId: string) => `EV:${caseId}`,
  task: (caseId: string) => `TSK:${caseId}`,
};
