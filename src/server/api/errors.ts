import "server-only";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { InvalidTransitionError } from "@/lib/case-status";
import { MakerCheckerViolation } from "@/lib/permissions";
import { issuesByField } from "@/lib/resources/schema";
import { AuthorizationError } from "@/server/authz";

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "REAUTHENTICATION_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STALE_VERSION"
  | "PROTECTED_RECORD"
  | "INVALID_TRANSITION"
  | "MAKER_CHECKER"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "CSRF_REJECTED"
  | "MFA_FAILED"
  | "INTERNAL";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", message, details);
export const notFound = (what = "Record") => new ApiError(404, "NOT_FOUND", `${what} not found or access denied.`);
export const conflict = (message: string, details?: unknown) => new ApiError(409, "CONFLICT", message, details);
export const protectedRecord = (message: string) => new ApiError(409, "PROTECTED_RECORD", message);
export const staleVersion = () => new ApiError(409, "STALE_VERSION", "This record was changed by someone else. Reload it and try again.");

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
  requestId: string;
}

// Messages raised by the integrity-guard triggers are safe to show; they never contain data values.
const GUARD_MESSAGES = ["cannot be deleted", "are immutable", "is immutable", "is append-only", "under legal hold", "archive it instead", "archive instead"];

// MariaDB reports a trigger's SIGNAL SQLSTATE '45000' as error 1644. Prisma surfaces it either as
// P2010 with { code, message } in `meta` (raw queries) or inside the text of an unknown request
// error as `MysqlError { code: 1644, message: "…" }` (model queries).
const SIGNAL_ERROR = "1644";

function guardMessage(e: unknown): string | null {
  const text = e instanceof Error ? e.message : "";
  const match = GUARD_MESSAGES.find((m) => text.includes(m));
  if (!match) return null;
  // Extract the SIGNAL message text only.
  const meta = e instanceof Prisma.PrismaClientKnownRequestError ? (e.meta as { code?: unknown; message?: unknown } | undefined) : undefined;
  const fromMeta = meta && String(meta.code) === SIGNAL_ERROR && typeof meta.message === "string" ? meta.message : null;
  const fromText = new RegExp(`MysqlError \\{ code: ${SIGNAL_ERROR}, message: "([^"\\n]*)"`).exec(text)?.[1] ?? null;
  const found = fromMeta ?? fromText;
  return (found && GUARD_MESSAGES.some((m) => found.includes(m)) ? found : "This record is protected and cannot be changed that way.").trim();
}

/** Maps any thrown value to a safe, consistent API error. Unknown errors become a generic 500. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof ZodError) {
    return new ApiError(422, "VALIDATION_FAILED", "Some fields are invalid.", { fields: issuesByField(e) });
  }
  if (e instanceof AuthorizationError) return new ApiError(403, "FORBIDDEN", e.message);
  if (e instanceof MakerCheckerViolation) return new ApiError(403, "MAKER_CHECKER", e.message);
  if (e instanceof InvalidTransitionError) return new ApiError(409, "INVALID_TRANSITION", e.message);
  const guard = guardMessage(e);
  if (guard) return protectedRecord(guard);
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return conflict("A record with the same unique value already exists.");
    if (e.code === "P2025") return notFound();
    if (e.code === "P2003") return conflict("This record is linked to other records.");
    if (e.code === "P2034") return conflict("The request conflicted with another change. Please retry.");
  }
  return new ApiError(500, "INTERNAL", "An unexpected error occurred. Quote the request ID if you contact support.");
}
