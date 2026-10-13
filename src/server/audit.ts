import "server-only";
import type { AlertSeverity, AlertType, Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { prisma, type Tx } from "@/server/db";
import { currentRequestContext } from "@/server/api/context";
import { sanitizeForLog } from "@/lib/sanitize";

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export async function requestMeta(): Promise<RequestMeta> {
  const ctx = currentRequestContext();
  if (ctx) return { ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, requestId: ctx.requestId };
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    return {
      ipAddress: (fwd ? fwd.split(",")[0]?.trim() : h.get("x-real-ip")) ?? null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      requestId: h.get("x-request-id"),
    };
  } catch {
    // Outside a request (seed, worker, tests).
    return { ipAddress: null, userAgent: null, requestId: null };
  }
}

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  actorLabel?: string | null;
  entityType?: string;
  entityId?: string;
  caseId?: string | null;
  outcome?: "SUCCESS" | "DENIED" | "FAILURE";
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  details?: Record<string, unknown>;
}

/** Fields never copied into before/after snapshots. */
const OMIT = new Set(["passwordHash", "mfaSecret", "mfaPendingSecret", "updatedAt", "createdAt", "version", "preferences"]);

/** Reduces two snapshots to the fields that changed, so logs hold no unnecessary personal data. */
export function diffSnapshots(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined) {
  if (!before || !after) {
    const keep = (k: string, v: unknown) => !OMIT.has(k) && v !== null && v !== undefined && (typeof v !== "object" || v instanceof Date || isDecimal(v));
    const strip = (o: Record<string, unknown> | null | undefined) =>
      o
        ? Object.fromEntries(
            Object.entries(o)
              .filter(([k, v]) => keep(k, v))
              .map(([k, v]) => [k, normalise(v)]),
          )
        : null;
    return { before: strip(before), after: strip(after) };
  }
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (OMIT.has(key)) continue;
    const bv = normalise(before[key]);
    const av = normalise(after[key]);
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[key] = bv;
      a[key] = av;
    }
  }
  return { before: b, after: a };
}

function isDecimal(v: unknown): boolean {
  return Boolean(v && typeof v === "object" && "toFixed" in (v as object) && "isNegative" in (v as object));
}

function normalise(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (isDecimal(v)) return String(v);
  return v ?? null;
}

const json = (v: unknown) => (v === null || v === undefined ? undefined : (sanitizeForLog(v) as Prisma.InputJsonValue));

/**
 * Append-only audit record. Pass `tx` to make the audit row part of the same transaction as the
 * change it describes, so a change can never commit without its audit record.
 */
export async function audit(entry: AuditEntry, tx?: Tx): Promise<void> {
  const meta = await requestMeta();
  const db = tx ?? prisma;
  const snapshots = entry.before !== undefined || entry.after !== undefined ? diffSnapshots(entry.before, entry.after) : null;
  await db.auditLog.create({
    data: {
      action: entry.action,
      actorId: entry.actorId ?? null,
      actorLabel: entry.actorLabel ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      caseId: entry.caseId ?? null,
      outcome: entry.outcome ?? "SUCCESS",
      reason: entry.reason ?? null,
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      before: json(snapshots?.before),
      after: json(snapshots?.after),
      details: json(entry.details),
    },
  });
}

export async function raiseAlert(
  alert: {
    type: AlertType;
    severity: AlertSeverity;
    message: string;
    subjectUserId?: string | null;
    details?: Record<string, unknown>;
  },
  tx?: Tx,
): Promise<void> {
  const db = tx ?? prisma;
  await db.securityAlert.create({
    data: {
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      subjectUserId: alert.subjectUserId ?? null,
      details: json(alert.details),
    },
  });
}
