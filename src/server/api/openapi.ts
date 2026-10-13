import "server-only";
import { z } from "zod";
import type { RouteDef, Router } from "@/server/api/router";

function schemaOf(s: unknown): Record<string, unknown> | undefined {
  if (!s || s === "multipart" || !(s instanceof z.ZodType)) return undefined;
  try {
    return z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  } catch {
    return { type: "object" };
  }
}

const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: { code: { type: "string" }, message: { type: "string" }, details: {} },
      required: ["code", "message"],
    },
    requestId: { type: "string" },
  },
};

function operation(def: RouteDef) {
  const params = def.path
    .split("/")
    .filter((s) => s.startsWith(":"))
    .map((s) => ({ name: s.slice(1), in: "path", required: true, schema: { type: "string" } }));
  const query = schemaOf(def.query);
  const queryParams = query?.properties
    ? Object.entries(query.properties as Record<string, Record<string, unknown>>).map(([name, schema]) => ({
        name,
        in: "query",
        required: Array.isArray(query.required) && (query.required as string[]).includes(name),
        schema,
      }))
    : [];
  const op: Record<string, unknown> = {
    summary: def.summary,
    description: def.description,
    tags: def.tags,
    parameters: [...params, ...queryParams],
    security: def.auth === "public" ? [] : [{ sessionCookie: [] }],
    responses: {
      "200": { description: "Success. Body: `{ data, meta?, requestId }`." },
      "400": { description: "Bad request", content: { "application/json": { schema: errorSchema } } },
      "401": { description: "Not signed in", content: { "application/json": { schema: errorSchema } } },
      "403": { description: "Forbidden or CSRF rejected", content: { "application/json": { schema: errorSchema } } },
      "404": { description: "Not found or not visible", content: { "application/json": { schema: errorSchema } } },
      "409": { description: "Conflict, stale version, protected record or invalid transition", content: { "application/json": { schema: errorSchema } } },
      "422": { description: "Validation failed (`details.fields`)", content: { "application/json": { schema: errorSchema } } },
    },
  };
  if (def.body === "multipart") {
    op.requestBody = { content: { "multipart/form-data": { schema: { type: "object" } } } };
  } else if (def.body) {
    op.requestBody = { required: true, content: { "application/json": { schema: schemaOf(def.body) } } };
  }
  return op;
}

export function buildOpenApi(router: Router) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const def of router.list()) {
    const path = router.basePath + def.path.replace(/:(\w+)/g, "{$1}");
    paths[path] ??= {};
    paths[path][def.method.toLowerCase()] = operation(def);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "SIMS — Savemore Investigation Management System API",
      version: "1.0.0",
      description:
        "REST API for SIMS. Authenticate with `POST /auth/login` (session cookie). Every state-changing request must send " +
        "the header `x-sims-csrf: 1`. Responses use `{ data, meta?, requestId }`; errors use `{ error: { code, message, details }, requestId }`. " +
        "Automated statement analysis results are investigative leads that require human verification, not proof.",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: { sessionCookie: { type: "apiKey", in: "cookie", name: "sims_session" } },
    },
    paths,
  };
}
