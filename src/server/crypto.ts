import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** 256-bit random token, URL-safe. Only its keyed hash is ever stored. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** HMAC-SHA256 of a token with SESSION_SECRET, so a database leak alone cannot forge sessions. */
export function hashToken(token: string): string {
  return createHmac("sha256", Buffer.from(env().SESSION_SECRET, "base64")).update(token).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// AES-256-GCM for small secrets at rest (e.g. TOTP secrets). Format: v1.<iv>.<tag>.<ciphertext>
export function encryptSecret(plain: string): string {
  const key = Buffer.from(env().DATA_ENCRYPTION_KEY, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported secret format");
  const key = Buffer.from(env().DATA_ENCRYPTION_KEY, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
