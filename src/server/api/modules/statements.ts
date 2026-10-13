import "server-only";
import { z } from "zod";
import { idParam, type Router } from "@/server/api/router";
import * as statements from "@/server/statements/service";
import { ENUMS } from "@/lib/enums";

export function registerStatements(router: Router) {
  router.add({
    method: "POST",
    path: "/financial-statements/upload",
    summary: "Upload a bank or M-Pesa statement (PDF, scanned PDF, CSV, XLSX). The original is preserved; parsing runs in the background on a copy.",
    tags: ["Statement analysis"],
    body: "multipart",
    rateLimitPerMinute: 30,
    handler: async ({ user, req }) => statements.uploadStatement(user, await req.formData()),
  });
  router.add({
    method: "GET",
    path: "/financial-statements/:id/overview",
    summary: "Statement status, totals, flag and link counts",
    tags: ["Statement analysis"],
    handler: ({ user, params }) => statements.statementHeader(user, idParam(params)),
  });
  router.add({
    method: "GET",
    path: "/financial-statements/:id/transactions",
    summary: "Normalised transactions (server-side filters: flag, direction, search, dates, minimum amount)",
    tags: ["Statement analysis"],
    query: statements.txnQuery,
    handler: ({ user, params, query }) => statements.listTransactions(user, idParam(params), query),
  });
  router.add({
    method: "GET",
    path: "/financial-statements/:id/links",
    summary: "Suggested and reviewed transaction links (investigative leads)",
    tags: ["Statement analysis"],
    query: z.object({ status: z.enum(ENUMS.LinkStatus).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) }),
    handler: ({ user, params, query }) => statements.listLinks(user, idParam(params), query.status, query.page, query.pageSize),
  });
  router.add({
    method: "POST",
    path: "/financial-statements/:id/reparse",
    summary: "Queue the statement for parsing again",
    tags: ["Statement analysis"],
    handler: ({ user, params }) => statements.reparseStatement(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/financial-statements/:id/analyse",
    summary: "Re-run pattern detection and link suggestions for the case",
    tags: ["Statement analysis"],
    rateLimitPerMinute: 10,
    handler: ({ user, params }) => statements.reanalyse(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/financial-statements/:id/review",
    summary: "Mark the parsed statement as reviewed by an investigator",
    tags: ["Statement analysis"],
    handler: ({ user, params }) => statements.markReviewed(user, idParam(params)),
  });
  router.add({
    method: "GET",
    path: "/financial-statements/:id/export",
    summary: "Exportable transaction schedule",
    tags: ["Statement analysis"],
    query: z.object({ format: z.enum(["csv", "xlsx"]).default("xlsx") }),
    rateLimitPerMinute: 20,
    handler: ({ user, params, query }) => statements.exportSchedule(user, idParam(params), query.format),
  });
  router.add({
    method: "POST",
    path: "/transaction-links/:id/review",
    summary: "Confirm or reject a suggested link (rejection needs a note)",
    tags: ["Statement analysis"],
    body: z.object({ status: z.enum(["CONFIRMED", "REJECTED"]), note: z.string().trim().max(1000).optional() }),
    handler: ({ user, params, body }) => statements.reviewLink(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/statement-transactions/:id/links",
    summary: "Link a transaction to a party, invoice, cheque or known account manually (user-confirmed match)",
    tags: ["Statement analysis"],
    body: z.object({ targetType: z.enum(["PARTY", "INVOICE", "CHEQUE", "KNOWN_ACCOUNT"]), targetId: z.string().min(1).max(64), note: z.string().trim().max(1000).optional() }),
    handler: ({ user, params, body }) => statements.addManualLink(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/statement-transactions/:id/exclusion",
    summary: "Exclude a mis-parsed row from analysis (or include it again)",
    tags: ["Statement analysis"],
    body: z.object({ excluded: z.boolean(), reason: z.string().trim().min(3).max(1000) }),
    handler: ({ user, params, body }) => statements.setTransactionExcluded(user, idParam(params), body.excluded, body.reason),
  });
  router.add({
    method: "GET",
    path: "/cases/:id/money-movement",
    summary: "Money-movement network, transfer matrix, timeline and counterparty summary (computed on the server)",
    tags: ["Statement analysis"],
    query: z.object({
      minAmount: z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/)
        .optional(),
      statementId: z.string().max(64).optional(),
    }),
    rateLimitPerMinute: 30,
    handler: ({ user, params, query }) => statements.moneyMovement(user, idParam(params), query),
  });
}
