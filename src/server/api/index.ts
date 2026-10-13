import "server-only";
import { Router } from "@/server/api/router";
import { buildOpenApi } from "@/server/api/openapi";
import { registerAccess } from "@/server/api/modules/access";
import { registerAdmin } from "@/server/api/modules/admin";
import { registerAudit } from "@/server/api/modules/audit";
import { registerDeletion } from "@/server/api/modules/deletion";
import { registerInsight } from "@/server/api/modules/insight";
import { registerAuth } from "@/server/api/modules/auth";
import { registerBulk } from "@/server/api/modules/bulk";
import { registerEvidence } from "@/server/api/modules/evidence";
import { registerImports } from "@/server/api/modules/imports";
import { registerStatements } from "@/server/api/modules/statements";
import { registerMe } from "@/server/api/modules/me";
import { registerNotifications } from "@/server/api/modules/notifications";
import { registerOptions } from "@/server/api/modules/options";
import { registerResources } from "@/server/api/modules/resources";
import { registerWorkflows } from "@/server/api/modules/workflows";

export const API_BASE = "/api/v1";

function createRouter(): Router {
  const router = new Router(API_BASE);
  registerAuth(router);
  registerMe(router);
  registerNotifications(router);
  registerOptions(router);
  registerWorkflows(router);
  registerEvidence(router);
  registerAudit(router);
  registerBulk(router);
  registerImports(router);
  registerStatements(router);
  registerDeletion(router);
  registerAccess(router);
  registerAdmin(router);
  registerInsight(router);
  registerResources(router);
  router.add({
    method: "GET",
    path: "/openapi.json",
    auth: "public",
    summary: "OpenAPI 3.1 description of this API",
    tags: ["Documentation"],
    async handler() {
      return Response.json(buildOpenApi(router));
    },
  });
  return router;
}

export const apiRouter: Router = createRouter();
