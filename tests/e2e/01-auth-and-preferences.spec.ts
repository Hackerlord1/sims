import { expect, test } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { E2E } from "./env";
import { signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("workflow 1: sign in (forced password change for the temporary password) and sign out", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/authorized Savemore personnel only/i).first()).toBeVisible();

  await page.getByLabel("Username or work email").fill("felix");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("incorrect");

  await page.getByLabel("Password", { exact: true }).fill(E2E.felixTemp);
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/change-password$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("Current password").fill(E2E.felixTemp);
  await page.getByLabel("New password", { exact: true }).fill("weak");
  await page.getByLabel("Confirm new password").fill("weak");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.locator("form [role=alert]").first()).toContainText(/stronger password/i);
  await page.getByLabel("Current password").fill(E2E.felixTemp);
  await page.getByLabel("New password", { exact: true }).fill(E2E.felixNew);
  await page.getByLabel("Confirm new password").fill(E2E.felixNew);
  await page.getByRole("button", { name: "Update password" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome, Felix" })).toBeVisible();
  await expect(page.getByText("DEMO MODE").first()).toBeVisible();

  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/cases");
  await expect(page).toHaveURL(/\/login/);

  // The temporary password no longer works; the new one does.
  await page.getByLabel("Username or work email").fill("felix");
  await page.getByLabel("Password", { exact: true }).fill(E2E.felixTemp);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("incorrect");
  await signIn(page, "felix", E2E.felixNew);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("themes, text size and reduced motion apply immediately and persist", async ({ page }) => {
  await signIn(page, "investigator.demo");
  await page.goto("/settings/preferences");
  for (const [label, value] of [
    ["Intelligence Dark", "intelligence-dark"],
    ["Command Navy", "command-navy"],
    ["Executive Graphite", "executive-graphite"],
    ["High Contrast", "high-contrast"],
    ["Forensic Light", "forensic-light"],
  ] as const) {
    await page.getByRole("radio", { name: label }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", value);
  }
  await page.getByRole("radio", { name: "125%" }).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("style", /--font-scale:\s*1\.25/);
  await page.getByRole("radio", { name: "Reduce motion" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await expect(page.getByRole("status")).toHaveText("Preferences saved.");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "forensic-light");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await page.getByRole("radio", { name: "System theme" }).check();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  await page.getByRole("radio", { name: "100%" }).check({ force: true });
});

test("keyboard users can skip to content and search with /", async ({ page }) => {
  await signIn(page, "lead.demo");
  await page.goto("/cases");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await page.keyboard.press("/");
  await expect(page.getByLabel(/Search cases, people/)).toBeFocused();
  await page.keyboard.type("INV-DEMO-1001");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=INV-DEMO-1001/);
  await expect(page.getByText("Invoice INV-DEMO-1001")).toBeVisible();
});

test("unauthorized pages and API calls are refused", async ({ page }) => {
  await signIn(page, "executive.demo");
  const res = await page.goto("/admin/users");
  expect(res?.status()).toBe(404);
  const api = await page.request.post("/api/v1/cases", { headers: { "x-sims-csrf": "1" }, data: { title: "x" } });
  expect(api.status()).toBe(403);
  await expect(page.getByRole("link", { name: "Data administration" })).toHaveCount(0);
});

test("two-step verification: enrol with an authenticator code, then it is required at sign-in", async ({ page }) => {
  const code = (secret: string, offsetSteps = 0) =>
    new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate({ timestamp: Date.now() + offsetSteps * 30_000 });
  await signIn(page, "hr.demo");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Two-step verification" }).click();
  await expect(page).toHaveURL(/\/mfa\/setup$/);
  await page.getByRole("button", { name: "Start set-up" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  const secret = (await page.getByLabel("Set-up key").textContent())!.replace(/\s+/g, "");
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Turn on two-step verification" }).click();
  await expect(page.locator("form [role=alert]")).toContainText(/did not match/);
  await page.getByLabel("6-digit code").fill(code(secret));
  await page.getByRole("button", { name: "Turn on two-step verification" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Username or work email").fill("hr.demo");
  await page.getByLabel("Password", { exact: true }).fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/mfa$/);
  await page.goto("/cases");
  await expect(page).toHaveURL(/\/mfa$/);
  await page.getByLabel("6-digit code").fill(code(secret, 1));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("pages carry a nonce-based Content Security Policy and security headers; API docs render under it", async ({ page }) => {
  const res = await page.goto("/login");
  const headers = res!.headers();
  expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, "e2e.admin");
  await page.goto("/api-docs");
  await expect(page.getByRole("heading", { name: /Savemore Investigation Management System API/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cases", level: 3 })).toBeVisible();
  expect(errors.filter((e) => /Content Security Policy|Refused to/i.test(e))).toEqual([]);
});
