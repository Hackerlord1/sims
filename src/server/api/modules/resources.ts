import "server-only";
import { z } from "zod";
import { idParam, paginationQuery, type Router } from "@/server/api/router";
import { createResource, getResourceRow, lifecycleOrThrow, listResource, requireResource, shapeRows, updateResource } from "@/server/resources/service";
import { requireCaseAccess } from "@/server/authz";
import { requiresApproval, submitCreate, submitUpdate } from "@/server/services/change-requests";

const RESERVED = new Set(["page", "pageSize", "sort", "order", "q", "caseId", "matterId", "deleted", "archived"]);

export const listQuery = paginationQuery
  .extend({
    caseId: z.string().max(64).optional(),
    matterId: z.string().max(64).optional(),
    deleted: z.enum(["exclude", "include", "only"]).optional(),
    archived: z.enum(["exclude", "include", "only"]).optional(),
  })
  .loose();

export function extractFilters(query: Record<string, unknown>): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (RESERVED.has(k) || typeof v !== "string" || k.length > 64) continue;
    filters[k] = v.slice(0, 500);
  }
  return filters;
}

const reasonBody = z.object({ reason: z.string().trim().max(1000).optional() });

export function registerResources(router: Router) {
  router.add({
    method: "GET",
    path: "/:resource",
    summary: "List records of a type (server-side pagination, sorting, filtering and search)",
    description:
      "Filters: `<field>=value` (enum values comma-separated), `from.<date>` / `to.<date>`, `min.<amount>` / `max.<amount>`. " + "`deleted=only` lists the Recycle Bin (requires restore permission).",
    tags: ["Records"],
    query: listQuery,
    async handler({ params, query, user }) {
      const r = requireResource(params.resource!);
      if (query.caseId) await requireCaseAccess(user, query.caseId, r.module, "VIEW", { allowDeleted: query.deleted === "only" });
      return listResource(r, user, { ...query, filters: extractFilters(query) });
    },
  });

  router.add({
    method: "POST",
    path: "/:resource",
    summary: "Create a record. For record types that need approval, the change is validated and queued instead (`pendingApproval: true`).",
    tags: ["Records"],
    body: z.record(z.string(), z.unknown()),
    async handler({ params, body, user }) {
      const r = requireResource(params.resource!);
      // Record types behind data-change approval are validated and queued, not written.
      if (await requiresApproval(r.key)) return submitCreate(r, user, body);
      const created = await createResource(r, user, body);
      const [shaped] = await shapeRows(r, user, [created]);
      return shaped;
    },
  });

  router.add({
    method: "GET",
    path: "/:resource/:id",
    summary: "Get one record",
    tags: ["Records"],
    async handler({ params, user }) {
      const r = requireResource(params.resource!);
      return getResourceRow(r, user, idParam(params));
    },
  });

  router.add({
    method: "PATCH",
    path: "/:resource/:id",
    summary: "Update a record (send `version` for optimistic locking). For record types that need approval, the edit is validated and queued instead.",
    tags: ["Records"],
    body: z.record(z.string(), z.unknown()),
    async handler({ params, body, user }) {
      const r = requireResource(params.resource!);
      if (await requiresApproval(r.key)) return submitUpdate(r, user, idParam(params), body);
      const updated = await updateResource(r, user, idParam(params), body);
      const [shaped] = await shapeRows(r, user, [updated]);
      return shaped;
    },
  });

  for (const [segment, action, summary] of [
    ["archive", "archive", "Archive a record"],
    ["unarchive", "unarchive", "Return an archived record to active lists"],
    ["delete", "soft_delete", "Move a record to the Recycle Bin (reason required)"],
    ["restore", "restore", "Restore a record from the Recycle Bin (reason required)"],
  ] as const) {
    router.add({
      method: "POST",
      path: `/:resource/:id/${segment}`,
      summary,
      tags: ["Records"],
      body: reasonBody,
      async handler({ params, body, user }) {
        const r = requireResource(params.resource!);
        await lifecycleOrThrow(r, user, idParam(params), action, { reason: body.reason });
        return { id: params.id, action };
      },
    });
  }
}
