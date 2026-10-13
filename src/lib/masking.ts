// Masking for financial identifiers and personal data shown to users without full clearance,
// and for anything written to logs.

/** "0123456789" → "••••••6789". Keeps the last four characters. */
export function maskAccount(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  const v = value.replace(/\s+/g, "");
  if (v.length <= 4) return "•".repeat(v.length);
  return "•".repeat(Math.min(v.length - 4, 8)) + v.slice(-4);
}

/** "0712345678" → "0712•••678"; "+254712345678" → "+254712•••678". */
export function maskPhone(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  const v = value.replace(/\s+/g, "");
  if (v.length < 7) return "•".repeat(v.length);
  return v.slice(0, v.length - 6) + "•••" + v.slice(-3);
}

/** National ID / passport: show the last three characters only. */
export function maskId(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  const v = value.replace(/\s+/g, "");
  if (v.length <= 3) return "•".repeat(v.length);
  return "•".repeat(v.length - 3) + v.slice(-3);
}

/** Normalises Kenyan phone numbers to 2547XXXXXXXX so different spellings compare equal. */
export function normalisePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("254")) return digits;
  if (digits.length === 10 && digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.length === 9 && /^[17]/.test(digits)) return "254" + digits;
  return digits.length >= 7 ? digits : null;
}
