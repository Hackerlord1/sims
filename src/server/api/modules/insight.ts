import "server-only";
import { z } from "zod";
import { idParam, paginationQuery, type Router } from "@/server/api/router";
import { dashboard } from "@/server/services/dashboard";
import { dashboardMetric, isDashboardMetric } from "@/server/services/dashboard-metrics";
import { notFound } from "@/server/api/errors";
import { search, SEARCH_TYPES } from "@/server/services/search";
import * as reports from "@/server/reports/service";
import { requirePermission } from "@/server/authz";
import { parseDateInput } from "@/lib/resources/schema";

const optionalDate = z
  .string()
  .max(40)
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const d = parseDateInput(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return d;
  });

export function registerInsight(router: Router) {
  router.add({
    method: "GET",
    path: "/dashboard",
    summary: "Dashboard figures for the current user's accessible cases",
    tags: ["Dashboard"],
    rateLimitPerMinute: 60,
    async handler({ user }) {
      await requirePermission(user, "DASHBOARD", "VIEW");
      return dashboard(user);
    },
  });
  router.add({
    method: "GET",
    path: "/dashboard/metrics/:metric",
    summary: "Records behind one dashboard figure (up to 100 rows plus the full count), limited to what the user may view",
    tags: ["Dashboard"],
    rateLimitPerMinute: 60,
    async handler({ user, params }) {
      await requirePermission(user, "DASHBOARD", "VIEW");
      const metric = params.metric ?? "";
      if (!isDashboardMetric(metric)) throw notFound("Dashboard figure");
      return dashboardMetric(user, metric);
    },
  });
  router.add({
    method: "GET",
    path: "/search",
    summary:
      "Global and advanced search (case number, title, person, customer, invoice, cheque, OB number, police station, officer, court case number, advocate, transaction reference, telephone, account, location, amount; optional date range)",
    tags: ["Search"],
    rateLimitPerMinute: 60,
    query: z.object({
      q: z.string().trim().min(2, "Enter at least two characters.").max(100),
      types: z.string().max(200).optional(),
      from: z.string().max(40).optional(),
      to: z.string().max(40).optional(),
    }),
    handler: ({ user, query }) =>
      search(user, {
        q: query.q,
        types: query.types?.split(",").filter((t): t is (typeof SEARCH_TYPES)[number] => (SEARCH_TYPES as readonly string[]).includes(t)),
        from: query.from,
        to: query.to,
      }),
  });
  router.add({ method: "GET", path: "/reports/catalog", summary: "Reports the user may generate", tags: ["Reports and exports"], handler: async ({ user }) => reports.reportCatalog(user) });
  router.add({
    method: "POST",
    path: "/reports/generate",
    summary: "Generate a report as PDF, DOCX, XLSX or CSV (the file is stored in the report history)",
    tags: ["Reports and exports"],
    rateLimitPerMinute: 20,
    body: z.object({ key: z.string().max(64), format: z.enum(["PDF", "DOCX", "XLSX", "CSV"]), caseId: z.string().max(64).optional(), from: optionalDate, to: optionalDate }),
    handler: ({ user, body }) => reports.generateReport(user, { key: body.key, format: body.format, filters: { caseId: body.caseId, from: body.from, to: body.to } }),
  });
  router.add({
    method: "GET",
    path: "/reports",
    summary: "Generated report history",
    tags: ["Reports and exports"],
    query: paginationQuery,
    handler: ({ user, query }) => reports.listReports(user, query.page, query.pageSize),
  });
  router.add({
    method: "GET",
    path: "/reports/:id/download",
    summary: "Download a generated report",
    tags: ["Reports and exports"],
    handler: ({ user, params }) => reports.downloadReport(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/reports/:id/approve-final",
    summary: "Approve a generated report as the final version (then protected)",
    tags: ["Reports and exports"],
    handler: ({ user, params }) => reports.approveFinalReport(user, idParam(params)),
  });
}
