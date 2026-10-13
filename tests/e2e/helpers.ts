import { expect, type Browser, type Page } from "@playwright/test";
import { E2E } from "./env";

export async function signIn(page: Page, username: string, password = E2E.password) {
  await page.goto("/login");
  await page.getByLabel("Username or work email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(dashboard|change-password)/);
}

/** A signed-in page in its own browser context (so several roles can act in one test). */
export async function as(browser: Browser, username: string, password = E2E.password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await signIn(page, username, password);
  return page;
}

/** Picks an option in an AsyncSelect combobox by typing and choosing the first match. */
export async function pick(page: Page, label: string | RegExp, text: string, scope?: ReturnType<Page["locator"]>) {
  const root = scope ?? page;
  const box = root.getByRole("combobox", { name: label });
  await box.click();
  await box.fill(text);
  const option = page.getByRole("option", { name: new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
  await option.waitFor();
  await option.click();
}

export const drawer = (page: Page) => page.getByRole("dialog").last();

export async function toast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

export async function openTab(page: Page, name: string | RegExp) {
  await page.getByRole("tab", { name }).click();
}

/** Clicks the first table row containing `text` (opens the record drawer). */
export async function openRow(page: Page, text: string) {
  await page.locator("tbody tr", { hasText: text }).first().getByRole("button").first().click();
}
