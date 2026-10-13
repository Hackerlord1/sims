import "server-only";
import { z } from "zod";
import { idParam, listMeta, ListResult, paginationQuery, type Router } from "@/server/api/router";
import { exportRecords, listBatches, recycleBinSummary, restoreBatch, runBulkAction, MAX_BULK } from "@/server/services/bulk";
import { requireResource } from "@/server/resources/service";
import { ENUMS } from "@/lib/enums";

const filterSchema = z
  .object({
    caseId: z.string().max(64).optional(),
    matterId: z.string().max(64).optional(),
    q: z.string().max(200).optional(),
    filters: z.record(z.string().max(64), z.string().max(500)).optional(),
    deleted: z.literal("only").optional(),
    archived: z.literal("only").optional(),
  })
  .optional();

export function registerBulk(router: Router) {
  router.add({
    method: "POST",
    path: "/bulk/:resource",
    summary: `Bulk action on selected records or on every record matching a filter (max ${MAX_BULK}). Runs in one transaction; protected records are skipped and reported.`,
    tags: ["Data administration"],
    rateLimitPerMinute: 20,
    body: z.object({
      action: z.enum(ENUMS.BulkActionType),
      ids: z.array(z.string().min(1).max(64)).max(MAX_BULK).optional(),
      filter: filterSchema,
      reason: z.string().trim().max(1000).optional(),
      assigneeId: z.string().max(64).optional(),
      status: z.string().max(64).optional(),
    }),
    handler: ({ user, params, body }) => runBulkAction(requireResource(params.resource!), user, body),
  });

  router.add({
    method: "POST",
    path: "/export/:resource",
    summary: "Export selected records or all records matching a filter (CSV or XLSX). Sensitive identifiers stay masked for users without clearance.",
    tags: ["Reports and exports"],
    rateLimitPerMinute: 20,
    body: z.object({ format: z.enum(["csv", "xlsx"]).default("xlsx"), ids: z.array(z.string().min(1).max(64)).max(50_000).optional(), filter: filterSchema }),
    handler: ({ user, params, body }) => exportRecords(requireResource(params.resource!), user, body),
  });

  router.add({
    method: "GET",
    path: "/bulk-batches",
    summary: "History of bulk actions (archive, delete, restore, reassign, status change)",
    tags: ["Data administration"],
    query: paginationQuery,
    async handler({ user, query }) {
      const { total, rows } = await listBatches(user, query.page, query.pageSize);
      return new ListResult(rows, listMeta(query.page, query.pageSize, total));
    },
  });

  router.add({
    method: "POST",
    path: "/bulk-batches/:id/restore",
    summary: "Restore every record removed by a deletion batch",
    tags: ["Data administration"],
    body: z.object({ reason: z.string().trim().min(3).max(1000) }),
    handler: ({ user, params, body }) => restoreBatch(user, idParam(params), body.reason),
  });

  router.add({
    method: "GET",
    path: "/recycle-bin/summary",
    summary: "Deleted record counts per record type (only types the user may restore)",
    tags: ["Data administration"],
    handler: ({ user }) => recycleBinSummary(user),
  });
}
