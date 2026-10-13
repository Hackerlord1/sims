import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { listMeta, ListResult, paginationQuery, type Router } from "@/server/api/router";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { requirePermission } from "@/server/authz";
import { exportResponse } from "@/server/services/exporter";

const auditQuery = paginationQuery.extend({
  caseId: z.string().max(64).optional(),
  actorId: z.string().max(64).optional(),
  action: z.string().max(100).optional(),
  entityType: z.string().max(64).optional(),
  entityId: z.string().max(64).optional(),
  outcome: z.enum(["SUCCESS", "DENIED", "FAILURE"]).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
});

function where(q: z.output<typeof auditQuery>): Prisma.AuditLogWhereInput {
  const at: Prisma.DateTimeFilter = {};
  if (q.from && !Number.isNaN(Date.parse(q.from))) at.gte = new Date(q.from);
  if (q.to && !Number.isNaN(Date.parse(q.to))) {
    const t = new Date(q.to);
    t.setUTCHours(23, 59, 59, 999);
    at.lte = t;
  }
  return {
    ...(q.caseId ? { caseId: q.caseId } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.action ? { action: { contains: q.action } } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.outcome ? { outcome: q.outcome } : {}),
    ...(at.gte || at.lte ? { at } : {}),
    ...(q.q ? { OR: [{ actorLabel: { contains: q.q } }, { action: { contains: q.q } }, { reason: { contains: q.q } }] } : {}),
  };
}

export function registerAudit(router: Router) {
  router.add({
    method: "GET",
    path: "/audit-logs",
    summary: "Immutable audit log (filter by case, actor, action, entity, outcome, date)",
    tags: ["Audit"],
    query: auditQuery,
    async handler({ user, query }) {
      await requirePermission(user, "AUDIT", "VIEW_AUDIT_LOGS");
      const w = where(query);
      const [total, rows] = await Promise.all([
        prisma.auditLog.count({ where: w }),
        prisma.auditLog.findMany({ where: w, orderBy: [{ at: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      ]);
      return new ListResult(rows, listMeta(query.page, query.pageSize, total));
    },
  });

  router.add({
    method: "POST",
    path: "/audit-logs/export",
    summary: "Export audit log entries matching the filters (CSV or XLSX)",
    tags: ["Audit"],
    body: auditQuery.extend({ format: z.enum(["csv", "xlsx"]).default("csv") }),
    rateLimitPerMinute: 10,
    async handler({ user, body }) {
      await requirePermission(user, "AUDIT", "EXPORT");
      const rows = await prisma.auditLog.findMany({ where: where(body), orderBy: { at: "desc" }, take: 50_000 });
      await audit({ action: "audit.export", actorId: user.id, actorLabel: user.username, details: { rows: rows.length, format: body.format } });
      return exportResponse(
        body.format,
        "audit-log",
        [
          { key: "at", label: "Date and time" },
          { key: "actorLabel", label: "Actor" },
          { key: "action", label: "Action" },
          { key: "outcome", label: "Outcome" },
          { key: "entityType", label: "Entity type" },
          { key: "entityId", label: "Entity ID" },
          { key: "caseId", label: "Case ID" },
          { key: "reason", label: "Reason" },
          { key: "requestId", label: "Request ID" },
          { key: "ipAddress", label: "IP address" },
          { key: "before", label: "Previous value" },
          { key: "after", label: "New value" },
        ],
        rows.map((r) => ({ ...r, at: r.at.toISOString(), before: r.before ? JSON.stringify(r.before) : "", after: r.after ? JSON.stringify(r.after) : "" })),
      );
    },
  });
}
