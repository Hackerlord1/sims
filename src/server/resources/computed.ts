import "server-only";
import { prisma } from "@/server/db";
import type { Row } from "@/server/resources/hooks";
import type { ResourceDef } from "@/lib/resources/types";
import { advancePosition, COUNTED_EXPENSE_STATUSES, invoiceOutstanding, recordNetRecovery } from "@/lib/finance";
import { chequeWarnings } from "@/lib/cheque-warnings";
import { money, nonNegative, toDbString, ZERO } from "@/lib/money";

/** Derived values per row id. Every lookup is a single batched query — never one per row. */
export async function computeFields(r: ResourceDef, rows: Row[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  const ids = rows.map((row) => String(row.id));
  switch (r.key) {
    case "subfiles":
      for (const row of rows) {
        const count = (row._count as { invoices?: number; cheques?: number } | undefined) ?? {};
        out.set(String(row.id), { invoiceCount: count.invoices ?? 0, chequeCount: count.cheques ?? 0 });
      }
      break;

    case "invoices":
      for (const row of rows) {
        out.set(String(row.id), {
          amountOutstanding: toDbString(invoiceOutstanding({ invoiceAmount: row.invoiceAmount as string, amountPaid: row.amountPaid as string })),
        });
      }
      break;

    case "recoveries":
      for (const row of rows) {
        out.set(String(row.id), {
          netAmount: toDbString(recordNetRecovery({ grossAmount: row.grossAmount as string, recoveryCosts: row.recoveryCosts as string })),
        });
      }
      break;

    case "advances": {
      const spent = await prisma.expense.groupBy({
        by: ["advanceId", "status"],
        where: { advanceId: { in: ids }, isDeleted: false },
        _sum: { approvedAmount: true },
      });
      const actual = new Map<string, ReturnType<typeof money>>();
      for (const s of spent) {
        if (!s.advanceId || !COUNTED_EXPENSE_STATUSES.has(s.status)) continue;
        actual.set(s.advanceId, (actual.get(s.advanceId) ?? ZERO).plus(money(s._sum.approvedAmount)));
      }
      for (const row of rows) {
        const pos = advancePosition({
          amountIssued: row.amountIssued as string,
          amountReturned: row.amountReturned as string,
          actualExpenditure: actual.get(String(row.id)) ?? ZERO,
        });
        out.set(String(row.id), {
          actualExpenditure: toDbString(pos.actualExpenditure),
          unusedBalance: toDbString(pos.unusedBalance),
          additionalAmountDue: toDbString(pos.additionalAmountDue),
          outstandingBalance: toDbString(pos.outstandingBalance),
        });
      }
      break;
    }

    case "cheques": {
      const replacementIds = rows.map((row) => row.replacementChequeId).filter((v): v is string => typeof v === "string");
      const [recovered, links, tasks, replacements] = await Promise.all([
        prisma.recovery.groupBy({
          by: ["chequeId"],
          where: { chequeId: { in: ids }, status: "VERIFIED", isDeleted: false },
          _sum: { grossAmount: true },
        }),
        prisma.chequeInvoice.findMany({
          where: { chequeId: { in: ids }, invoice: { isDeleted: false } },
          select: { chequeId: true, invoice: { select: { invoiceAmount: true, amountPaid: true } } },
        }),
        prisma.task.groupBy({
          by: ["linkId"],
          where: { linkType: "CHEQUE", linkId: { in: ids }, isDeleted: false, status: { not: "CANCELLED" } },
          _count: { _all: true },
        }),
        replacementIds.length ? prisma.cheque.findMany({ where: { id: { in: replacementIds } }, select: { id: true, status: true, dateDishonoured: true } }) : Promise.resolve([]),
      ]);
      const recoveredBy = new Map(recovered.map((x) => [x.chequeId!, money(x._sum.grossAmount)]));
      const taskCount = new Map(tasks.map((t) => [t.linkId!, t._count._all]));
      const replacementBy = new Map(replacements.map((x) => [x.id, x]));
      for (const row of rows) {
        const id = String(row.id);
        const rec = recoveredBy.get(id) ?? ZERO;
        const warnings = chequeWarnings({
          status: String(row.status),
          amount: row.amount as string,
          dateDishonoured: row.dateDishonoured as Date | null,
          demandDeadline: row.demandDeadline as Date | null,
          linkedInvoices: links.filter((l) => l.chequeId === id).map((l) => l.invoice),
          followUpTasks: taskCount.get(id) ?? 0,
          replacement: row.replacementChequeId ? (replacementBy.get(String(row.replacementChequeId)) ?? null) : null,
        });
        out.set(id, {
          amountRecovered: toDbString(rec),
          outstandingBalance: toDbString(nonNegative(money(row.amount as string).minus(rec))),
          warningCount: warnings.length,
          warnings,
        });
      }
      break;
    }
  }
  return out;
}
