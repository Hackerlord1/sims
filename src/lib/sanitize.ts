// Strips secrets from anything headed for the audit log or application logs.

const SECRET_KEY = /pass(word)?|pwd|secret|token|otp|mfa.?code|hash|authorization|cookie|api.?key/i;
export const REDACTED = "[REDACTED]";

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => sanitizeForLog(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    // Decimal and similar value objects serialise via toString / toJSON.
    const maybe = value as { toJSON?: () => unknown };
    if (typeof maybe.toJSON === "function" && !(value.constructor === Object)) return maybe.toJSON();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? REDACTED : sanitizeForLog(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 2000) return value.slice(0, 2000) + "…";
  return value;
}
