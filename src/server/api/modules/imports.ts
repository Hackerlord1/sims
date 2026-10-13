import "server-only";
import { z } from "zod";
import { idParam, paginationQuery, type Router } from "@/server/api/router";
import * as imports from "@/server/imports/service";
import { ENUMS } from "@/lib/enums";

export function registerImports(router: Router) {
  router.add({
    method: "GET",
    path: "/imports/templates/:resource",
    summary: "Download an import template (CSV, or XLSX with a guide sheet listing allowed values)",
    tags: ["Data administration"],
    query: z.object({ format: z.enum(["csv", "xlsx"]).default("xlsx") }),
    handler: ({ user, params, query }) => imports.templateFile(user, params.resource!, query.format),
  });
  router.add({
    method: "POST",
    path: "/imports/validate",
    summary:
      "Upload a file (CSV, XLSX or ZIP; PDF/DOCX/images for evidence) and validate every row. Nothing is imported until the batch is committed. Re-uploading the same file with the same settings returns the existing batch (idempotent).",
    tags: ["Data administration"],
    body: "multipart",
    rateLimitPerMinute: 20,
    handler: async ({ user, req }) => imports.validateImport(user, await req.formData()),
  });
  router.add({
    method: "GET",
    path: "/imports",
    summary: "Import history",
    tags: ["Data administration"],
    query: paginationQuery,
    handler: ({ user, query }) => imports.listImports(user, query.page, query.pageSize),
  });
  router.add({
    method: "GET",
    path: "/imports/:id",
    summary: "Import batch with counts and a preview",
    tags: ["Data administration"],
    handler: ({ user, params }) => imports.importDetail(user, idParam(params)),
  });
  router.add({
    method: "GET",
    path: "/imports/:id/rows",
    summary: "Validated rows of a batch (filter by status)",
    tags: ["Data administration"],
    query: z.object({ status: z.enum(ENUMS.ImportRowStatus).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) }),
    handler: ({ user, params, query }) => imports.importRows(user, idParam(params), query.status, query.page, query.pageSize),
  });
  router.add({
    method: "GET",
    path: "/imports/:id/errors",
    summary: "Error report (CSV) for invalid, duplicate, skipped and failed rows",
    tags: ["Data administration"],
    handler: ({ user, params }) => imports.errorReport(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/imports/:id/commit",
    summary: "Commit a validated batch. Atomic batches roll back entirely on any failure; partial batches report per-row results. Large batches run in the background.",
    tags: ["Data administration"],
    rateLimitPerMinute: 10,
    handler: ({ user, params }) => imports.commitImport(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/imports/:id/cancel",
    summary: "Cancel a validated batch",
    tags: ["Data administration"],
    handler: ({ user, params }) => imports.cancelImport(user, idParam(params)),
  });
}
