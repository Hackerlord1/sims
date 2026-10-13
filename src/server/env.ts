import "server-only";
import { z } from "zod";
import { assertDemoModeAllowed } from "@/server/demo-guard";

const base64Key = z
  .string()
  .min(1)
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded");

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: base64Key,
  DATA_ENCRYPTION_KEY: base64Key,
  APP_URL: z.string().url().default("http://localhost:3000"),
  STORAGE_DIR: z.string().default("./storage"),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Throws on misconfiguration, including DEMO_MODE in production. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${fields}`);
  }
  assertDemoModeAllowed(process.env);
  cached = parsed.data;
  return cached;
}

export const isProduction = () => process.env.NODE_ENV === "production";
