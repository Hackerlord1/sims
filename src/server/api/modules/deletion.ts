import "server-only";
import { z } from "zod";
import { idParam, paginationQuery, type Router } from "@/server/api/router";
import * as deletion from "@/server/services/permanent-deletion";

export function registerDeletion(router: Router) {
  router.add({
    method: "GET",
    path: "/deletion-requests",
    summary: "Permanent-deletion requests",
    tags: ["Data administration"],
    query: paginationQuery,
    handler: ({ user, query }) => deletion.listDeletionRequests(user, query.page, query.pageSize),
  });
  router.add({
    method: "POST",
    path: "/deletion-requests",
    summary: "Request permanent deletion of records already in the Recycle Bin. Requires recent password re-authentication; retention, dependency, legal-hold and protection checks run immediately.",
    tags: ["Data administration"],
    body: z.object({ entityType: z.string().max(64), entityIds: z.array(z.string().min(1).max(64)).min(1).max(500), reason: z.string().trim().min(10).max(2000) }),
    handler: ({ user, body }) => deletion.requestDeletion(user, body),
  });
  router.add({
    method: "POST",
    path: "/deletion-requests/:id/decision",
    summary: "Approve (and execute) or reject a request. The approver must be a different user with the approval permission and must re-authenticate.",
    tags: ["Data administration"],
    body: z.object({ approve: z.boolean(), comment: z.string().trim().min(3).max(2000) }),
    handler: ({ user, params, body }) => deletion.decideDeletion(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/deletion-requests/:id/cancel",
    summary: "Cancel your own request",
    tags: ["Data administration"],
    handler: ({ user, params }) => deletion.cancelDeletion(user, idParam(params)),
  });
}
