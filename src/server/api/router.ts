import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { runWithRequestContext } from "@/server/api/context";
import { ApiError, toApiError, type ErrorBody } from "@/server/api/errors";
import { loadSessionByToken, tokenFromCookieHeader } from "@/server/auth/session";
import { mustKeepMfa, toCurrentUser, type CurrentUser } from "@/server/auth/principal";
import { rateLimit } from "@/server/rate-limit";

export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export const CSRF_HEADER = "x-sims-csrf";
const JSON_LIMIT_BYTES = 2 * 1024 * 1024;
const MULTIPART_LIMIT_BYTES = 60 * 1024 * 1024;

export interface HandlerContext<Q, B> {
  req: Request;
  url: URL;
  params: Record<string, string>;
  query: Q;
  body: B;
  requestId: string;
}

export interface AuthedContext<Q, B> extends HandlerContext<Q, B> {
  user: CurrentUser;
}

interface BaseDef<Q extends z.ZodType, B extends z.ZodType> {
  method: Method;
  path: string;
  summary: string;
  tags: string[];
  query?: Q;
  /** JSON body schema, or "multipart" when the handler reads FormData itself. */
  body?: B | "multipart";
  /** Allowed before two-step verification is complete (sign-out, current user, enrolment, change password). */
  allowPendingMfa?: boolean;
  /** Tighter per-user limit for expensive endpoints (requests per minute). */
  rateLimitPerMinute?: number;
  description?: string;
}

export interface PublicRouteDef<Q extends z.ZodType, B extends z.ZodType> extends BaseDef<Q, B> {
  auth: "public";
  handler: (ctx: HandlerContext<z.output<Q>, z.output<B>>) => Promise<unknown>;
}
export interface UserRouteDef<Q extends z.ZodType, B extends z.ZodType> extends BaseDef<Q, B> {
  auth?: "user";
  handler: (ctx: AuthedContext<z.output<Q>, z.output<B>>) => Promise<unknown>;
}
export type RouteDef<Q extends z.ZodType = z.ZodType, B extends z.ZodType = z.ZodType> = PublicRouteDef<Q, B> | UserRouteDef<Q, B>;

interface CompiledRoute {
  def: RouteDef;
  segments: string[];
  score: number;
}

/** Marker for handlers that already built a full Response (files, redirects, cookies). */
export const isResponse = (v: unknown): v is Response => v instanceof Response;

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort?: string;
  order?: "asc" | "desc";
}

/** Envelope marker so handlers can return `{ data, meta }` for lists. */
export class ListResult<T> {
  constructor(
    public readonly data: T[],
    public readonly meta: ListMeta,
  ) {}
}

export function jsonResponse(body: unknown, status: number, requestId: string, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-request-id", requestId);
  return new Response(JSON.stringify(body, jsonReplacer), { status, headers });
}

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  return value;
}

function logServerError(e: unknown, requestId: string, method: string, path: string) {
  // Structured, and deliberately free of request bodies, query values and database parameters.
  const entry: Record<string, unknown> = {
    level: "error",
    at: new Date().toISOString(),
    requestId,
    method,
    route: path,
    error: e instanceof Error ? e.name : typeof e,
  };
  if (e instanceof Prisma.PrismaClientKnownRequestError) entry.prismaCode = e.code;
  else if (e instanceof Error && !(e instanceof Prisma.PrismaClientValidationError)) {
    entry.message = e.message.slice(0, 300);
    entry.stack = e.stack
      ?.split("\n")
      .slice(1, 4)
      .map((s) => s.trim());
  }
  console.error(JSON.stringify(entry));
}

export class Router {
  private routes: CompiledRoute[] = [];

  constructor(public readonly basePath: string) {}

  add<Q extends z.ZodType, B extends z.ZodType>(def: RouteDef<Q, B>): this {
    const segments = def.path.split("/").filter(Boolean);
    const score = segments.reduce((s, seg) => s * 2 + (seg.startsWith(":") ? 0 : 1), 1);
    this.routes.push({ def: def as unknown as RouteDef, segments, score });
    // Most specific first: literal segments beat parameters at the same depth.
    this.routes.sort((a, b) => b.segments.length - a.segments.length || b.score - a.score);
    return this;
  }

  list(): RouteDef[] {
    return this.routes.map((r) => r.def);
  }

  private match(method: string, pathname: string) {
    const parts = pathname.split("/").filter(Boolean);
    let pathMatched = false;
    for (const r of this.routes) {
      if (r.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = r.segments[i]!;
        const part = parts[i]!;
        if (seg.startsWith(":")) {
          try {
            params[seg.slice(1)] = decodeURIComponent(part);
          } catch {
            ok = false;
            break;
          }
        } else if (seg !== part) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      pathMatched = true;
      if (r.def.method === method) return { route: r, params };
    }
    return pathMatched ? "METHOD_NOT_ALLOWED" : null;
  }

  async dispatch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const incoming = req.headers.get("x-request-id");
    const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    const fwd = req.headers.get("x-forwarded-for");
    const ipAddress = (fwd ? fwd.split(",")[0]?.trim() : req.headers.get("x-real-ip")) ?? "local";
    const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

    return runWithRequestContext({ requestId, ipAddress, userAgent }, async () => {
      const path = url.pathname.startsWith(this.basePath) ? url.pathname.slice(this.basePath.length) || "/" : url.pathname;
      try {
        const found = this.match(req.method, path);
        if (found === null) throw new ApiError(404, "NOT_FOUND", "No such endpoint.");
        if (found === "METHOD_NOT_ALLOWED") throw new ApiError(405, "BAD_REQUEST", "Method not allowed for this endpoint.");
        const { route, params } = found;
        const def = route.def;
        const mutating = req.method !== "GET";

        if (mutating) this.checkCsrf(req, url);
        if (!rateLimit(`api:ip:${ipAddress}`, 1200, 60_000).ok) {
          throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please slow down.");
        }

        const query = def.query ? def.query.parse(Object.fromEntries(url.searchParams)) : {};
        let body: unknown = undefined;
        if (def.body === "multipart") {
          const len = Number(req.headers.get("content-length") ?? 0);
          if (len > MULTIPART_LIMIT_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The upload is too large.");
          if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
            throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected multipart/form-data.");
          }
        } else if (def.body) {
          body = def.body.parse(await readJson(req));
        }

        let result: unknown;
        if (def.auth === "public") {
          result = await def.handler({ req, url, params, query, body, requestId });
        } else {
          const user = await this.authenticate(req, def);
          const perMinute = def.rateLimitPerMinute ?? (mutating ? 240 : 900);
          if (!rateLimit(`api:user:${user.id}:${mutating ? "w" : "r"}:${def.rateLimitPerMinute ? def.path : ""}`, perMinute, 60_000).ok) {
            throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please slow down.");
          }
          result = await def.handler({ req, url, params, query, body, requestId, user });
        }

        if (isResponse(result)) {
          result.headers.set("x-request-id", requestId);
          if (!result.headers.has("cache-control")) result.headers.set("cache-control", "no-store");
          return result;
        }
        if (result instanceof ListResult) return jsonResponse({ data: result.data, meta: result.meta, requestId }, 200, requestId);
        return jsonResponse({ data: result ?? null, requestId }, mutating && req.method === "POST" ? 201 : 200, requestId);
      } catch (e) {
        const err = toApiError(e);
        if (err.status >= 500) logServerError(e, requestId, req.method, path);
        const body: ErrorBody = { error: { code: err.code, message: err.message, details: err.details }, requestId };
        return jsonResponse(body, err.status, requestId, err.status === 429 ? { "retry-after": "60" } : undefined);
      }
    });
  }

  /**
   * CSRF: the session cookie is SameSite=Lax, and every state-changing request must also carry the
   * custom header (a cross-site page cannot add it without a CORS preflight, which is never
   * granted) and, when the browser sends one, an Origin matching this host.
   */
  private checkCsrf(req: Request, url: URL) {
    if (req.headers.get(CSRF_HEADER) !== "1") {
      throw new ApiError(403, "CSRF_REJECTED", "Request rejected: missing anti-forgery header.");
    }
    const origin = req.headers.get("origin");
    if (origin && origin !== "null") {
      const allowed = new Set([url.origin, process.env.APP_URL?.replace(/\/$/, "")].filter(Boolean));
      if (!allowed.has(origin)) throw new ApiError(403, "CSRF_REJECTED", "Request rejected: cross-origin request.");
    }
  }

  private async authenticate(req: Request, def: RouteDef): Promise<CurrentUser> {
    const session = await loadSessionByToken(tokenFromCookieHeader(req.headers.get("cookie")));
    if (!session) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in.");
    const user = toCurrentUser(session);
    if (user.mfaEnabled && !user.sessionMfaVerified && !def.allowPendingMfa) {
      throw new ApiError(403, "FORBIDDEN", "Multi-factor verification is required.");
    }
    if (mustKeepMfa(user) && !user.mfaEnabled && !def.allowPendingMfa) {
      throw new ApiError(403, "FORBIDDEN", "Set up two-step verification before using administrator functions.");
    }
    return user;
  }
}

async function readJson(req: Request): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json.");
  }
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > JSON_LIMIT_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  const text = await req.text();
  if (text.length > JSON_LIMIT_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "The request body is not valid JSON.");
  }
}

// ───────────────────── Shared query schemas ─────────────────────

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().max(64).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  q: z.string().trim().max(200).optional(),
});

export function listMeta(page: number, pageSize: number, total: number, sort?: string, order?: "asc" | "desc"): ListMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), sort, order };
}

export const idParam = (params: Record<string, string>, name = "id") => {
  const v = params[name];
  if (!v || v.length > 64) throw new ApiError(400, "BAD_REQUEST", `Invalid ${name}.`);
  return v;
};
