import "server-only";
import type { EvidenceAccessAction } from "@prisma/client";
import { z } from "zod";
import { prisma, type Tx } from "@/server/db";
import { audit, raiseAlert, requestMeta } from "@/server/audit";
import { AuthorizationError, requireCaseAccess } from "@/server/authz";
import { ApiError, badRequest, notFound } from "@/server/api/errors";
import type { CurrentUser } from "@/server/auth/principal";
import { nextCaseReference } from "@/server/references";
import { getSetting } from "@/server/services/settings";
import { EVIDENCE_EXTENSIONS, fileResponse, readStoredFile, sha256, storeFile, validateUpload } from "@/server/storage";
import { ENUMS } from "@/lib/enums";
import { LINK_TYPES, RESOURCE_MAP } from "@/lib/resources/registry";
import { parseDateInput } from "@/lib/resources/schema";
import { clearanceCovers, type Confidentiality } from "@/lib/permissions";

const blank = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const uploadSchema = z.object({
  caseId: z.string().min(1).max(64),
  title: z.string().trim().min(1, "Enter a title.").max(300),
  category: z.enum(ENUMS.EvidenceCategory),
  subFileId: z.string().max(64).optional(),
  source: z.string().max(300).optional(),
  provider: z.string().max(300).optional(),
  dateReceived: z.string().max(40).optional(),
  confidentiality: z.enum(ENUMS.Confidentiality).default("CONFIDENTIAL"),
  notes: z.string().max(20000).optional(),
  linkType: z.string().max(40).optional(),
  linkId: z.string().max(64).optional(),
});

async function logAccess(db: Tx | typeof prisma, evidenceId: string, userId: string, action: EvidenceAccessAction, detail?: string) {
  const meta = await requestMeta();
  await db.evidenceAccess.create({ data: { evidenceId, userId, action, detail: detail ?? null, ipAddress: meta.ipAddress } });
}

function assertClearance(user: CurrentUser, level: Confidentiality) {
  if (!clearanceCovers(user, level)) throw new AuthorizationError("This evidence is above your clearance level.");
}

async function validateLink(caseId: string, linkType?: string, linkId?: string) {
  if (!linkType && !linkId) return;
  if (!linkType || !linkId || !LINK_TYPES[linkType]) throw badRequest("Invalid linked record.");
  const r = RESOURCE_MAP[LINK_TYPES[linkType]!]!;
  const where = r.scope === "case" ? { id: linkId, caseId } : { id: linkId, matter: { caseId } };
  const found = await (prisma as unknown as Record<string, { findFirst(a: unknown): Promise<unknown> }>)[r.model]!.findFirst({ where, select: { id: true } });
  if (!found) throw badRequest("The linked record does not belong to this case.");
}

export interface CreatedEvidence {
  id: string;
  reference: string;
  sha256: string;
}

/** Stores an original (read-only) and a working copy, and opens the chain of custody. */
export async function createEvidence(
  tx: Tx,
  user: CurrentUser,
  c: { id: string; reference: string },
  input: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    sha256: string;
    title: string;
    category: (typeof ENUMS.EvidenceCategory)[number];
    subFileId?: string | null;
    source?: string | null;
    provider?: string | null;
    dateReceived?: Date | null;
    confidentiality: Confidentiality;
    notes?: string | null;
    linkType?: string | null;
    linkId?: string | null;
    scanStatus?: string;
  },
): Promise<CreatedEvidence> {
  const original = await storeFile(tx, { ...input, uploadedById: user.id, readOnly: true });
  const working = await storeFile(tx, { ...input, uploadedById: user.id, readOnly: true });
  const { sequence, reference } = await nextCaseReference(tx, "evidence", c);
  const ev = await tx.evidence.create({
    data: {
      reference,
      caseId: c.id,
      subFileId: input.subFileId ?? null,
      sequence,
      title: input.title,
      category: input.category,
      source: input.source ?? null,
      provider: input.provider ?? null,
      dateReceived: input.dateReceived ?? null,
      uploadedById: user.id,
      originalFileId: original.id,
      sha256: input.sha256,
      originalFilename: input.originalName,
      confidentiality: input.confidentiality,
      notes: input.notes ?? null,
      linkType: input.linkType ?? null,
      linkId: input.linkId ?? null,
    },
  });
  await tx.evidenceVersion.create({
    data: { evidenceId: ev.id, version: 1, fileId: working.id, sha256: input.sha256, note: "Working copy created from the original at upload", createdById: user.id },
  });
  await tx.custodyEvent.create({
    data: {
      evidenceId: ev.id,
      action: "RECEIVED",
      fromHolder: input.provider ?? input.source ?? null,
      toHolder: user.fullName,
      purpose: "Evidence received and logged",
      occurredAt: new Date(),
      recordedById: user.id,
    },
  });
  await logAccess(tx, ev.id, user.id, "UPLOAD", input.originalName);
  await tx.case.update({ where: { id: c.id }, data: { lastActivityAt: new Date() } });
  await audit(
    {
      action: "evidence.upload",
      actorId: user.id,
      actorLabel: user.username,
      entityType: "evidence",
      entityId: ev.id,
      caseId: c.id,
      after: { reference, sha256: input.sha256, originalFilename: input.originalName, category: input.category },
    },
    tx,
  );
  return { id: ev.id, reference, sha256: input.sha256 };
}

export async function uploadEvidence(user: CurrentUser, form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a file to upload.");
  const parsed = uploadSchema.parse({
    caseId: blank(form.get("caseId")),
    title: blank(form.get("title")),
    category: blank(form.get("category")),
    subFileId: blank(form.get("subFileId")),
    source: blank(form.get("source")),
    provider: blank(form.get("provider")),
    dateReceived: blank(form.get("dateReceived")),
    confidentiality: blank(form.get("confidentiality")),
    notes: blank(form.get("notes")),
    linkType: blank(form.get("linkType")),
    linkId: blank(form.get("linkId")),
  });
  const subject = await requireCaseAccess(user, parsed.caseId, "EVIDENCE", "CREATE");
  if (subject.status === "CLOSED") throw new ApiError(409, "INVALID_TRANSITION", "This case is closed. Reopen it before adding evidence.");
  assertClearance(user, parsed.confidentiality);
  if (parsed.subFileId && !(await prisma.subFile.findFirst({ where: { id: parsed.subFileId, caseId: parsed.caseId, isDeleted: false } }))) throw badRequest("Sub-file not found in this case.");
  await validateLink(parsed.caseId, parsed.linkType, parsed.linkId);
  const maxMb = await getSetting("uploads.maxFileMb");
  const upload = await validateUpload(file, { allowed: EVIDENCE_EXTENSIONS, maxBytes: maxMb * 1024 * 1024 });
  const dateReceived = parsed.dateReceived ? parseDateInput(parsed.dateReceived) : null;
  return prisma.$transaction((tx) => createEvidence(tx, user, subject, { ...upload, ...parsed, dateReceived }), { timeout: 60_000 });
}

async function loadEvidence(user: CurrentUser, id: string, action: "VIEW" | "EDIT" | "CREATE" = "VIEW") {
  const ev = await prisma.evidence.findUnique({ where: { id } });
  if (!ev) throw notFound("Evidence");
  const subject = await requireCaseAccess(user, ev.caseId, "EVIDENCE", action);
  assertClearance(user, ev.confidentiality);
  return { ev, subject };
}

export async function evidenceDetail(user: CurrentUser, id: string) {
  const { ev } = await loadEvidence(user, id);
  await logAccess(prisma, id, user.id, "VIEW");
  const [versions, access, custody, original] = await Promise.all([
    prisma.evidenceVersion.findMany({ where: { evidenceId: id }, orderBy: { version: "desc" } }),
    prisma.evidenceAccess.findMany({ where: { evidenceId: id }, orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { fullName: true } } } }),
    prisma.custodyEvent.findMany({ where: { evidenceId: id }, orderBy: { occurredAt: "desc" }, include: { recordedBy: { select: { fullName: true } } } }),
    prisma.storedFile.findUnique({ where: { id: ev.originalFileId }, select: { mimeType: true, sizeBytes: true, scanStatus: true } }),
  ]);
  const creators = await prisma.user.findMany({ where: { id: { in: versions.map((v) => v.createdById) } }, select: { id: true, fullName: true } });
  const names = Object.fromEntries(creators.map((u) => [u.id, u.fullName]));
  return {
    original,
    versions: versions.map((v) => ({ ...v, createdBy: names[v.createdById] ?? "Unknown" })),
    access: access.map((a) => ({ id: a.id, action: a.action, detail: a.detail, createdAt: a.createdAt, user: a.user.fullName })),
    custody: custody.map((c) => ({ ...c, recordedBy: c.recordedBy.fullName })),
  };
}

/** Streams the original or a working version. Every read is integrity-checked and logged. */
export async function evidenceFile(user: CurrentUser, id: string, which: string, inline: boolean) {
  const { ev } = await loadEvidence(user, id);
  let fileId = ev.originalFileId;
  let expected = ev.sha256;
  let label = "original";
  if (which !== "original") {
    const n = Number(which);
    const v = await prisma.evidenceVersion.findFirst({ where: { evidenceId: id, ...(Number.isInteger(n) && n > 0 ? { version: n } : {}) }, orderBy: { version: "desc" } });
    if (!v) throw notFound("Version");
    fileId = v.fileId;
    expected = v.sha256;
    label = `working copy v${v.version}`;
  }
  const f = await prisma.storedFile.findUniqueOrThrow({ where: { id: fileId } });
  const buffer = await readStoredFile(f.storageKey);
  if (sha256(buffer) !== expected) {
    await logAccess(prisma, id, user.id, "HASH_MISMATCH", label);
    await raiseAlert({ type: "EVIDENCE_HASH_MISMATCH", severity: "CRITICAL", message: `Integrity check failed for ${ev.reference} (${label}).`, subjectUserId: user.id });
    throw new ApiError(409, "PROTECTED_RECORD", "The file failed its integrity check and was not released. Administrators have been alerted.");
  }
  await logAccess(prisma, id, user.id, inline ? "PREVIEW" : "DOWNLOAD", label);
  await audit({
    action: inline ? "evidence.preview" : "evidence.download",
    actorId: user.id,
    actorLabel: user.username,
    entityType: "evidence",
    entityId: id,
    caseId: ev.caseId,
    details: { file: label },
  });
  const suffix = which === "original" ? "" : ` (${label})`;
  return fileResponse(buffer, { filename: suffix ? f.originalName.replace(/(\.[^.]+)?$/, `${suffix}$1`) : f.originalName, mime: f.mimeType, inline });
}

export async function addWorkingVersion(user: CurrentUser, id: string, form: FormData) {
  const { ev, subject } = await loadEvidence(user, id, "EDIT");
  if (subject.status === "CLOSED") throw new ApiError(409, "INVALID_TRANSITION", "This case is closed.");
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a file.");
  const note = blank(form.get("note"));
  if (!note) throw badRequest("Describe what changed in this working copy.");
  const maxMb = await getSetting("uploads.maxFileMb");
  const upload = await validateUpload(file, { allowed: EVIDENCE_EXTENSIONS, maxBytes: maxMb * 1024 * 1024 });
  return prisma.$transaction(async (tx) => {
    const last = await tx.evidenceVersion.findFirst({ where: { evidenceId: id }, orderBy: { version: "desc" } });
    const stored = await storeFile(tx, { ...upload, uploadedById: user.id, readOnly: true });
    const v = await tx.evidenceVersion.create({
      data: { evidenceId: id, version: (last?.version ?? 0) + 1, fileId: stored.id, sha256: upload.sha256, note: note.slice(0, 1000), createdById: user.id },
    });
    await logAccess(tx, id, user.id, "NEW_WORKING_VERSION", `v${v.version}`);
    await audit(
      { action: "evidence.new_version", actorId: user.id, actorLabel: user.username, entityType: "evidence", entityId: id, caseId: ev.caseId, after: { version: v.version, sha256: upload.sha256 } },
      tx,
    );
    return v;
  });
}

const custodySchema = z.object({
  action: z.enum(["TRANSFERRED", "RETURNED", "SUBMITTED_TO_AUTHORITY", "STORED", "RECEIVED"]),
  fromHolder: z.string().trim().max(200).optional(),
  toHolder: z.string().trim().min(1, "Enter who holds the item now.").max(200),
  purpose: z.string().trim().min(3, "Enter the purpose.").max(1000),
  occurredAt: z.unknown().transform((v, ctx) => {
    const d = parseDateInput(v, true);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return d;
  }),
});

export async function addCustodyEvent(user: CurrentUser, id: string, body: unknown) {
  const { ev } = await loadEvidence(user, id, "EDIT");
  const input = custodySchema.parse(body);
  return prisma.$transaction(async (tx) => {
    const e = await tx.custodyEvent.create({
      data: { evidenceId: id, action: input.action, fromHolder: input.fromHolder ?? null, toHolder: input.toHolder, purpose: input.purpose, occurredAt: input.occurredAt, recordedById: user.id },
    });
    await audit(
      { action: "evidence.custody", actorId: user.id, actorLabel: user.username, entityType: "evidence", entityId: id, caseId: ev.caseId, after: { action: input.action, toHolder: input.toHolder } },
      tx,
    );
    return e;
  });
}

export async function setEvidenceLegalHold(user: CurrentUser, id: string, on: boolean, reason: string) {
  const ev = await prisma.evidence.findUnique({ where: { id } });
  if (!ev) throw notFound("Evidence");
  await requireCaseAccess(user, ev.caseId, "CASES", "APPROVE");
  if (!reason.trim()) throw badRequest("A reason is required.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.evidence.update({ where: { id }, data: { legalHold: on, version: { increment: 1 } } });
    await logAccess(tx, id, user.id, on ? "LEGAL_HOLD_ON" : "LEGAL_HOLD_OFF", reason.slice(0, 500));
    await audit(
      {
        action: on ? "evidence.legal_hold.on" : "evidence.legal_hold.off",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "evidence",
        entityId: id,
        caseId: ev.caseId,
        reason,
        before: { legalHold: ev.legalHold },
        after: { legalHold: on },
      },
      tx,
    );
    return updated;
  });
}

export async function verifyEvidenceHash(user: CurrentUser, id: string) {
  const { ev } = await loadEvidence(user, id);
  const f = await prisma.storedFile.findUniqueOrThrow({ where: { id: ev.originalFileId } });
  const actual = sha256(await readStoredFile(f.storageKey));
  const ok = actual === ev.sha256;
  await logAccess(prisma, id, user.id, ok ? "HASH_VERIFIED" : "HASH_MISMATCH");
  if (!ok) await raiseAlert({ type: "EVIDENCE_HASH_MISMATCH", severity: "CRITICAL", message: `Integrity check failed for ${ev.reference}.`, subjectUserId: user.id });
  await audit({ action: "evidence.verify_hash", actorId: user.id, actorLabel: user.username, entityType: "evidence", entityId: id, caseId: ev.caseId, outcome: ok ? "SUCCESS" : "FAILURE" });
  return { ok, expected: ev.sha256, actual };
}

/** Uploads the signed copy of a statement as evidence and marks the statement signed (then immutable). */
export async function uploadSignedStatement(user: CurrentUser, statementId: string, form: FormData) {
  const st = await prisma.partyStatement.findUnique({ where: { id: statementId } });
  if (!st || st.isDeleted) throw notFound("Statement");
  const subject = await requireCaseAccess(user, st.caseId, "INTERVIEWS", "EDIT");
  await requireCaseAccess(user, st.caseId, "EVIDENCE", "CREATE");
  if (subject.status === "CLOSED") throw new ApiError(409, "INVALID_TRANSITION", "This case is closed.");
  if (st.signed) throw new ApiError(409, "PROTECTED_RECORD", "A signed copy has already been recorded for this statement.");
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose the signed statement file.");
  const maxMb = await getSetting("uploads.maxFileMb");
  const upload = await validateUpload(file, { allowed: ["pdf", "png", "jpg", "jpeg", "tif", "tiff"], maxBytes: maxMb * 1024 * 1024 });
  return prisma.$transaction(async (tx) => {
    const ev = await createEvidence(tx, user, subject, {
      ...upload,
      title: `Signed statement — ${st.kind.replace(/_/g, " ").toLowerCase()} (${st.statementDate.toISOString().slice(0, 10)})`,
      category: "SIGNED_STATEMENT",
      confidentiality: "CONFIDENTIAL",
      source: st.recordedBy,
      dateReceived: new Date(),
      linkType: st.partyId ? "PARTY" : null,
      linkId: st.partyId,
    });
    const updated = await tx.partyStatement.update({ where: { id: statementId }, data: { signed: true, evidenceId: ev.id, version: { increment: 1 } } });
    await audit(
      {
        action: "party-statements.signed_copy",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "partyStatement",
        entityId: statementId,
        caseId: st.caseId,
        after: { evidence: ev.reference, sha256: ev.sha256 },
      },
      tx,
    );
    return { statement: updated, evidence: ev };
  });
}
