import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./env";
import { as, drawer, openRow, openTab, pick } from "./helpers";

// Workflows 2–24 of the acceptance list, in order, on a fresh fictional case.
test.describe.configure({ mode: "serial" });

const samples = path.resolve(__dirname, "../../samples");
const TITLE = `E2E fictional case ${Date.now()}`;
let caseUrl = "";
let lead: Page;

async function createInTab(p: Page, button: string, fill: (d: ReturnType<typeof drawer>) => Promise<void>, submit: string) {
  await p.getByRole("button", { name: button }).first().click();
  const d = drawer(p);
  await expect(d.getByRole("button", { name: submit })).toBeVisible();
  await fill(d);
  await d.getByRole("button", { name: submit }).click();
  // After creating, the drawer shows the new record with its actions.
  await expect(drawer(p).getByRole("button", { name: "Edit", exact: true })).toBeVisible();
}

async function closeDrawer(p: Page) {
  await drawer(p)
    .getByRole("button", { name: /Close panel/ })
    .click();
  await expect(p.getByRole("dialog")).toHaveCount(0);
}

test.beforeAll(async ({ browser }) => {
  lead = await as(browser, "lead.demo");
});

test("workflow 2: create a main case", async () => {
  await lead.goto("/cases/new");
  await lead.getByLabel(/^Case title/).fill(TITLE);
  await pick(lead, /^Company/, "Savemore Demo Trading");
  await lead.getByLabel(/^Case category/).selectOption("INVOICE_IRREGULARITY");
  await lead.getByLabel(/^Location/).fill("Busia");
  await pick(lead, /^Lead investigator/, "Amina Lead");
  await lead.getByLabel(/^Amount confirmed recoverable/).fill("500000");
  await lead.getByRole("button", { name: "Open case" }).click();
  await expect(lead).toHaveURL(/\/cases\/[a-z0-9]+\?opened=1/);
  await expect(lead.getByRole("status").filter({ hasText: "opened" })).toBeVisible();
  await expect(lead.getByRole("heading", { name: TITLE })).toBeVisible();
  caseUrl = lead.url().replace(/\?.*$/, "");
  await lead.getByRole("button", { name: "Change status" }).click();
  await lead.getByRole("menuitem", { name: "Under internal investigation" }).click();
  await lead.getByLabel(/^Reason/).fill("Preliminary review done");
  await lead.getByRole("button", { name: "Change status" }).last().click();
  await expect(lead.getByText("Under internal investigation").first()).toBeVisible();
});

test("workflow 3: create sub-files", async () => {
  await openTab(lead, /^Sub-files/);
  for (const t of ["Sales Made to Busia", "Bad Cheques"]) {
    await createInTab(lead, "New sub-file", async (d) => d.getByLabel(/^Title/).fill(t), "Create sub-file");
    await closeDrawer(lead);
  }
  await expect(lead.locator("tbody tr")).toHaveCount(2);
});

test("workflow 4: add invoices", async () => {
  await openTab(lead, /^Invoices/);
  await createInTab(
    lead,
    "New invoice",
    async (d) => {
      await d.getByLabel(/^Invoice number/).fill("INV-E2E-001");
      await d.getByLabel(/^Invoice date/).fill("2026-03-02");
      await d.locator("#f-invoices-customerName").fill("E2E Fictional Traders");
      await d.getByLabel(/^Invoice amount/).fill("84500");
      await d.getByLabel(/^Classification/).selectOption("MPESA_PAID_TO_PERSONAL_NUMBER");
      await pick(lead, /^Sub-file/, "Sales Made to Busia", d);
    },
    "Create invoice",
  );
  await closeDrawer(lead);
  await expect(lead.getByText("INV-E2E-001")).toBeVisible();
});

test("workflow 5: add bad cheques (with warnings)", async () => {
  await openTab(lead, /^Bad cheques/);
  await createInTab(
    lead,
    "New cheque",
    async (d) => {
      await d.getByLabel(/^Cheque number/).fill("E2E-7001");
      await d.locator("#f-cheques-bank").fill("Fictional Bank");
      await d.getByLabel(/^Issuer/).fill("E2E Fictional Traders");
      await d.locator("#f-cheques-amount").fill("50000");
      await d.getByLabel(/^Status/).selectOption("DISHONOURED");
      await d.getByLabel(/^Date dishonoured/).fill("2026-03-10");
    },
    "Create cheque",
  );
  await expect(drawer(lead).getByText("This cheque is not linked to any invoice.")).toBeVisible();
  await expect(drawer(lead).getByText("Dishonoured cheque has no follow-up task.")).toBeVisible();
  await closeDrawer(lead);
});

test("workflows 6 and 7: record work done and generate a follow-up task", async () => {
  await openTab(lead, /^Work done/);
  await createInTab(
    lead,
    "New work-done entry",
    async (d) => {
      await d.getByLabel(/^Date and time/).fill("2026-03-03T09:30");
      await pick(lead, /^Investigator/, "Amina Lead", d);
      await d.getByLabel(/^Work performed/).fill("Visited E2E Fictional Traders to verify the invoice.");
      await d.getByLabel(/^Next task/).fill("Obtain customer confirmation letter");
    },
    "Create work-done entry",
  );
  await drawer(lead).getByRole("button", { name: "Generate follow-up task" }).click();
  const modal = lead.getByRole("dialog", { name: "Generate a follow-up task" });
  await expect(modal.getByLabel(/^Task/)).toHaveValue("Obtain customer confirmation letter");
  await modal.getByLabel(/^Due date/).fill("2026-12-15");
  await modal.getByRole("button", { name: "Create task" }).click();
  await expect(drawer(lead).getByText("Obtain customer confirmation letter").last()).toBeVisible();
  await closeDrawer(lead);
  await openTab(lead, /^Tasks/);
  await expect(lead.getByText("Obtain customer confirmation letter")).toBeVisible();
});

test("workflows 8 and 9: record an interview and upload a signed statement", async () => {
  await openTab(lead, /^Parties/);
  await createInTab(
    lead,
    "New party",
    async (d) => {
      await d.getByLabel(/^Role in case/).selectOption("PERSON_OF_INTEREST");
      await d.getByLabel(/^Name/).fill("E2E Person of Interest (fictional)");
      await d.getByLabel(/^Telephone/).fill("0722000222");
    },
    "Create party",
  );
  await closeDrawer(lead);
  await openTab(lead, /^Interviews and statements/);
  await createInTab(
    lead,
    "New interview",
    async (d) => {
      await pick(lead, /^Interviewee/, "E2E Person of Interest", d);
      await d.getByLabel(/^Interview date/).fill("2026-03-04T10:00");
      await d.getByLabel(/^Interviewers/).fill("Amina Lead (fictional)");
      await d.getByLabel(/^Interview type/).selectOption("PERSON_OF_INTEREST");
      await d.getByLabel(/^Summary of responses/).fill("Denies wrongdoing (fictional).");
    },
    "Create interview",
  );
  await closeDrawer(lead);
  await createInTab(
    lead,
    "New statement",
    async (d) => {
      await d.getByLabel(/^Statement type/).selectOption("EMPLOYEE_EXPLANATION");
      await d.getByLabel(/^Statement date/).fill("2026-03-04");
      await d.getByLabel(/^Recorded by/).fill("Amina Lead (fictional)");
      await d.getByLabel(/^Summary/).fill("Written explanation (fictional).");
    },
    "Create statement",
  );
  await drawer(lead).getByRole("button", { name: "Upload signed copy" }).click();
  const modal = lead.getByRole("dialog", { name: "Upload the signed statement" });
  await modal.locator("input[type=file]").setInputFiles(path.join(samples, "statements", "fictional-mpesa-statement.pdf"));
  await modal.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(drawer(lead).getByText(/Signed statements are protected/)).toBeVisible();
  await closeDrawer(lead);
});

test("workflows 10 and 21: upload evidence, and protected evidence cannot be deleted", async () => {
  await openTab(lead, /^Evidence/);
  await lead.getByRole("button", { name: "Upload evidence" }).first().click();
  const modal = lead.getByRole("dialog", { name: "Upload evidence" });
  await modal.locator("input[type=file]").setInputFiles(path.join(samples, "statements", "fictional-bank-statement.csv"));
  await modal.getByLabel(/^Title/).fill("E2E fictional supporting schedule");
  await modal.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(lead.getByText("E2E fictional supporting schedule")).toBeVisible();
  await openRow(lead, "E2E fictional supporting schedule");
  await expect(drawer(lead).getByText("SHA-256 of the read-only original")).toBeVisible();
  await drawer(lead).getByRole("button", { name: "Delete" }).click();
  const confirm = lead.getByRole("dialog", { name: /Recycle Bin/ });
  await confirm.getByLabel(/Reason for deletion/).fill("Attempt to delete original evidence");
  await confirm.getByRole("button", { name: "Move to Recycle Bin" }).click();
  await expect(confirm.getByRole("alert")).toContainText(/cannot be deleted/i);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await closeDrawer(lead);
});

test("workflows 11, 12 and 13: expenses, an advance and a recovery with finance approval", async ({ browser }) => {
  await openTab(lead, /^Costs and budget/);
  await createInTab(
    lead,
    "New expense",
    async (d) => {
      await d.getByLabel(/^Category/).selectOption("ACCOMMODATION");
      await d.getByLabel(/^Description/).fill("E2E lodging (fictional)");
      await d.locator("#f-expenses-expenseDate").fill("2026-03-05");
      await d.getByLabel(/^Amount before tax/).fill("10000");
      await d.getByLabel(/^Tax/).fill("1600");
    },
    "Create expense",
  );
  await drawer(lead).getByRole("button", { name: "Submit for approval" }).click();
  await expect(drawer(lead).getByText("Submitted").first()).toBeVisible();
  await closeDrawer(lead);
  await createInTab(
    lead,
    "New advance",
    async (d) => {
      await pick(lead, /^Employee/, "Amina Lead", d);
      await d.getByLabel(/^Purpose/).fill("E2E field trip (fictional)");
      await d.getByLabel(/^Amount requested/).fill("20000");
    },
    "Create advance",
  );
  await closeDrawer(lead);
  await openTab(lead, /^Recoveries/);
  await createInTab(
    lead,
    "New recovery",
    async (d) => {
      await d.locator("#f-recoveries-recoveryDate").fill("2026-03-06");
      await d.getByLabel(/^Payer/).fill("E2E Fictional Traders");
      await d.getByLabel(/^Recovery method/).selectOption("MPESA");
      await d.getByLabel(/^Gross amount/).fill("30000");
      await d.getByLabel(/^Receipt number/).fill("RC-E2E-1");
    },
    "Create recovery",
  );
  await expect(drawer(lead).getByText(/another reviewer must verify it/)).toBeVisible();
  await closeDrawer(lead);

  const finance = await as(browser, "finance.demo");
  await finance.goto(`${caseUrl}?tab=costs`);
  await openRow(finance, "E2E lodging");
  await drawer(finance).getByRole("button", { name: "Approve or reject" }).click();
  await finance.getByRole("dialog", { name: "Expense decision" }).getByRole("button", { name: "Confirm" }).click();
  await expect(drawer(finance).getByText("Approved").first()).toBeVisible();
  await closeDrawer(finance);
  await openRow(finance, "E2E field trip");
  await drawer(finance).getByRole("button", { name: "Approve", exact: true }).click();
  await finance.getByRole("dialog", { name: "Approve advance" }).getByRole("button", { name: "Confirm" }).click();
  await drawer(finance).getByRole("button", { name: "Issue funds" }).click();
  const issue = finance.getByRole("dialog", { name: "Issue advance" });
  await issue.getByLabel(/^Accounting deadline/).fill("2026-12-31");
  await issue.getByRole("button", { name: "Confirm" }).click();
  await drawer(finance).getByRole("button", { name: "Account for advance" }).click();
  const acct = finance.getByRole("dialog", { name: "Account for advance" });
  await acct.getByLabel(/^Amount returned/).fill("20000");
  await acct.getByRole("button", { name: "Confirm" }).click();
  await expect(drawer(finance).getByText("Accounted").first()).toBeVisible();
  await closeDrawer(finance);
  await finance.goto(`${caseUrl}?tab=recoveries`);
  await openRow(finance, "E2E Fictional Traders");
  await drawer(finance).getByRole("button", { name: "Verify and post" }).click();
  await expect(drawer(finance).getByText(/Verified recovery receipts are protected/)).toBeVisible();
  await finance.context().close();
});

test("workflow 14: recommend criminal and civil action together", async ({ browser }) => {
  await lead.goto(`${caseUrl}?tab=findings`);
  await createInTab(
    lead,
    "New finding",
    async (d) => {
      await d.getByLabel(/^Title/).fill("E2E finding (fictional)");
      await d.getByLabel(/^Allegations/).fill("Customer payments diverted (fictional).");
      await d.getByLabel(/^Investigator conclusion/).fill("Refer for criminal and civil action.");
    },
    "Create finding",
  );
  await drawer(lead).getByRole("button", { name: "Edit recommendations" }).click();
  await drawer(lead).getByRole("checkbox", { name: "Criminal action", exact: true }).check();
  await drawer(lead).getByRole("checkbox", { name: "Civil action", exact: true }).check();
  await drawer(lead).getByRole("button", { name: "Save recommendations" }).click();
  await drawer(lead).getByRole("button", { name: "Submit for decision" }).click();
  await expect(drawer(lead).getByText("Awaiting management decision.")).toBeVisible();
  await closeDrawer(lead);

  const manager = await as(browser, "manager.demo");
  await manager.goto(`${caseUrl}?tab=findings`);
  await openRow(manager, "E2E finding");
  await drawer(manager).getByRole("button", { name: "Record decision" }).click();
  const dec = manager.getByRole("dialog", { name: "Management decision" });
  await dec.getByRole("checkbox", { name: "Criminal action" }).check();
  await dec.getByRole("checkbox", { name: "Civil action" }).check();
  await dec.getByRole("button", { name: "Confirm" }).click();
  await expect(drawer(manager).getByText(/Approved by Martin Manager/)).toBeVisible();
  await manager.context().close();
});

test("workflows 15 and 16: police, DCI and DPP progress, and advocate and court progress", async () => {
  await lead.goto(`${caseUrl}?tab=criminal`);
  await createInTab(
    lead,
    "New criminal referral",
    async (d) => {
      await d.getByLabel(/^Police station or DCI office/).fill("E2E Fictional Police Station");
      await d.getByLabel(/^OB number/).fill("OB/E2E/1/2026");
      await d.getByLabel(/^Status/).selectOption("REPORTED");
    },
    "Create criminal referral",
  );
  for (const m of ["OB_NUMBER_OBTAINED", "FILE_FORWARDED_TO_DPP"]) {
    await drawer(lead).getByRole("button", { name: "New criminal milestone" }).first().click();
    const d = drawer(lead);
    await d.getByLabel(/^Milestone/).selectOption(m);
    await d.locator("#f-criminal-milestones-milestoneDate").fill("2026-03-08");
    await d.getByRole("button", { name: "Create criminal milestone" }).click();
    // The new milestone opens in its own panel; closing it returns to the referral.
    await expect(drawer(lead).getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await drawer(lead)
      .getByRole("button", { name: /Close panel/ })
      .click();
  }
  await expect(drawer(lead).getByText("File forwarded to DPP")).toBeVisible();
  await closeDrawer(lead);

  await openTab(lead, /^Civil/);
  await createInTab(
    lead,
    "New civil action",
    async (d) => {
      await d.getByLabel(/^Legal firm/).fill("E2E Fictional Advocates");
      await d.locator("#f-civil-matters-advocate").fill("A. Advocate (fictional)");
      await d.getByLabel(/^Court case number/).fill("CMCC/E2E/1");
    },
    "Create civil action",
  );
  await drawer(lead).getByRole("button", { name: "New court event" }).first().click();
  const d = drawer(lead);
  await d.getByLabel(/^Event/).selectOption("MENTION");
  await d.locator("#f-court-events-eventDate").fill("2026-03-09");
  await d.getByLabel(/^Next court date/).fill("2026-12-20");
  await d.getByRole("button", { name: "Create court event" }).click();
  await expect(drawer(lead).getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await lead.goto("/court-diary");
  await expect(lead.getByText("CMCC/E2E/1").first()).toBeVisible();
});

test("workflows 17 and 18: upload a fictional M-Pesa statement and confirm suggested links", async () => {
  await lead.goto(`${caseUrl}?tab=analysis`);
  await lead.getByRole("button", { name: "Upload statement" }).click();
  const modal = lead.getByRole("dialog", { name: "Upload bank or M-Pesa statement" });
  await modal.locator("input[type=file]").setInputFiles(path.join(samples, "statements", "fictional-mpesa-statement.csv"));
  await modal.getByLabel(/^Statement owner/).fill("E2E Statement Owner (fictional)");
  await modal.getByLabel(/^Bank, M-Pesa or institution/).fill("Safaricom M-Pesa");
  await modal.getByLabel(/^Account or telephone number/).fill("0711000111");
  await modal.getByLabel(/^Authority for processing/).fill("Court order (fictional)");
  await modal.getByRole("button", { name: "Upload statement" }).click();
  await expect(lead).toHaveURL(/\/statements\//);
  await expect(lead.getByText("Parsed").first()).toBeVisible({ timeout: 90_000 });
  await expect(
    lead
      .getByRole("note")
      .filter({ hasText: /not proof/i })
      .first(),
  ).toBeVisible();
  await lead.getByRole("tab", { name: /Suggested links/ }).click();
  await lead.getByRole("button", { name: "Confirm" }).first().click();
  await lead.getByRole("tab", { name: "Reviewed links" }).click();
  await expect(lead.getByText(/Telephone-number match|Telephone number match/).first()).toBeVisible();
  await lead.goto(`/money-movement?caseId=${caseUrl.split("/").pop()}`);
  await expect(lead.getByRole("heading", { name: "Money-movement analysis" })).toBeVisible();
  await expect(lead.getByText("Counterparty summary")).toBeVisible();
  await lead.getByLabel("Show network graph").uncheck();
  await expect(lead.getByRole("table", { name: /Aggregated money flows/ })).toBeVisible();
});

test("workflow 19: bulk upload valid, duplicate and invalid invoice rows", async () => {
  await lead.goto("/admin/data");
  await lead.getByLabel("Record type").selectOption("invoices");
  await pick(lead, /^Default case/, TITLE);
  await lead.getByLabel("Import mode").selectOption("PARTIAL");
  await lead.locator("input[type=file]").setInputFiles(path.join(samples, "imports", "invoices-valid-duplicate-invalid.csv"));
  await lead.getByRole("button", { name: "Validate file" }).click();
  await expect(lead.getByText(/Review batch/)).toBeVisible();
  const kpi = (label: string) => lead.locator("div.depth", { hasText: label }).first();
  await expect(kpi("Valid")).toContainText("3");
  await expect(kpi("Invalid")).toContainText("2");
  await expect(kpi("Duplicates")).toContainText("1");
  await lead.getByRole("button", { name: /Import 3 row/ }).click();
  await expect(lead.getByText(/Result: Partially completed/)).toBeVisible();
  await expect(lead.getByText(/Imported 3/)).toBeVisible();
});

test("workflow 20: soft delete and restore an administrative batch", async ({ browser }) => {
  const admin = await as(browser, "e2e.admin");
  await admin.goto("/admin/bulk");
  await admin.getByLabel("Record type").selectOption("invoices");
  await admin.getByLabel("Search invoices").fill("INV-DEMO-900");
  await expect(admin.locator("table").first().locator("tbody tr")).toHaveCount(3);
  await admin.getByLabel("Select all records on this page").check();
  await admin.getByRole("button", { name: "Move to Recycle Bin" }).click();
  const confirm = admin.getByRole("dialog", { name: /Move 3 record/ });
  await confirm.getByLabel(/Reason for deletion/).fill("E2E batch deletion test");
  await confirm.getByRole("button", { name: "Move to Recycle Bin" }).click();
  await expect(admin.getByRole("dialog", { name: /Batch BLK-/ })).toContainText("3 record(s) updated");
  await admin.keyboard.press("Escape");
  await expect(admin.getByText("No invoices yet")).toBeVisible();
  await admin.goto("/admin/recycle-bin");
  await admin.getByRole("button", { name: "Restore batch" }).first().click();
  const restore = admin.getByRole("dialog", { name: /Restore every record/ });
  await restore.getByLabel(/Reason for restoration/).fill("E2E restore test");
  await restore.getByRole("button", { name: "Restore batch" }).click();
  await expect(admin.getByText(/Restored by/).first()).toBeVisible();
  await admin.goto(`${caseUrl}?tab=invoices`);
  await expect(admin.getByText("INV-DEMO-9001")).toBeVisible();
  await admin.context().close();
});

test("workflows 22 and 23: close the case, then reopen it", async () => {
  // Resolve blockers with bulk status changes: complete tasks and sub-files.
  for (const [tab, value] of [
    [/^Tasks/, "COMPLETED"],
    [/^Sub-files/, "COMPLETED"],
  ] as const) {
    await lead.goto(`${caseUrl}`);
    await openTab(lead, tab);
    await lead.getByLabel("Select all records on this page").check();
    await lead
      .getByRole("region", { name: "Bulk actions" })
      .getByRole("button", { name: /^Change status/ })
      .click();
    const modal = lead.getByRole("dialog", { name: /Change status/ });
    await modal.getByLabel(/^Status/).selectOption(value);
    await modal.getByRole("button", { name: "Apply" }).click();
    await expect(lead.getByRole("dialog", { name: /Batch BLK-/ })).toBeVisible();
    await lead.keyboard.press("Escape");
  }
  await lead.goto(`${caseUrl}?tab=closure`);
  await expect(lead.getByText(/No open tasks — passed/)).toBeVisible();
  await lead.getByLabel(/^Closure reason/).fill("Investigation complete (fictional)");
  await lead.getByLabel(/^Closure summary/).fill("E2E closure: findings decided, recoveries verified, legal pathways continue externally.");
  await lead.getByRole("button", { name: "Close case" }).click();
  await expect(lead.getByText("This case is closed.").first()).toBeVisible();
  await lead.getByLabel(/^Reason for reopening/).fill("New evidence received");
  await lead.getByLabel(/^New information/).fill("A fictional witness provided new bank records.");
  await lead.getByRole("button", { name: "Reopen case" }).click();
  await expect(lead.getByText("Reopened").first()).toBeVisible();
  await expect(lead.getByText(/New evidence received/).first()).toBeVisible();
});

test("workflow 24: export a report", async () => {
  await lead.goto("/reports");
  await lead.getByLabel(/^Report/).selectOption("case-status");
  await lead.getByLabel("Format").selectOption("CSV");
  const download = lead.waitForEvent("download");
  await lead.getByRole("button", { name: "Generate and download" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^case-status-RPT-\d{4}-\d{5}\.csv$/);
  await expect(lead.getByRole("table", { name: "Generated reports" })).toContainText("Case status");
});

test.afterAll(async () => {
  await lead?.context().close();
  expect(E2E.port).toBe(3200);
});
