import { expect, test, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { PROD } from "./env";

test.describe.configure({ mode: "serial" });

const code = (secret: string, offsetSteps = 0) => new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate({ timestamp: Date.now() + offsetSteps * 30_000 });

let secret = "";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function signIn(page: Page, password: string) {
  await page.goto("/login");
  await page.getByLabel("Username or work email").fill(PROD.admin);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("production headers: strict CSP without eval, HSTS-ready security headers, no demo banner", async ({ page }) => {
  const res = await page.goto("/login");
  const h = res!.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic';/);
  expect(h["content-security-policy"]).not.toContain("unsafe-eval");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-powered-by"]).toBeUndefined();
  await expect(page.getByText("DEMO MODE")).toHaveCount(0);
});

test("the bootstrapped administrator must change the temporary password, then enrol two-step verification", async ({ page, context }) => {
  const errors = collectErrors(page);
  await signIn(page, PROD.temporaryPassword());
  await expect(page).toHaveURL(/\/change-password$/);
  const cookie = (await context.cookies()).find((c) => c.name.includes("sims_session"))!;
  expect(cookie.name).toBe("__Host-sims_session");
  expect(cookie.secure).toBe(true);
  expect(cookie.httpOnly).toBe(true);

  await page.getByLabel("Current password").fill(PROD.temporaryPassword());
  await page.getByLabel("New password", { exact: true }).fill(PROD.newPassword);
  await page.getByLabel("Confirm new password").fill(PROD.newPassword);
  await page.getByRole("button", { name: "Update password" }).click();

  // Production administrators cannot use the system until two-step verification is on:
  // the redirect to the dashboard lands on the set-up page, and direct visits do too.
  await expect(page).toHaveURL(/\/mfa\/setup$/);
  await page.goto("/cases");
  await expect(page).toHaveURL(/\/mfa\/setup$/);
  const api = await page.request.get("/api/v1/cases");
  expect(api.status()).toBe(403);
  await expect(page.getByText("Administrator accounts must use two-step verification")).toBeVisible();
  await expect(page.getByRole("link", { name: "Not now" })).toHaveCount(0);

  await page.getByRole("button", { name: "Start set-up" }).click();
  secret = (await page.getByLabel("Set-up key").textContent())!.replace(/\s+/g, "");
  await page.getByLabel("6-digit code").fill(code(secret));
  await page.getByRole("button", { name: "Turn on two-step verification" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");
  expect(errors).toEqual([]);
});

test("sign-in now requires a code; key pages render in production without console errors", async ({ page }) => {
  const errors = collectErrors(page);
  await signIn(page, PROD.newPassword);
  await expect(page).toHaveURL(/\/mfa$/);
  await page.getByLabel("6-digit code").fill(code(secret, 1));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const path of ["/cases", "/cases/new", "/statements", "/reports", "/admin/users", "/admin/audit", "/admin/data", "/api-docs", "/mfa/setup"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
  // Administrators cannot switch MFA off in production.
  await expect(page.getByText("Administrator accounts must keep two-step verification switched on.")).toBeVisible();
  expect(errors).toEqual([]);
});
