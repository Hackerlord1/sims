import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Tx } from "@/server/db";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/api/errors";

/** Allowed upload types: extension → accepted MIME types and a content check. */
const TYPES: Record<string, { mimes: string[]; sniff?: (b: Buffer) => boolean }> = {
  pdf: { mimes: ["application/pdf"], sniff: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  png: { mimes: ["image/png"], sniff: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mimes: ["image/jpeg"], sniff: (b) => b[0] === 0xff && b[1] === 0xd8 },
  jpeg: { mimes: ["image/jpeg"], sniff: (b) => b[0] === 0xff && b[1] === 0xd8 },
  gif: { mimes: ["image/gif"], sniff: (b) => b.subarray(0, 3).toString("latin1") === "GIF" },
  webp: { mimes: ["image/webp"], sniff: (b) => b.subarray(8, 12).toString("latin1") === "WEBP" },
  tif: { mimes: ["image/tiff"] },
  tiff: { mimes: ["image/tiff"] },
  txt: { mimes: ["text/plain"] },
  csv: { mimes: ["text/csv", "application/vnd.ms-excel", "text/plain"] },
  xlsx: { mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], sniff: isZip },
  docx: { mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], sniff: isZip },
  zip: { mimes: ["application/zip", "application/x-zip-compressed"], sniff: isZip },
  eml: { mimes: ["message/rfc822"] },
  msg: { mimes: ["application/vnd.ms-outlook", "application/octet-stream"] },
  mp3: { mimes: ["audio/mpeg"] },
  m4a: { mimes: ["audio/mp4", "audio/x-m4a"] },
  wav: { mimes: ["audio/wav", "audio/x-wav"] },
  mp4: { mimes: ["video/mp4"] },
};

function isZip(b: Buffer) {
  return b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05);
}

export const EVIDENCE_EXTENSIONS = Object.keys(TYPES);
export const STATEMENT_EXTENSIONS = ["pdf", "csv", "xlsx"];
export const IMPORT_EXTENSIONS = ["csv", "xlsx", "zip", "pdf", "docx"];

const PREVIEWABLE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain", "text/csv"]);
export const isPreviewable = (mime: string) => PREVIEWABLE.has(mime);

export function storageRoot(): string {
  const dir = process.env.STORAGE_DIR || "./storage";
  // The file store lives outside the application at run time; keep it out of build output tracing.
  const root = path.resolve(/* turbopackIgnore: true */ dir);
  const publicDir = path.resolve("public");
  if (root === publicDir || root.startsWith(publicDir + path.sep)) {
    throw new Error("STORAGE_DIR must be outside the public web directory.");
  }
  return root;
}

/** Resolves a storage key to a path, refusing anything that would escape the storage root. */
export function keyToPath(key: string): string {
  if (!/^[a-f0-9]{2}\/[a-f0-9]{48}$/.test(key)) throw new Error("Invalid storage key");
  const root = storageRoot();
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return p;
}

export function safeFilename(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/")).normalize("NFKC");
  const cleaned = base
    .replace(/[^\w.\- ()]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return cleaned || "file";
}

export function extensionOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

export interface ValidatedUpload {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  ext: string;
  sha256: string;
}

/** Validates extension, declared MIME type, content signature and size. */
export async function validateUpload(file: File, opts: { allowed: string[]; maxBytes: number }): Promise<ValidatedUpload> {
  const originalName = safeFilename(file.name);
  const ext = extensionOf(originalName);
  if (!opts.allowed.includes(ext) || !TYPES[ext]) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", `Files of type .${ext || "?"} are not accepted. Allowed: ${opts.allowed.map((e) => "." + e).join(", ")}.`);
  }
  if (file.size === 0) throw new ApiError(400, "BAD_REQUEST", "The file is empty.");
  if (file.size > opts.maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", `The file exceeds the ${Math.round(opts.maxBytes / 1024 / 1024)} MB limit.`);
  const type = TYPES[ext]!;
  const declared = (file.type || "application/octet-stream").toLowerCase();
  if (declared !== "application/octet-stream" && !type.mimes.includes(declared)) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "The file type does not match its extension.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (type.sniff && !type.sniff(buffer)) throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "The file content does not match its extension.");
  await scanForMalware(buffer, originalName);
  return { buffer, originalName, mimeType: type.mimes[0]!, ext, sha256: createHash("sha256").update(buffer).digest("hex") };
}

/**
 * Malware-scanning integration point. Set MALWARE_SCAN_URL to an HTTP scanner (for example a
 * ClamAV REST service) that answers { clean: boolean }. Without it, files are recorded as
 * NOT_SCANNED and the EICAR test signature is still rejected.
 */
export async function scanForMalware(buffer: Buffer, name: string): Promise<"CLEAN" | "NOT_SCANNED"> {
  if (buffer.includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"))) {
    throw new ApiError(422, "VALIDATION_FAILED", "The file was rejected by the malware check.");
  }
  const url = process.env.MALWARE_SCAN_URL;
  if (!url) return "NOT_SCANNED";
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/octet-stream", "x-filename": encodeURIComponent(name) }, body: new Uint8Array(buffer) });
  if (!res.ok) throw new ApiError(503, "INTERNAL", "The malware scanner is unavailable. Try again later.");
  const body = (await res.json()) as { clean?: boolean };
  if (!body.clean) throw new ApiError(422, "VALIDATION_FAILED", "The file was rejected by the malware check.");
  return "CLEAN";
}

/** Writes bytes under a random name and records a StoredFile. Originals are made read-only on disk. */
export async function storeFile(
  db: Tx | typeof prisma,
  input: { buffer: Buffer; originalName: string; mimeType: string; sha256: string; uploadedById: string; readOnly?: boolean; scanStatus?: string },
) {
  const name = randomBytes(24).toString("hex");
  const key = `${name.slice(0, 2)}/${name}`;
  const file = keyToPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, input.buffer, { flag: "wx" });
  if (input.readOnly !== false) await chmod(file, 0o444);
  return db.storedFile.create({
    data: {
      sha256: input.sha256,
      storageKey: key,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      readOnly: input.readOnly !== false,
      scanStatus: input.scanStatus ?? "NOT_SCANNED",
      uploadedById: input.uploadedById,
    },
  });
}

export async function readStoredFile(key: string): Promise<Buffer> {
  return readFile(/* turbopackIgnore: true */ keyToPath(key));
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    await stat(/* turbopackIgnore: true */ keyToPath(key));
    return true;
  } catch {
    return false;
  }
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** File response with safe headers: attachment unless explicitly previewable, never sniffed. */
export function fileResponse(buffer: Buffer, opts: { filename: string; mime: string; inline?: boolean }): Response {
  const disposition = opts.inline && isPreviewable(opts.mime) ? "inline" : "attachment";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": opts.mime,
      "content-length": String(buffer.length),
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "cache-control": "no-store",
    },
  });
}
