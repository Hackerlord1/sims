import "server-only";
import type { ReportFormat } from "@prisma/client";
import { prisma } from "@/server/db";
import { audit, raiseAlert } from "@/server/audit";
import { requireCaseAccess, requirePermission } from "@/server/authz";
import { ApiError, badRequest, notFound } from "@/server/api/errors";
import { listMeta, ListResult } from "@/server/api/router";
import type { CurrentUser } from "@/server/auth/principal";
import { nextYearReference } from "@/server/references";
import { REPORT_MAP, REPORTS, type ReportFilters } from "@/server/reports/definitions";
import { renderDocx, renderPdf } from "@/server/reports/render";
import { attachment, toCsv, toXlsx } from "@/server/services/exporter";
import { readStoredFile, sha256, storeFile } from "@/server/storage";
import { assertMakerChecker, can } from "@/lib/permissions";

const MIME: Record<ReportFormat, string> = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  CSV: "text/csv; charset=utf-8",
};

export function reportCatalog(user: CurrentUser) {
  return REPORTS.filter((r) => can(user, "REPORTS", "VIEW") && can(user, r.module, "VIEW")).map((r) => ({
    key: r.key,
    title: r.title,
    description: r.description,
    requiresCase: Boolean(r.requiresCase),
    canExport: can(user, "REPORTS", "EXPORT"),
  }));
}

export async function generateReport(user: CurrentUser, input: { key: string; format: ReportFormat; filters: ReportFilters }) {
  const def = REPORT_MAP[input.key];
  if (!def) throw notFound("Report");
  await requirePermission(user, "REPORTS", "EXPORT");
  await requirePermission(user, def.module, "VIEW");
  if (def.requiresCase && !input.filters.caseId) throw badRequest("Choose a case for this report.");
  if (input.filters.caseId) await requireCaseAccess(user, input.filters.caseId, def.module, "VIEW");
  const data = await def.build(user, input.filters);
  const reference = await nextYearReference(prisma, "report");
  const c = input.filters.caseId ? await prisma.case.findUnique({ where: { id: input.filters.caseId }, select: { reference: true } }) : null;
  const filterText = [
    c ? `Case ${c.reference}` : "All accessible cases",
    input.filters.from ? `from ${input.filters.from.toISOString().slice(0, 10)}` : "",
    input.filters.to ? `to ${input.filters.to.toISOString().slice(0, 10)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const meta = { title: def.title, reference, generatedBy: user.fullName, generatedAt: new Date(), filters: filterText };
  const buffer =
    input.format === "PDF"
      ? await renderPdf(meta, data)
      : input.format === "DOCX"
        ? await renderDocx(meta, data)
        : input.format === "XLSX"
          ? await toXlsx(def.title, data.columns, data.rows, [def.title, `${reference} · ${filterText}`, ...data.summary])
          : Buffer.from(toCsv(data.columns, data.rows), "utf8");
  const ext = input.format.toLowerCase();
  const filename = `${def.key}-${reference}.${ext}`;
  await prisma.$transaction(async (tx) => {
    const stored = await storeFile(tx, { buffer, originalName: filename, mimeType: MIME[input.format], sha256: sha256(buffer), uploadedById: user.id, readOnly: true });
    await tx.generatedReport.create({
      data: {
        reference,
        caseId: input.filters.caseId ?? null,
        reportType: def.key,
        format: input.format,
        filters: { caseId: input.filters.caseId ?? null, from: input.filters.from?.toISOString() ?? null, to: input.filters.to?.toISOString() ?? null },
        rowCount: data.rows.length,
        fileId: stored.id,
        generatedById: user.id,
      },
    });
    await audit(
      {
        action: "reports.export",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "generatedReport",
        caseId: input.filters.caseId ?? null,
        details: { reference, report: def.key, format: input.format, rows: data.rows.length },
      },
      tx,
    );
  });
  if (data.rows.length > 5000)
    await raiseAlert({ type: "LARGE_EXPORT", severity: "WARNING", message: `${user.username} exported report ${def.title} with ${data.rows.length} rows.`, subjectUserId: user.id });
  return attachment(buffer, filename, MIME[input.format]);
}

export async function listReports(user: CurrentUser, page: number, pageSize: number) {
  await requirePermission(user, "REPORTS", "VIEW");
  const where = user.role === "SYSTEM_ADMIN" || can(user, "AUDIT", "VIEW_AUDIT_LOGS") ? {} : { generatedById: user.id };
  const [total, rows] = await Promise.all([
    prisma.generatedReport.count({ where }),
    prisma.generatedReport.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.flatMap((r) => [r.generatedById, r.approvedById].filter(Boolean) as string[]))] } },
    select: { id: true, fullName: true },
  });
  const names = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
  return new ListResult(
    rows.map((r) => ({ ...r, title: REPORT_MAP[r.reportType]?.title ?? r.reportType, generatedBy: names[r.generatedById] ?? "Unknown", approvedBy: r.approvedById ? names[r.approvedById] : null })),
    listMeta(page, pageSize, total),
  );
}

export async function downloadReport(user: CurrentUser, id: string) {
  await requirePermission(user, "REPORTS", "EXPORT");
  const r = await prisma.generatedReport.findUnique({ where: { id } });
  if (!r || !r.fileId) throw notFound("Report");
  if (r.generatedById !== user.id && !can(user, "AUDIT", "VIEW_AUDIT_LOGS") && user.role !== "SYSTEM_ADMIN") throw notFound("Report");
  if (r.caseId) await requireCaseAccess(user, r.caseId, REPORT_MAP[r.reportType]?.module ?? "REPORTS", "VIEW");
  const f = await prisma.storedFile.findUniqueOrThrow({ where: { id: r.fileId } });
  const buffer = await readStoredFile(f.storageKey);
  if (sha256(buffer) !== f.sha256) throw new ApiError(409, "PROTECTED_RECORD", "The stored report failed its integrity check.");
  await audit({ action: "reports.download", actorId: user.id, actorLabel: user.username, entityType: "generatedReport", entityId: id, caseId: r.caseId });
  return attachment(buffer, f.originalName, f.mimeType);
}

/** Marks a generated report as the approved final version. It then cannot be changed or deleted. */
export async function approveFinalReport(user: CurrentUser, id: string) {
  await requirePermission(user, "DECISIONS", "APPROVE");
  const r = await prisma.generatedReport.findUnique({ where: { id } });
  if (!r) throw notFound("Report");
  if (r.isFinal) throw new ApiError(409, "CONFLICT", "This report is already the approved final version.");
  assertMakerChecker(r.generatedById, user.id);
  await prisma.$transaction(async (tx) => {
    await tx.generatedReport.update({ where: { id }, data: { isFinal: true, approvedById: user.id, approvedAt: new Date() } });
    await audit({ action: "reports.approve_final", actorId: user.id, actorLabel: user.username, entityType: "generatedReport", entityId: id, caseId: r.caseId }, tx);
  });
  return { isFinal: true };
}
