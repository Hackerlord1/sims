// SIMS seed. Everything created here is FICTIONAL DEMO DATA (isDemo = true), shown as DEMO DATA in the UI.
// Run with the react-server condition (see package.json "prisma.seed") so the service layer loads.
//
// - Always: companies, branches and departments.
// - DEMO_MODE=true only: the development administrator "felix", one fictional account per role and
//   fictional investigation cases created through the real service layer (references, workflows,
//   audit entries and statement parsing are genuine).
// Safe to re-run: organisation data is upserted; demo cases are created only once.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RoleCode } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { assertDemoModeAllowed } from "../src/server/demo-guard";
import { createPrismaClient } from "../src/server/prisma-client";

const prisma = createPrismaClient();

const COMPANIES = [
  {
    code: "SMT",
    name: "Savemore Demo Trading Ltd",
    branches: [
      ["HQ", "Nairobi Head Office"],
      ["NKR", "Nakuru"],
      ["ELD", "Eldoret"],
      ["BSA", "Busia"],
    ],
  },
  {
    code: "SMR",
    name: "Savemore Demo Retail Ltd",
    branches: [
      ["HQ", "Nairobi Head Office"],
      ["KSM", "Kisumu"],
      ["NVS", "Naivasha"],
    ],
  },
] as const;

const DEPARTMENTS = ["Investigations", "Internal Audit", "Finance", "Legal", "Human Resources", "Compliance", "Sales", "Credit Control", "Executive Management"];

/** One fictional account per role. Names are invented. */
const DEMO_USERS: { username: string; fullName: string; role: RoleCode; clearance: "CONFIDENTIAL" | "HIGHLY_CONFIDENTIAL" | "RESTRICTED"; scoped: boolean }[] = [
  { username: "lead.demo", fullName: "Amina Lead (fictional)", role: "LEAD_INVESTIGATOR", clearance: "RESTRICTED", scoped: true },
  { username: "investigator.demo", fullName: "Peter Investigator (fictional)", role: "INVESTIGATOR", clearance: "HIGHLY_CONFIDENTIAL", scoped: false },
  { username: "audit.demo", fullName: "Irene Auditor (fictional)", role: "INTERNAL_AUDIT_REVIEWER", clearance: "HIGHLY_CONFIDENTIAL", scoped: true },
  { username: "compliance.demo", fullName: "Cyrus Compliance (fictional)", role: "COMPLIANCE_REVIEWER", clearance: "RESTRICTED", scoped: true },
  { username: "legal.demo", fullName: "Lydia Legal (fictional)", role: "LEGAL_OFFICER", clearance: "RESTRICTED", scoped: false },
  { username: "hr.demo", fullName: "Hassan HR (fictional)", role: "HR_OFFICER", clearance: "HIGHLY_CONFIDENTIAL", scoped: false },
  { username: "finance.demo", fullName: "Faith Finance (fictional)", role: "FINANCE_REVIEWER", clearance: "CONFIDENTIAL", scoped: true },
  { username: "manager.demo", fullName: "Martin Manager (fictional)", role: "MANAGEMENT_APPROVER", clearance: "HIGHLY_CONFIDENTIAL", scoped: true },
  { username: "executive.demo", fullName: "Esther Executive (fictional)", role: "EXECUTIVE_READ_ONLY", clearance: "CONFIDENTIAL", scoped: true },
  { username: "advocate.demo", fullName: "Adrian Advocate (fictional)", role: "EXTERNAL_ADVOCATE_RESTRICTED", clearance: "CONFIDENTIAL", scoped: false },
];

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const day = (n: number) => new Date(Date.now() + n * 86_400_000);
const iso = (n: number) => day(n).toISOString().slice(0, 10);

async function seedOrganisation() {
  for (const d of DEPARTMENTS) await prisma.department.upsert({ where: { name: d }, update: {}, create: { name: d, isDemo: true } });
  for (const c of COMPANIES) {
    const company = await prisma.company.upsert({ where: { code: c.code }, update: { name: c.name }, create: { code: c.code, name: c.name, isDemo: true } });
    for (const [code, name] of c.branches) {
      await prisma.branch.upsert({ where: { companyId_code: { companyId: company.id, code } }, update: { name }, create: { companyId: company.id, code, name, isDemo: true } });
    }
  }
}

async function ensureScopes(userId: string) {
  for (const company of await prisma.company.findMany()) {
    const found = await prisma.userScope.findFirst({ where: { userId, companyId: company.id, branchId: null } });
    if (!found) await prisma.userScope.create({ data: { userId, companyId: company.id, branchId: null } });
  }
}

async function seedDemoAdmin() {
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!password) throw new Error("DEMO_MODE=true requires DEMO_ADMIN_PASSWORD in .env");
  const hq = await prisma.company.findUniqueOrThrow({ where: { code: "SMT" } });
  const dept = await prisma.department.findUniqueOrThrow({ where: { name: "Investigations" } });
  const existing = await prisma.user.findUnique({ where: { username: "felix" } });
  const reset = process.env.SEED_RESET_DEMO_ADMIN === "true";
  const profile = {
    fullName: "Felix Guto",
    email: "felix@sims.demo",
    role: "SYSTEM_ADMIN" as RoleCode,
    clearance: "RESTRICTED" as const,
    companyId: hq.id,
    departmentId: dept.id,
    jobTitle: "System Administrator (Development)",
    isDemoAdmin: true,
    isDemo: true,
  };
  if (!existing || reset) {
    const passwordHash = await hash(password, ARGON);
    const user = await prisma.user.upsert({
      where: { username: "felix" },
      update: { ...profile, passwordHash,  failedLoginCount: 0, lockedUntil: null, status: "ACTIVE" },
      create: { username: "felix", ...profile, passwordHash,  permissionDenials: [] },
    });
    console.log(existing ? "Demo administrator 'felix' password reset (must change on next sign-in)." : "Demo administrator 'felix' created (must change password on first sign-in).");
    await prisma.auditLog.create({
      data: {
        action: existing ? "seed.demo_admin.reset" : "seed.demo_admin.create",
        actorLabel: "system",
        entityType: "User",
        entityId: user.id,
        details: { note: "DEMO DATA — development administrator" },
      },
    });
  } else {
    console.log("Demo administrator 'felix' already exists — password left unchanged.");
  }
  await ensureScopes((await prisma.user.findUniqueOrThrow({ where: { username: "felix" } })).id);
}

async function seedDemoUsers() {
  const password = process.env.DEMO_USERS_PASSWORD;
  if (!password) {
    console.log("DEMO_USERS_PASSWORD is not set — skipped the fictional role accounts.");
    return false;
  }
  const passwordHash = await hash(password, ARGON);
  for (const u of DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, status: "ACTIVE", lockedUntil: null, failedLoginCount: 0 } })
      : await prisma.user.create({
          data: {
            username: u.username,
            email: `${u.username}@sims.demo`,
            fullName: u.fullName,
            role: u.role,
            clearance: u.clearance,
            passwordHash,
            
            permissionDenials: [],
            isDemo: true,
            jobTitle: `${u.role.replace(/_/g, " ").toLowerCase()} (demo)`,
          },
        });
    if (u.scoped) await ensureScopes(user.id);
  }
  console.log(`Fictional role accounts ready: ${DEMO_USERS.map((u) => u.username).join(", ")}.`);
  return true;
}

async function fictionalPdf(title: string, lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  let y = 790;
  page.drawText("FICTIONAL DEMO DOCUMENT - NOT A REAL RECORD", { x: 40, y, size: 10, font });
  y -= 26;
  page.drawText(title, { x: 40, y, size: 14, font });
  y -= 24;
  for (const l of lines) {
    page.drawText(l, { x: 40, y, size: 10, font });
    y -= 16;
  }
  return Buffer.from(await pdf.save());
}

async function seedDemoCases() {
  if (await prisma.case.findFirst({ where: { isDemo: true } })) {
    console.log("Demo cases already exist — skipped.");
    return;
  }
  // Loaded lazily: the service layer needs the react-server condition.
  const { createResource, updateResource } = await import("../src/server/resources/service");
  const { getResource } = await import("../src/lib/resources/registry");
  const cw = await import("../src/server/services/case-workflow");
  const fin = await import("../src/server/services/finance-workflow");
  const rec = await import("../src/server/services/case-records");
  const { createEvidence } = await import("../src/server/services/evidence");
  const { storeFile, sha256 } = await import("../src/server/storage");
  const { runStatementParse } = await import("../src/server/statements/service");
  const { nextYearReference } = await import("../src/server/references");
  const { DEFAULT_PREFERENCES } = await import("../src/lib/preferences");
  type CurrentUser = import("../src/server/auth/principal").CurrentUser;

  const load = async (username: string): Promise<CurrentUser> => {
    const u = await prisma.user.findUniqueOrThrow({ where: { username }, include: { scopes: true } });
    return {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      clearance: u.clearance,
      scopes: u.scopes.map((s) => ({ companyId: s.companyId, branchId: s.branchId })),
      
      mfaEnabled: false,
      isDemoAdmin: u.isDemoAdmin,
      sessionId: "seed",
      sessionMfaVerified: true,
      reauthAt: new Date(),
      preferences: DEFAULT_PREFERENCES,
      denials: [],
      dataApprover: u.dataApprover,
    };
  };
  const admin = await load("felix");
  const lead = await load("lead.demo");
  const inv = await load("investigator.demo");
  const finance = await load("finance.demo");
  const manager = await load("manager.demo");
  const legal = await load("legal.demo");
  const R = (k: string) => getResource(k)!;
  const mark = async (model: string, id: string) => {
    await (prisma as unknown as Record<string, { update(a: unknown): Promise<unknown> }>)[model]!.update({ where: { id }, data: { isDemo: true } });
  };
  const create = async (key: string, user: CurrentUser, data: Record<string, unknown>) => {
    const row = await createResource(R(key), user, data);
    await mark(R(key).model, String(row.id));
    return row;
  };

  const smt = await prisma.company.findUniqueOrThrow({ where: { code: "SMT" } });
  const busia = await prisma.branch.findFirstOrThrow({ where: { companyId: smt.id, code: "BSA" } });
  const smr = await prisma.company.findUniqueOrThrow({ where: { code: "SMR" } });
  const kisumu = await prisma.branch.findFirstOrThrow({ where: { companyId: smr.id, code: "KSM" } });

  // ── Case 1: credit sales irregularities (criminal and civil action together) ──
  const c1 = await create("cases", admin, {
    title: "Distributor credit sales irregularities — Brian Otieno (fictional)",
    companyId: smt.id,
    branchId: busia.id,
    businessUnit: "Western region distribution",
    location: "Busia",
    category: "INVOICE_IRREGULARITY",
    description: "FICTIONAL DEMO CASE. Credit sales invoiced to customers in Busia and Dakar that customers dispute or cannot be traced, and customer payments redirected to personal M-Pesa numbers.",
    allegationSummary: "A sales representative (fictional) is alleged to have raised unsupported invoices and collected customer payments to a personal number.",
    referralSource: "Credit control exception report",
    openedAt: iso(-75),
    incidentPeriodFrom: iso(-200),
    incidentPeriodTo: iso(-90),
    leadInvestigatorId: lead.id,
    supervisingManagerId: manager.id,
    priority: "HIGH",
    confidentiality: "CONFIDENTIAL",
    financialRisk: "HIGH",
    stage: "ANALYSIS",
    targetClosureDate: iso(45),
    grossAmount: "1850000.00",
    amountDemanded: "1240000.00",
    amountDisputed: "310000.00",
    amountAcknowledged: "420000.00",
    amountConfirmedRecoverable: "1100000.00",
  });
  const caseId = String(c1.id);
  for (const [u, role] of [
    [inv, "SUPPORTING"],
    [legal, "LEGAL"],
    [finance, "FINANCE"],
    [await load("hr.demo"), "HR"],
    [await load("advocate.demo"), "EXTERNAL_ADVOCATE"],
  ] as const) {
    await cw.addAssignment(admin, caseId, { userId: u.id, role });
  }
  await cw.changeCaseStatus(lead, caseId, "UNDER_INTERNAL_INVESTIGATION", "Preliminary review complete");

  const subTitles = [
    ["Sales Made to Busia", "Busia", "Credit sales"],
    ["Sales Made to Dakar", "Dakar (fictional export route)", "Export credit sales"],
    ["Retail Debts", "Busia retail counters", "Retail credit"],
    ["Disputed Customer Invoices", "Western region", "Credit sales"],
    ["Bad Cheques", "Busia", "Cheque payments"],
  ];
  const subs: string[] = [];
  for (const [title, location, type] of subTitles) {
    const sf = await create("subfiles", lead, {
      caseId,
      title,
      location,
      transactionType: type,
      allegation: `Irregularities in ${title.toLowerCase()} (fictional).`,
      periodFrom: iso(-200),
      periodTo: iso(-90),
      investigatorId: inv.id,
      amountInvolved: "250000.00",
      targetDate: iso(30),
    });
    subs.push(String(sf.id));
  }

  const party = async (data: Record<string, unknown>) => String((await create("parties", lead, { caseId, ...data })).id);
  const brian = await party({
    role: "PERSON_OF_INTEREST",
    name: "Brian Otieno (fictional)",
    telephone: "0711000111",
    idNumber: "00000001",
    employeeNumber: "EMP-DEMO-017",
    organisation: "Savemore Demo Trading Ltd",
    relationshipToCase: "Sales representative for the Busia route",
  });
  const grace = await party({ role: "PERSON_OF_INTEREST", name: "Grace Wanjiku (fictional)", telephone: "0722000222", relationshipToCase: "Receives transfers from the sales representative" });
  await party({
    role: "CUSTOMER",
    kind: "ORGANISATION",
    name: "Kisumu Fresh Mart (fictional)",
    telephone: "0700111222",
    customerCode: "CUST-DEMO-101",
    relationshipToCase: "Customer on the Busia route",
  });
  await party({ role: "WITNESS", name: "Joseph Mwangi (fictional)", telephone: "0733100200", relationshipToCase: "Delivery driver" });
  await party({ role: "COMPLAINANT", name: "Credit Control Department (fictional)", kind: "ORGANISATION", relationshipToCase: "Raised the exception report" });
  await party({ role: "POLICE_OR_DCI_OFFICER", name: "Inspector Jane Achieng (fictional)", relationshipToCase: "Investigating officer, Busia police station" });
  await party({ role: "ADVOCATE", name: "Kamau & Partners Advocates (fictional)", kind: "ORGANISATION", relationshipToCase: "External advocates for recovery" });

  const invoices: string[] = [];
  const invData = [
    ["INV-DEMO-1001", -180, "Kisumu Fresh Mart (fictional)", "84500.00", "0", "MPESA_PAID_TO_PERSONAL_NUMBER", 0],
    ["INV-DEMO-1002", -176, "Lakeside Kiosk (fictional)", "42000.00", "0", "NO_PROOF_OF_DELIVERY", 0],
    ["INV-DEMO-1003", -171, "Lakeside Kiosk (fictional)", "56250.00", "0", "CASH_COLLECTED_NOT_REMITTED", 0],
    ["INV-DEMO-1004", -165, "Border Traders (fictional)", "120000.00", "20000.00", "DISPUTED", 1],
    ["INV-DEMO-1005", -160, "Unknown Customer Busia (fictional)", "96000.00", "0", "CUSTOMER_NOT_IDENTIFIED", 1],
    ["INV-DEMO-1006", -150, "Retail Counter 3 (fictional)", "31000.00", "0", "VALID_BUT_UNPAID", 2],
    ["INV-DEMO-1007", -140, "Retail Counter 3 (fictional)", "31000.00", "0", "DUPLICATE", 2],
    ["INV-DEMO-1008", -130, "Dakar Route Agent (fictional)", "250000.00", "50000.00", "FICTITIOUS_INVOICE_SUSPECTED", 1],
    ["INV-DEMO-1009", -120, "Hardware Plus (fictional)", "47500.00", "0", "VALID_BUT_UNPAID", 4],
    ["INV-DEMO-1010", -118, "Hardware Plus (fictional)", "52500.00", "0", "VALID_BUT_UNPAID", 4],
  ] as const;
  for (const [n, d, cust, amt, paid, cls, s] of invData) {
    const row = await create("invoices", inv, {
      caseId,
      subFileId: subs[s],
      invoiceNumber: n,
      invoiceDate: iso(d),
      customerName: cust,
      invoiceAmount: amt,
      amountPaid: paid,
      classification: cls,
      salesRepresentative: "Brian Otieno (fictional)",
      proofOfDelivery: cls === "NO_PROOF_OF_DELIVERY" ? "MISSING" : "AVAILABLE",
      salesLocation: "Busia",
      deliveryNoteNumber: `DN-${n.slice(-4)}`,
    });
    invoices.push(String(row.id));
  }

  const cheque1 = await create("cheques", inv, {
    caseId,
    subFileId: subs[4],
    chequeNumber: "000451",
    bank: "Fictional Commercial Bank",
    bankBranch: "Busia",
    accountNumberMasked: "0101234567",
    accountName: "Hardware Plus (fictional)",
    issuer: "Hardware Plus (fictional)",
    chequeDate: iso(-110),
    amount: "100000.00",
    dateReceived: iso(-110),
    dateDeposited: iso(-108),
    dateDishonoured: iso(-104),
    dishonourReason: "Insufficient funds",
    bankReturnReference: "RTN-DEMO-778",
    status: "DISHONOURED",
    demandLetterDate: iso(-95),
    demandDeadline: iso(-81),
    receivedByEmployee: "Brian Otieno (fictional)",
  });
  await rec.setChequeInvoices(inv, String(cheque1.id), [
    { invoiceId: invoices[8]!, amount: "47500.00" },
    { invoiceId: invoices[9]!, amount: "52500.00" },
  ]);
  const cheque2 = await create("cheques", inv, {
    caseId,
    subFileId: subs[4],
    chequeNumber: "000463",
    bank: "Fictional Commercial Bank",
    accountNumberMasked: "0101234567",
    issuer: "Hardware Plus (fictional)",
    chequeDate: iso(-90),
    amount: "100000.00",
    status: "DISHONOURED",
    dateDishonoured: iso(-84),
    dishonourReason: "Account closed",
  });
  await updateResource(R("cheques"), inv, String(cheque1.id), { replacementChequeId: String(cheque2.id), status: "REPLACED" });
  await create("cheques", inv, {
    caseId,
    subFileId: subs[4],
    chequeNumber: "000512",
    bank: "Fictional Savings Bank",
    issuer: "Border Traders (fictional)",
    chequeDate: iso(-60),
    amount: "35000.00",
    status: "DISHONOURED",
    dateDishonoured: iso(-55),
    dishonourReason: "Signature differs",
  });

  const st = await create("party-statements", inv, {
    caseId,
    partyId: brian,
    kind: "EMPLOYEE_EXPLANATION",
    statementDate: iso(-40),
    recordedBy: "Peter Investigator (fictional)",
    summary: "The employee states that customers asked to pay by M-Pesa to his number because the till was offline (fictional).",
  });
  await create("interviews", lead, {
    caseId,
    partyId: brian,
    interviewDate: `${iso(-40)}T10:00`,
    location: "Busia branch office",
    interviewers: "Amina Lead (fictional); Peter Investigator (fictional)",
    personsPresent: "HR representative (fictional)",
    interviewType: "PERSON_OF_INTEREST",
    questionsCovered: "Customer payments, M-Pesa transfers, delivery notes",
    summaryOfResponses: "Denies diversion; says transfers to Grace Wanjiku (fictional) were personal loans.",
    admissions: "Accepts receiving customer payments on a personal number.",
    contradictions: "Delivery driver states no deliveries were made for INV-DEMO-1002.",
    documentsShown: "INV-DEMO-1001 to 1010; M-Pesa statement extract",
    followUpQuestions: "Source of the returned KES 39,500",
    signedStatementId: String(st.id),
    conclusion: "Explanations inconsistent with delivery records.",
    nextAction: "Obtain Grace Wanjiku bank statement",
  });

  const wl1 = await create("work-logs", inv, {
    caseId,
    subFileId: subs[0],
    occurredAt: `${iso(-50)}T09:30`,
    location: "Busia",
    investigatorId: inv.id,
    workPerformed: "Visited Kisumu Fresh Mart (fictional) and Lakeside Kiosk (fictional) to verify invoices.",
    personContacted: "Store managers (fictional)",
    documentsReviewed: "Customer ledgers",
    evidenceObtained: "Signed customer confirmations",
    outcome: "Two customers confirm paying by M-Pesa to 0711000111.",
    amountVerified: "140750.00",
    nextTask: "Request M-Pesa statement for 0711000111",
    responsibleOfficerId: inv.id,
    dueDate: iso(2),
    status: "COMPLETED",
  });
  await rec.taskFromWorkLog(inv, String(wl1.id), { title: "Request M-Pesa statement for 0711000111", assigneeId: inv.id, dueDate: day(2), category: "DOCUMENT_REQUEST" });
  await create("work-logs", inv, {
    caseId,
    subFileId: subs[1],
    occurredAt: `${iso(-30)}T14:00`,
    location: "Head office",
    investigatorId: inv.id,
    workPerformed: "Reconciled Dakar route invoices against ERP postings.",
    outcome: "INV-DEMO-1008 has no supporting dispatch documents.",
    challenges: "Dispatch records incomplete",
    status: "IN_PROGRESS",
    nextTask: "Interview dispatch clerk",
    dueDate: iso(5),
  });
  await create("tasks", lead, {
    caseId,
    title: "Follow up OB number with Busia police",
    category: "POLICE_FOLLOW_UP",
    assigneeId: inv.id,
    dueDate: iso(-2),
    priority: "HIGH",
    externalParty: "Busia police station",
  });
  await create("tasks", lead, { caseId, title: "Confirm DPP directions received", category: "DPP_FOLLOW_UP", assigneeId: legal.id, dueDate: iso(1), priority: "HIGH", externalParty: "ODPP Busia" });
  await create("tasks", lead, {
    caseId,
    title: "Obtain advocate update on plaint",
    category: "ADVOCATE_FOLLOW_UP",
    assigneeId: legal.id,
    dueDate: iso(6),
    externalParty: "Kamau & Partners Advocates (fictional)",
  });
  await create("tasks", inv, {
    caseId,
    title: "Follow up dishonoured cheque 000512",
    category: "DEMAND_FOLLOW_UP",
    assigneeId: inv.id,
    dueDate: iso(3),
    linkType: "CHEQUE",
    linkId: String(cheque1.id),
  });

  const f1 = await create("findings", lead, {
    caseId,
    title: "Diversion of customer payments on the Busia route (fictional)",
    allegations: "Unsupported invoices and diversion of customer payments to a personal M-Pesa number.",
    scopeCompleted: "Busia and Dakar sub-files; customer verification of 10 invoices.",
    factsEstablished: "KES 140,750 of customer payments were received on a personal number.",
    factsNotEstablished: "Whether INV-DEMO-1008 goods were ever dispatched.",
    controlFailures: "Till outages not reported; no reconciliation of route collections.",
    confirmedAmount: "1100000.00",
    disputedAmount: "310000.00",
    evidenceSufficiency: "SUFFICIENT",
    investigatorConclusion: "The evidence supports referral for criminal action and civil recovery (fictional).",
  });
  await rec.setRecommendations(lead, String(f1.id), [
    { type: "CRIMINAL_ACTION", details: "Report to Busia police / DCI." },
    { type: "CIVIL_ACTION", details: "Recover the confirmed amount through the advocates." },
    { type: "CONTROL_IMPROVEMENT", details: "Daily route collection reconciliation." },
  ]);
  await rec.submitFinding(lead, String(f1.id));
  await rec.decideFinding(manager, String(f1.id), {
    outcome: "APPROVED_WITH_CONDITIONS",
    decisionDate: day(-20),
    conditions: "Legal to confirm prospects before filing suit.",
    comments: "Proceed on both criminal and civil tracks.",
    approvedTypes: ["CRIMINAL_ACTION", "CIVIL_ACTION", "CONTROL_IMPROVEMENT"],
  });
  await cw.changeCaseStatus(lead, caseId, "CRIMINAL_AND_CIVIL_ACTION", "Management approved criminal and civil action");

  const cm = await create("criminal-matters", legal, {
    caseId,
    dateReported: iso(-18),
    policeStation: "Busia Police Station (fictional)",
    county: "Busia",
    town: "Busia",
    obNumber: "OB/DEMO/14/2026",
    policeReference: "DCI-DEMO-221",
    investigatingOfficer: "Jane Achieng (fictional)",
    officerRank: "Inspector",
    documentsHandedOver: "Statement, invoices, M-Pesa extract",
    internalOfficerId: legal.id,
    status: "UNDER_POLICE_INVESTIGATION",
  });
  for (const [m, d, next] of [
    ["COMPLAINT_RECORDED", -18, null],
    ["OB_NUMBER_OBTAINED", -18, null],
    ["STATEMENTS_RECORDED", -12, null],
    ["FINANCIAL_INSTITUTION_SERVED", -8, 5],
  ] as const) {
    await create("criminal-milestones", legal, {
      matterId: String(cm.id),
      milestone: m,
      milestoneDate: iso(d),
      ...(next !== null ? { nextDate: iso(next), nextTask: "Collect bank and M-Pesa responses" } : {}),
    });
  }
  const civ = await create("civil-matters", legal, {
    caseId,
    referralDate: iso(-15),
    legalFirm: "Kamau & Partners Advocates (fictional)",
    advocate: "Adrian Advocate (fictional)",
    internalLegalOfficerId: legal.id,
    demandLetterDate: iso(-14),
    amountDemanded: "1100000.00",
    approvalToSue: true,
    approvalToSueDate: iso(-10),
    filingDate: iso(-7),
    court: "Busia Law Courts (fictional)",
    courtStation: "Busia",
    courtCaseNumber: "CMCC/DEMO/112/2026",
    plaintiff: "Savemore Demo Trading Ltd",
    defendant: "Brian Otieno (fictional)",
    amountClaimed: "1100000.00",
    status: "IN_COURT",
  });
  await create("court-events", legal, {
    matterId: String(civ.id),
    eventType: "MENTION",
    eventDate: iso(-3),
    outcome: "Defendant served; mention for directions.",
    nextCourtDate: iso(4),
    nextTask: "File list of documents",
    responsibleParty: "Kamau & Partners (fictional)",
  });

  await create("budgets", lead, { caseId, pathway: "INVESTIGATION", approvedAmount: "80000.00" });
  await create("budgets", lead, { caseId, pathway: "CIVIL", approvedAmount: "150000.00" });
  for (const b of await prisma.budget.findMany({ where: { caseId } })) await fin.approveBudget(manager, b.id);
  const adv = await create("advances", inv, { caseId, employeeId: inv.id, purpose: "Field verification trip to Busia (fictional)", amountRequested: "30000.00" });
  await fin.decideAdvance(finance, String(adv.id), { approve: true, amountApproved: "30000.00" });
  await fin.issueAdvance(finance, String(adv.id), { amountIssued: "30000.00", accountingDeadline: day(-5) });
  const e1 = await create("expenses", inv, {
    caseId,
    advanceId: String(adv.id),
    pathway: "INVESTIGATION",
    category: "ACCOMMODATION",
    description: "Two nights accommodation in Busia (fictional)",
    expenseDate: iso(-49),
    payee: "Fictional Lodge",
    amountBeforeTax: "12000.00",
    tax: "1920.00",
    requestedAmount: "13920.00",
    paymentMethod: "IMPREST",
  });
  await fin.submitExpense(inv, String(e1.id));
  await fin.decideExpense(finance, String(e1.id), { approvedAmount: "13920.00" });
  const e2 = await create("expenses", inv, {
    caseId,
    pathway: "CIVIL",
    category: "COURT_FILING_FEES",
    description: "Plaint filing fees (fictional)",
    expenseDate: iso(-7),
    payee: "Judiciary (fictional)",
    amountBeforeTax: "6500.00",
    requestedAmount: "6500.00",
    paymentMethod: "BANK_TRANSFER",
  });
  await fin.submitExpense(inv, String(e2.id));
  await fin.decideExpense(finance, String(e2.id), { approvedAmount: "6500.00" });
  await fin.payExpense(finance, String(e2.id), { paidAmount: "6500.00", paymentReference: "PAY-DEMO-0042" });
  const e3 = await create("expenses", inv, {
    caseId,
    pathway: "INVESTIGATION",
    category: "MPESA_STATEMENT_CHARGES",
    description: "M-Pesa statement request fee (fictional)",
    expenseDate: iso(-6),
    amountBeforeTax: "2500.00",
    requestedAmount: "2500.00",
  });
  await fin.submitExpense(inv, String(e3.id));
  await create("expenses", inv, {
    caseId,
    pathway: "CRIMINAL",
    category: "TRANSPORT",
    description: "Transport to Busia police station (fictional)",
    expenseDate: iso(-18),
    amountBeforeTax: "3200.00",
    requestedAmount: "3200.00",
  });

  const r1 = await create("recoveries", inv, {
    caseId,
    subFileId: subs[3],
    recoveryDate: iso(-25),
    payer: "Border Traders (fictional)",
    invoiceId: invoices[3],
    method: "BANK_TRANSFER",
    grossAmount: "60000.00",
    recoveryCosts: "0",
    paymentReference: "TRF-DEMO-5501",
    receiptNumber: "RCPT-DEMO-0901",
    receivingAccount: "0100999888",
  });
  await fin.verifyRecovery(finance, String(r1.id));
  const r2 = await create("recoveries", inv, {
    caseId,
    recoveryDate: iso(-10),
    payer: "Brian Otieno (fictional)",
    method: "SALARY_DEDUCTION",
    grossAmount: "25000.00",
    recoveryCosts: "0",
    receiptNumber: "RCPT-DEMO-0915",
  });
  await fin.verifyRecovery(finance, String(r2.id));
  await create("recoveries", inv, {
    caseId,
    recoveryDate: iso(-2),
    payer: "Hardware Plus (fictional)",
    chequeId: String(cheque1.id),
    method: "MPESA",
    grossAmount: "40000.00",
    recoveryCosts: "1500.00",
    paymentReference: "SIMDEMO9912",
  });

  await create("known-accounts", inv, { caseId, partyId: grace, holderName: "Grace Wanjiku (fictional)", institution: "Fictional Commercial Bank", accountRef: "0100200300", telephone: "0722000222" });
  await create("known-accounts", inv, { caseId, partyId: brian, holderName: "Brian Otieno (fictional)", institution: "Safaricom M-Pesa", telephone: "0711000111" });

  // Evidence (originals preserved with hashes) and a signed statement.
  const evPdf = await fictionalPdf("Delivery note DN-1002 (fictional)", ["Customer: Lakeside Kiosk (fictional)", "Status: NOT SIGNED BY CUSTOMER", "This is a fictional document for demonstration."]);
  await prisma.$transaction(async (tx) => {
    const subject = { id: caseId, reference: String(c1.reference) };
    const ev = await createEvidence(tx, inv, subject, {
      buffer: evPdf,
      originalName: "fictional-delivery-note-DN-1002.pdf",
      mimeType: "application/pdf",
      sha256: sha256(evPdf),
      title: "Unsigned delivery note DN-1002 (fictional)",
      category: "DELIVERY_NOTE",
      subFileId: subs[0],
      source: "Busia depot",
      provider: "Depot supervisor (fictional)",
      dateReceived: day(-48),
      confidentiality: "CONFIDENTIAL",
      linkType: "INVOICE",
      linkId: invoices[1],
    });
    await tx.evidence.update({ where: { id: ev.id }, data: { isDemo: true } });
  });
  const receipt = await fictionalPdf("Receipt RCPT-DEMO-0901 (fictional)", ["Received KES 60,000.00 from Border Traders (fictional)."]);
  await prisma.$transaction(async (tx) => {
    const ev = await createEvidence(
      tx,
      finance,
      { id: caseId, reference: String(c1.reference) },
      {
        buffer: receipt,
        originalName: "fictional-receipt-0901.pdf",
        mimeType: "application/pdf",
        sha256: sha256(receipt),
        title: "Recovery receipt RCPT-DEMO-0901 (fictional)",
        category: "RECEIPT",
        confidentiality: "CONFIDENTIAL",
        linkType: "RECOVERY",
        linkId: String(r1.id),
      },
    );
    await tx.evidence.update({ where: { id: ev.id }, data: { isDemo: true } });
  });

  // Bank and M-Pesa statements: stored originals, then parsed and analysed like real uploads.
  const samples = path.resolve(__dirname, "..", "samples", "statements");
  for (const s of [
    {
      file: "fictional-mpesa-statement.csv",
      owner: "Brian Otieno (fictional)",
      party: brian,
      type: "MPESA" as const,
      institution: "Safaricom M-Pesa",
      account: "0711000111",
      format: "CSV" as const,
      mime: "text/csv",
    },
    {
      file: "fictional-bank-statement.xlsx",
      owner: "Grace Wanjiku (fictional)",
      party: grace,
      type: "BANK" as const,
      institution: "Fictional Commercial Bank",
      account: "0100200300",
      format: "XLSX" as const,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  ]) {
    const buffer = readFileSync(path.join(samples, s.file));
    const statement = await prisma.$transaction(async (tx) => {
      const stored = await storeFile(tx, { buffer, originalName: s.file, mimeType: s.mime, sha256: sha256(buffer), uploadedById: inv.id, readOnly: true });
      return tx.financialStatement.create({
        data: {
          reference: await nextYearReference(tx, "statement"),
          caseId,
          ownerName: s.owner,
          relatedPartyId: s.party,
          institutionType: s.type,
          institution: s.institution,
          maskedAccount: `••••••${s.account.slice(-4)}`,
          currency: "KES",
          processingAuthority: "Customer consent and court order (fictional)",
          source: "Institution response (fictional)",
          format: s.format,
          originalFileId: stored.id,
          originalFilename: s.file,
          sha256: sha256(buffer),
          uploadedById: inv.id,
          isDemo: true,
        },
      });
    });
    await runStatementParse(statement.id);
  }
  console.log(`Created fictional case ${String(c1.reference)} with sub-files, parties, invoices, cheques, legal pathways, costs, recoveries, evidence and analysed statements.`);

  // ── Case 2: bad cheques, civil only ──
  const c2 = await create("cases", admin, {
    title: "Bad cheques — Kisumu hardware customers (fictional)",
    companyId: smr.id,
    branchId: kisumu.id,
    location: "Kisumu",
    category: "BAD_CHEQUE",
    description: "FICTIONAL DEMO CASE. Customer cheques returned unpaid.",
    leadInvestigatorId: lead.id,
    priority: "MEDIUM",
    financialRisk: "MEDIUM",
    grossAmount: "240000.00",
    amountConfirmedRecoverable: "240000.00",
    openedAt: iso(-40),
  });
  await cw.changeCaseStatus(lead, String(c2.id), "UNDER_INTERNAL_INVESTIGATION", "Cheques confirmed dishonoured");
  await cw.changeCaseStatus(lead, String(c2.id), "REFERRED_FOR_CIVIL_ACTION", "Demand letters unanswered");
  await create("cheques", lead, {
    caseId: String(c2.id),
    chequeNumber: "771201",
    bank: "Fictional Lake Bank",
    issuer: "Nyanza Hardware (fictional)",
    amount: "120000.00",
    chequeDate: iso(-38),
    status: "DISHONOURED",
    dateDishonoured: iso(-33),
    dishonourReason: "Refer to drawer",
    demandDeadline: iso(-5),
  });

  // ── Case 3: closed case (for reopening) ──
  const c3 = await create("cases", admin, {
    title: "Petty cash shortfall — Naivasha counter (fictional)",
    companyId: smr.id,
    location: "Naivasha",
    category: "CASH_MISAPPROPRIATION",
    description: "FICTIONAL DEMO CASE. Resolved shortfall.",
    leadInvestigatorId: lead.id,
    priority: "LOW",
    financialRisk: "LOW",
    grossAmount: "18000.00",
    amountConfirmedRecoverable: "18000.00",
    openedAt: iso(-120),
  });
  await cw.changeCaseStatus(lead, String(c3.id), "UNDER_INTERNAL_INVESTIGATION", "Review started");
  await cw.changeCaseStatus(lead, String(c3.id), "RECOVERY_MONITORING", "Shortfall repaid in full");
  await cw.closeCase(lead, String(c3.id), { reason: "Shortfall repaid and controls improved", summary: "Fictional demo closure: the counter shortfall was explained and repaid in full." });

  // ── Case 4: restricted case (need-to-know) ──
  await create("cases", admin, {
    title: "Procurement conflict of interest — restricted (fictional)",
    companyId: smt.id,
    location: "Nairobi",
    category: "PROCUREMENT_FRAUD",
    description: "FICTIONAL DEMO CASE with RESTRICTED confidentiality: only assigned users can see it.",
    leadInvestigatorId: lead.id,
    priority: "CRITICAL",
    confidentiality: "RESTRICTED",
    financialRisk: "CRITICAL",
    grossAmount: "4500000.00",
    openedAt: iso(-12),
  });
  console.log("Created 3 further fictional cases (bad cheques, closed, restricted).");
}

async function main() {
  assertDemoModeAllowed({ ...process.env, NEXT_PHASE: undefined });
  const demo = process.env.DEMO_MODE === "true";
  await seedOrganisation();
  console.log("Seeded companies, branches and departments (DEMO DATA).");
  if (!demo) {
    console.log("DEMO_MODE is not 'true' — skipped demo accounts and fictional cases.");
    return;
  }
  await seedDemoAdmin();
  if (await seedDemoUsers()) await seedDemoCases();
}

main()
  .catch((e: unknown) => {
    // Print only the message: never dump env or arguments.
    console.error("Seed failed:", e instanceof Error ? e.message : "unknown error");
    if (process.env.SEED_DEBUG === "true" && e instanceof Error) console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // The demo workflows above run through the app's own client (src/server/db.ts). Its MariaDB
    // pool keeps Node running until it is closed, so close it too (a no-op if it was never used).
    const { prisma: appDb } = await import("../src/server/db");
    await appDb.$disconnect();
  });
