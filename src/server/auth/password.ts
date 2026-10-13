import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

// OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Verified against when the username does not exist, so response time does not reveal valid usernames.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hash("sims-timing-equaliser", OPTIONS);
  await verifyPassword(await dummyHash, password);
}

/** A random temporary password that satisfies the password policy; the user must replace it at first sign-in. */
export function temporaryPassword(): string {
  const base = randomBytes(12).toString("base64url").replace(/[-_]/g, "x");
  return `Tmp-${base}9!`;
}
