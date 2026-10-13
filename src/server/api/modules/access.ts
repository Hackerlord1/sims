import "server-only";
import { z } from "zod";
import { idParam, listMeta, ListResult, paginationQuery, type Router } from "@/server/api/router";
import * as access from "@/server/services/access-requests";
import * as changes from "@/server/services/change-requests";
import { ENUMS } from "@/lib/enums";

export function registerAccess(router: Router) {
  // ───────── Access requests (public submission, administrator decision) ─────────
  router.add({
    method: "POST",
    path: "/access-requests",
    auth: "public",
    summary: "Ask for a SIMS account from the sign-in screen. The reply is the same whether or not the request was stored.",
    tags: ["Access requests"],
    body: access.accessRequestBody,
    handler: ({ body }) => access.submitAccessRequest(body),
  });
  router.add({
    method: "GET",
    path: "/access-requests",
    summary: "Access requests, newest first",
    tags: ["Access requests"],
    query: paginationQuery.extend({ status: z.enum(ENUMS.AccessRequestStatus).optional() }),
    async handler({ user, query }) {
      const { total, rows } = await access.listAccessRequests(user, query.status, query.page, query.pageSize);
      return new ListResult(rows, listMeta(query.page, query.pageSize, total));
    },
  });
  router.add({
    method: "POST",
    path: "/access-requests/:id/approve",
    summary: "Approve a request: create the account with the chosen role, units, clearance and restrictions. Returns a one-time temporary password.",
    tags: ["Access requests"],
    body: access.approveBody,
    handler: ({ user, params, body }) => access.approveAccessRequest(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/access-requests/:id/reject",
    summary: "Reject an access request (reason required)",
    tags: ["Access requests"],
    body: z.object({ reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(1000) }),
    handler: ({ user, params, body }) => access.rejectAccessRequest(user, idParam(params), body.reason),
  });

  // ───────── Pending data changes (maker-checker for chosen record types) ─────────
  router.add({
    method: "GET",
    path: "/change-requests",
    summary: "Pending and decided data changes. Approvers see changes they may review; everyone sees their own (mine=true).",
    tags: ["Data-change approval"],
    query: paginationQuery.extend({ status: z.enum(ENUMS.ChangeRequestStatus).optional(), mine: z.enum(["true", "false"]).optional() }),
    async handler({ user, query }) {
      const { total, rows } = await changes.listChangeRequests(user, { status: query.status, mine: query.mine === "true" }, query.page, query.pageSize);
      return new ListResult(rows, listMeta(query.page, query.pageSize, total));
    },
  });
  router.add({
    method: "GET",
    path: "/change-requests/:id",
    summary: "One change with a field-by-field comparison against the current record",
    tags: ["Data-change approval"],
    handler: ({ user, params }) => changes.changeRequestDetail(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/change-requests/:id/decision",
    summary: "Approve (apply) or reject a pending change. Nobody decides their own change.",
    tags: ["Data-change approval"],
    body: z.object({ approve: z.boolean(), comment: z.string().trim().max(1000).optional() }),
    handler: ({ user, params, body }) => changes.decideChangeRequest(user, idParam(params), body.approve, body.comment),
  });
  router.add({
    method: "POST",
    path: "/change-requests/:id/withdraw",
    summary: "Withdraw your own pending change",
    tags: ["Data-change approval"],
    handler: ({ user, params }) => changes.withdrawChangeRequest(user, idParam(params)),
  });
}
