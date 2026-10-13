import { describe, expect, it } from "vitest";
import { checkPasswordStrength } from "./password-policy";
import { REDACTED, sanitizeForLog } from "./sanitize";

describe("password policy", () => {
  it("rejects the temporary demo password", () => {
    expect(checkPasswordStrength("1234").ok).toBe(false);
  });

  it("accepts a strong password", () => {
    expect(checkPasswordStrength("Tr4ck-Inv3stigate!", { username: "felix", fullName: "Felix Guto" }).ok).toBe(true);
  });

  it("rejects passwords containing the username or name", () => {
    expect(checkPasswordStrength("Felix-Strong-2026!", { username: "felix" }).ok).toBe(false);
    expect(checkPasswordStrength("Guto#Strong2026x", { fullName: "Felix Guto" }).ok).toBe(false);
  });

  it("lists each missing requirement", () => {
    const r = checkPasswordStrength("alllowercaseletters");
    expect(r.problems).toEqual(expect.arrayContaining(["Include an uppercase letter.", "Include a number.", "Include a symbol."]));
  });
});

describe("log sanitisation", () => {
  it("redacts secrets at any depth", () => {
    const out = sanitizeForLog({
      username: "felix",
      password: "1234",
      nested: { resetToken: "abc", mfaCode: "123456", keep: "yes" },
      list: [{ newPassword: "x" }],
    }) as Record<string, unknown>;
    expect(out.password).toBe(REDACTED);
    expect(out.username).toBe("felix");
    expect(out.nested).toEqual({ resetToken: REDACTED, mfaCode: REDACTED, keep: "yes" });
    expect(out.list).toEqual([{ newPassword: REDACTED }]);
    expect(JSON.stringify(out)).not.toContain("1234");
  });
});
