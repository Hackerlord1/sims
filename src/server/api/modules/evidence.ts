import "server-only";
import { z } from "zod";
import { idParam, type Router } from "@/server/api/router";
import * as evidence from "@/server/services/evidence";

export function registerEvidence(router: Router) {
  router.add({
    method: "POST",
    path: "/evidence/upload",
    summary: "Upload evidence (multipart: file, caseId, title, category, …). The original is preserved read-only with its SHA-256 hash.",
    tags: ["Evidence"],
    body: "multipart",
    rateLimitPerMinute: 60,
    handler: async ({ user, req }) => evidence.uploadEvidence(user, await req.formData()),
  });
  router.add({
    method: "GET",
    path: "/evidence/:id/detail",
    summary: "Versions, custody chain and access history",
    tags: ["Evidence"],
    handler: ({ user, params }) => evidence.evidenceDetail(user, idParam(params)),
  });
  router.add({
    method: "GET",
    path: "/evidence/:id/file",
    summary: "Download or preview the original (`which=original`) or a working copy (`which=latest` or a version number). Integrity-checked and logged.",
    tags: ["Evidence"],
    query: z.object({ which: z.string().max(20).default("original"), inline: z.enum(["0", "1"]).default("0") }),
    handler: ({ user, params, query }) => evidence.evidenceFile(user, idParam(params), query.which, query.inline === "1"),
  });
  router.add({
    method: "POST",
    path: "/evidence/:id/versions",
    summary: "Add a new working-copy version (multipart: file, note). The original is never changed.",
    tags: ["Evidence"],
    body: "multipart",
    handler: async ({ user, params, req }) => evidence.addWorkingVersion(user, idParam(params), await req.formData()),
  });
  router.add({
    method: "POST",
    path: "/evidence/:id/custody",
    summary: "Record a chain-of-custody event",
    tags: ["Evidence"],
    body: z.record(z.string(), z.unknown()),
    handler: ({ user, params, body }) => evidence.addCustodyEvent(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/evidence/:id/legal-hold",
    summary: "Place or release a legal hold on an evidence item",
    tags: ["Evidence"],
    body: z.object({ on: z.boolean(), reason: z.string().trim().min(3).max(2000) }),
    handler: ({ user, params, body }) => evidence.setEvidenceLegalHold(user, idParam(params), body.on, body.reason),
  });
  router.add({
    method: "POST",
    path: "/evidence/:id/verify-hash",
    summary: "Recompute and compare the SHA-256 hash of the original",
    tags: ["Evidence"],
    handler: ({ user, params }) => evidence.verifyEvidenceHash(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/party-statements/:id/signed-copy",
    summary: "Upload the signed copy of a statement (becomes protected evidence; the statement is then immutable)",
    tags: ["Interviews and statements"],
    body: "multipart",
    handler: async ({ user, params, req }) => evidence.uploadSignedStatement(user, idParam(params), await req.formData()),
  });
}
