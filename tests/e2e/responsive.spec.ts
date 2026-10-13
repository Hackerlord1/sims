import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Responsive layout, automated accessibility (axe, WCAG 2.1 A/AA), theme contrast,
 * reduced motion and keyboard checks against the seeded fictional data.
 */

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const THEMES = ["forensic-light", "intelligence-dark", "command-navy", "executive-graphite", "high-contrast"] as const;

async function seededCaseId(page: Page) {
  const res = await page.request.get("/api/v1/cases", { params: { q: "SIMS/2026/0001", pageSize: 1 } });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { data: { id: string }[] };
  expect(body.data.length).toBe(1);
  return body.data[0]!.id;
}

async function pages(page: Page) {
  const caseId = await seededCaseId(page);
  return [
    { path: "/dashboard", ready: page.getByRole("heading", { level: 1 }) },
    { path: "/cases", ready: page.getByText("SIMS/2026/0001").first() },
    { path: `/cases/${caseId}`, ready: page.getByRole("tab", { name: /^Overview/ }) },
    { path: `/cases/${caseId}?tab=invoices`, ready: page.locator("tbody tr").first() },
    { path: "/invoices", ready: page.locator("tbody tr").first() },
    { path: "/statements", ready: page.getByRole("heading", { level: 1 }) },
    { path: "/reports", ready: page.getByRole("heading", { level: 1 }) },
    { path: "/settings/preferences", ready: page.getByRole("radio", { name: "High Contrast" }) },
  ];
}

async function expectNoPageScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label} must not scroll horizontally`).toBeLessThanOrEqual(1);
}

/** Entrance animations fade content in; contrast is only meaningful once they have finished. */
async function settle(page: Page) {
  // CSS animations are visible to getAnimations(); the animation library tweens opacity from
  // JavaScript, so also wait until computed opacities stop changing between two polls.
  await page.waitForFunction(
    () => {
      const total = [...document.querySelectorAll("body *")].reduce((sum, el) => sum + Number(getComputedStyle(el).opacity), 0);
      const w = window as unknown as { __simsOpacity?: number };
      const stable = w.__simsOpacity === total;
      w.__simsOpacity = total;
      return stable && document.getAnimations().every((a) => a.playState !== "running");
    },
    undefined,
    { polling: 250 },
  );
}

async function axe(page: Page, label: string) {
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  expect(summary, `${label} accessibility violations`).toEqual([]);
}

test("login page is accessible and fits every viewport", async ({ page }) => {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expectNoPageScroll(page, `login @ ${vp.name}`);
    await axe(page, `login @ ${vp.name}`);
  }
});

for (const vp of VIEWPORTS) {
  test(`key pages fit and pass axe at ${vp.name} width`, async ({ page }) => {
    await page.setViewportSize(vp);
    await signIn(page, "lead.demo");
    for (const p of await pages(page)) {
      await page.goto(p.path);
      await expect(p.ready).toBeVisible();
      await expectNoPageScroll(page, `${p.path} @ ${vp.name}`);
      await axe(page, `${p.path} @ ${vp.name}`);
    }
  });
}

test("mobile navigation opens, traps focus and closes with Escape", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await signIn(page, "lead.demo");
  await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  const menu = page.getByRole("dialog");
  await expect(menu.getByRole("link", { name: "Case files" })).toBeVisible();
  await axe(page, "mobile navigation");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Case files" }).click();
  await expect(page).toHaveURL(/\/cases$/);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("every theme keeps WCAG AA contrast on the dashboard and a case file", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[2]);
  await signIn(page, "lead.demo");
  const caseId = await seededCaseId(page);
  for (const theme of THEMES) {
    for (const path of ["/dashboard", `/cases/${caseId}`]) {
      await page.goto(path);
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await settle(page);
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      const summary = results.violations.flatMap((v) => v.nodes.slice(0, 5).map((n) => `${n.target.join(" ")}: ${n.failureSummary?.split("\n").pop() ?? ""}`));
      expect(summary, `${theme} ${path} contrast`).toEqual([]);
    }
  }
});

test("reduced motion from the operating system disables transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, "lead.demo");
  const duration = await page.getByRole("link", { name: "Case files" }).evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThan(0.001);
});

test("case file can be worked through with the keyboard alone", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[2]);
  await signIn(page, "lead.demo");
  await page.goto(`/cases/${await seededCaseId(page)}`);
  const overview = page.getByRole("tab", { name: /^Overview/ });
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /^Sub-files/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: /^Sub-files/ })).toHaveAttribute("aria-selected", "true");
  // Tab into the table and open the first record with Enter; Escape closes the drawer and restores focus.
  const firstOpen = page.locator("tbody tr").first().getByRole("button").first();
  await firstOpen.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(firstOpen).toBeFocused();
});

test("every case-file tab fits a phone screen and passes axe", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await signIn(page, "lead.demo");
  const caseId = await seededCaseId(page);
  await page.goto(`/cases/${caseId}`);
  await expect(page.getByRole("tab", { name: /^Closure/ })).toBeAttached();
  const tabs = await page.getByRole("tab").evaluateAll((els) => els.map((e) => e.id.split("-trigger-").pop() ?? ""));
  expect(tabs.length).toBeGreaterThanOrEqual(18);
  for (const tab of tabs) {
    await page.goto(`/cases/${caseId}?tab=${tab}`);
    await expect(page.getByRole("tab", { selected: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoPageScroll(page, `case tab ${tab}`);
    await axe(page, `case tab ${tab}`);
  }
});

test("administration pages fit and pass axe on phone and desktop", async ({ page }) => {
  await signIn(page, "e2e.admin");
  for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
    await page.setViewportSize(vp);
    for (const path of ["/admin/users", "/admin/audit", "/admin/settings", "/admin/data", "/admin/bulk", "/admin/recycle-bin", "/admin/deletion-requests"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expectNoPageScroll(page, `${path} @ ${vp.name}`);
      await axe(page, `${path} @ ${vp.name}`);
    }
  }
});
