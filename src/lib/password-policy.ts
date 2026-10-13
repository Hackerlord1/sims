// Password rules shared by the change-password form and the server. The server re-validates.

export const PASSWORD_MIN_LENGTH = 12;

const COMMON = new Set(["password", "password1", "password123", "123456789012", "qwertyuiop12", "welcome12345", "savemore1234", "savemore2026", "letmein12345", "administrator", "changeme1234"]);

export interface PasswordCheck {
  ok: boolean;
  problems: string[];
}

export function checkPasswordStrength(password: string, context: { username?: string; fullName?: string } = {}): PasswordCheck {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (password.length > 128) problems.push("Use at most 128 characters.");
  if (!/[a-z]/.test(password)) problems.push("Include a lowercase letter.");
  if (!/[A-Z]/.test(password)) problems.push("Include an uppercase letter.");
  if (!/\d/.test(password)) problems.push("Include a number.");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("Include a symbol.");
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) problems.push("This password is too common.");
  if (context.username && context.username.length >= 3 && lower.includes(context.username.toLowerCase())) {
    problems.push("Do not include your username.");
  }
  for (const part of (context.fullName ?? "").toLowerCase().split(/\s+/)) {
    if (part.length >= 4 && lower.includes(part)) {
      problems.push("Do not include your name.");
      break;
    }
  }
  if (/(.)\1{3,}/.test(password)) problems.push("Avoid repeating the same character 4+ times.");
  return { ok: problems.length === 0, problems };
}
