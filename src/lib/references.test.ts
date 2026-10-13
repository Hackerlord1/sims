import { describe, expect, it } from "vitest";
import {
  formatAdvanceRef,
  formatCaseRef,
  formatDeletionRef,
  formatEvidenceRef,
  formatExpenseRef,
  formatImportRef,
  formatRecoveryRef,
  formatSubFileRef,
  formatTaskRef,
  formatWriteOffRef,
  referenceYear,
} from "./references";

describe("reference formats", () => {
  const caseRef = formatCaseRef(2026, 1);
  it("formats every reference type", () => {
    expect(caseRef).toBe("SIMS/2026/0001");
    expect(formatSubFileRef(caseRef, 1)).toBe("SIMS/2026/0001/SF-01");
    expect(formatEvidenceRef(caseRef, 1)).toBe("SIMS/2026/0001/EV-001");
    expect(formatTaskRef(caseRef, 1)).toBe("SIMS/2026/0001/TSK-001");
    expect(formatExpenseRef(2026, 1)).toBe("EXP-2026-00001");
    expect(formatAdvanceRef(2026, 1)).toBe("ADV-2026-0001");
    expect(formatRecoveryRef(2026, 1)).toBe("REC-2026-00001");
    expect(formatWriteOffRef(2026, 1)).toBe("WO-2026-0001");
    expect(formatImportRef(2026, 1)).toBe("IMP-2026-00001");
    expect(formatDeletionRef(2026, 1)).toBe("PDR-2026-0001");
  });

  it("grows past the padding width rather than truncating", () => {
    expect(formatCaseRef(2026, 12345)).toBe("SIMS/2026/12345");
  });

  it("rejects invalid sequences", () => {
    expect(() => formatCaseRef(2026, 0)).toThrow();
    expect(() => formatCaseRef(2026, 1.5)).toThrow();
  });

  it("uses the Nairobi calendar year", () => {
    // 21:30 UTC on 31 Dec is already 1 Jan in Nairobi (UTC+3).
    expect(referenceYear(new Date("2026-12-31T21:30:00Z"))).toBe(2027);
    expect(referenceYear(new Date("2026-12-31T20:30:00Z"))).toBe(2026);
  });
});
