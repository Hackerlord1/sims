import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { caseVisibilityWhere } from "@/server/authz";
import type { CurrentUser } from "@/server/auth/principal";
import type { ExportColumn } from "@/server/services/exporter";
import { moneyMovement } from "@/server/statements/service";
import { computeCaseFinancials, budgetVsActual, COUNTED_EXPENSE_STATUSES, type Pathway } from "@/lib/finance";
import { canSeeSensitiveIdentifiers, type Module } from "@/lib/permissions";
import { enumLabel } from "@/lib/enums";
import { maskAccount } from "@/lib/masking";
import { formatPercent, money, sum, toDbString } from "@/lib/money";

export interface ReportFilters {
  caseId?: string;
  from?: Date;
  to?: Date;
}

export interface ReportData {
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  summary: string[];
}

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  module: Module;
  requiresCase?: boolean;
  build: (user: CurrentUser, f: ReportFilters) => Promise<ReportData>;
}

const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");
const m = (v: Prisma.Decimal | string | null | undefined) => (v === null || v === undefined ? "" : toDbString(money(v)));
const label = (v: string | null | undefined) => (v ? enumLabel(v) : "");
const live = { isDeleted: false } as const;

function caseWhere(user: CurrentUser, module: Module, f: ReportFilters): Prisma.CaseWhereInput {
  return { AND: [caseVisibilityWhere(user, module), { isDeleted: false }, ...(f.caseId ? [{ id: f.caseId }] : [])] };
}
const between = (f: ReportFilters) => (f.from || f.to ? { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: new Date(f.to.getTime() + 86_399_999) } : {}) } : undefined);

export const REPORTS: ReportDef[] = [
  {
    key: "weekly-progress",
    title: "Weekly investigation progress",
    description: "Activity per open case in the last seven days (or the chosen period): work done, tasks completed and status changes.",
    module: "CASES",
    async build(user, f) {
      const from = f.from ?? new Date(Date.now() - 7 * 86_400_000);
      const to = f.to ?? new Date();
      const period = { gte: from, lte: to };
      const cases = await prisma.case.findMany({
        where: { AND: [caseWhere(user, "CASES", f), { status: { not: "CLOSED" } }] },
        select: {
          reference: true,
          title: true,
          status: true,
          leadInvestigator: { select: { fullName: true } },
          _count: { select: { workLogs: { where: { ...live, occurredAt: period } }, tasks: { where: { ...live, completedAt: period } }, statusHistory: { where: { changedAt: period } } } },
        },
        orderBy: { reference: "asc" },
      });
      return {
        columns: [
          { key: "reference", label: "Case" },
          { key: "title", label: "Title" },
          { key: "status", label: "Status" },
          { key: "lead", label: "Lead investigator" },
          { key: "work", label: "Work-done entries" },
          { key: "tasks", label: "Tasks completed" },
          { key: "changes", label: "Status changes" },
        ],
        rows: cases.map((c) => ({
          reference: c.reference,
          title: c.title,
          status: label(c.status),
          lead: c.leadInvestigator?.fullName ?? "",
          work: c._count.workLogs,
          tasks: c._count.tasks,
          changes: c._count.statusHistory,
        })),
        summary: [`Period ${d(from)} to ${d(to)}`, `${cases.length} open case(s)`, `${cases.filter((c) => c._count.workLogs === 0).length} case(s) with no recorded work in the period`],
      };
    },
  },
  {
    key: "case-status",
    title: "Case status",
    description: "Every case with status, stage, lead, dates and financial exposure.",
    module: "CASES",
    async build(user, f) {
      const cases = await prisma.case.findMany({
        where: { AND: [caseWhere(user, "CASES", f), ...(between(f) ? [{ openedAt: between(f) }] : [])] },
        select: {
          reference: true,
          title: true,
          status: true,
          stage: true,
          priority: true,
          openedAt: true,
          targetClosureDate: true,
          actualClosureDate: true,
          grossAmount: true,
          amountConfirmedRecoverable: true,
          currency: true,
          leadInvestigator: { select: { fullName: true } },
          company: { select: { name: true } },
        },
        orderBy: { openedAt: "desc" },
      });
      return {
        columns: [
          { key: "reference", label: "Case" },
          { key: "title", label: "Title" },
          { key: "company", label: "Company" },
          { key: "status", label: "Status" },
          { key: "stage", label: "Stage" },
          { key: "priority", label: "Priority" },
          { key: "lead", label: "Lead" },
          { key: "opened", label: "Opened" },
          { key: "target", label: "Target closure" },
          { key: "closed", label: "Closed" },
          { key: "gross", label: "Gross amount", money: true },
          { key: "confirmed", label: "Confirmed recoverable", money: true },
        ],
        rows: cases.map((c) => ({
          reference: c.reference,
          title: c.title,
          company: c.company.name,
          status: label(c.status),
          stage: label(c.stage),
          priority: label(c.priority),
          lead: c.leadInvestigator?.fullName ?? "",
          opened: d(c.openedAt),
          target: d(c.targetClosureDate),
          closed: d(c.actualClosureDate),
          gross: m(c.grossAmount),
          confirmed: m(c.amountConfirmedRecoverable),
        })),
        summary: [`${cases.length} case(s)`, `${cases.filter((c) => c.status === "CLOSED").length} closed`],
      };
    },
  },
  {
    key: "work-done",
    title: "Work done",
    description: "Chronological work-done entries.",
    module: "WORK_LOGS",
    async build(user, f) {
      const rows = await prisma.workLog.findMany({
        where: { ...live, case: caseWhere(user, "WORK_LOGS", f), ...(between(f) ? { occurredAt: between(f) } : {}) },
        orderBy: { occurredAt: "asc" },
        take: 20000,
        select: {
          occurredAt: true,
          location: true,
          workPerformed: true,
          personContacted: true,
          outcome: true,
          nextTask: true,
          status: true,
          supervisorStatus: true,
          investigator: { select: { fullName: true } },
          case: { select: { reference: true } },
        },
      });
      return {
        columns: [
          { key: "case", label: "Case" },
          { key: "date", label: "Date" },
          { key: "investigator", label: "Investigator" },
          { key: "location", label: "Location" },
          { key: "work", label: "Work performed" },
          { key: "contacted", label: "Person contacted" },
          { key: "outcome", label: "Outcome" },
          { key: "next", label: "Next task" },
          { key: "status", label: "Status" },
          { key: "review", label: "Supervisor review" },
        ],
        rows: rows.map((r) => ({
          case: r.case.reference,
          date: r.occurredAt.toISOString().slice(0, 16).replace("T", " "),
          investigator: r.investigator.fullName,
          location: r.location,
          work: r.workPerformed,
          contacted: r.personContacted,
          outcome: r.outcome,
          next: r.nextTask,
          status: label(r.status),
          review: label(r.supervisorStatus),
        })),
        summary: [`${rows.length} entr${rows.length === 1 ? "y" : "ies"}`],
      };
    },
  },
  {
    key: "invoice-schedule",
    title: "Invoice schedule",
    description: "Invoices under investigation with amounts, classification and recovery status.",
    module: "INVOICES",
    async build(user, f) {
      const rows = await prisma.invoice.findMany({
        where: { ...live, case: caseWhere(user, "INVOICES", f), ...(between(f) ? { invoiceDate: between(f) } : {}) },
        orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }],
        take: 50000,
        include: { case: { select: { reference: true } } },
      });
      const out = rows.map((r) => ({
        case: r.case.reference,
        number: r.invoiceNumber,
        date: d(r.invoiceDate),
        customer: r.customerName,
        amount: m(r.invoiceAmount),
        paid: m(r.amountPaid),
        outstanding: toDbString(money(r.invoiceAmount).minus(r.amountPaid.toString())),
        disputed: m(r.amountDisputed),
        classification: label(r.classification),
        pod: label(r.proofOfDelivery),
        recovery: label(r.recoveryStatus),
      }));
      return {
        columns: [
          { key: "case", label: "Case" },
          { key: "number", label: "Invoice" },
          { key: "date", label: "Date" },
          { key: "customer", label: "Customer" },
          { key: "amount", label: "Amount", money: true },
          { key: "paid", label: "Paid", money: true },
          { key: "outstanding", label: "Outstanding", money: true },
          { key: "disputed", label: "Disputed", money: true },
          { key: "classification", label: "Classification" },
          { key: "pod", label: "Proof of delivery" },
          { key: "recovery", label: "Recovery status" },
        ],
        rows: out,
        summary: [`${rows.length} invoice(s)`, `Total invoiced: ${toDbString(sum(rows.map((r) => r.invoiceAmount)))}`, `Total outstanding: ${toDbString(sum(out.map((r) => r.outstanding)))}`],
      };
    },
  },
  {
    key: "bad-cheque-schedule",
    title: "Bad-cheque schedule",
    description: "Cheques with dishonour details, demand dates and complaint status.",
    module: "CHEQUES",
    async build(user, f) {
      const rows = await prisma.cheque.findMany({
        where: { ...live, case: caseWhere(user, "CHEQUES", f), ...(between(f) ? { chequeDate: between(f) } : {}) },
        orderBy: { chequeDate: "asc" },
        include: { case: { select: { reference: true } } },
      });
      return {
        columns: [
          { key: "case", label: "Case" },
          { key: "number", label: "Cheque" },
          { key: "bank", label: "Bank" },
          { key: "account", label: "Account" },
          { key: "issuer", label: "Issuer" },
          { key: "date", label: "Cheque date" },
          { key: "amount", label: "Amount", money: true },
          { key: "dishonoured", label: "Dishonoured" },
          { key: "reason", label: "Reason" },
          { key: "demand", label: "Demand letter" },
          { key: "status", label: "Status" },
          { key: "complaint", label: "Criminal complaint" },
        ],
        rows: rows.map((r) => ({
          case: r.case.reference,
          number: r.chequeNumber,
          bank: r.bank,
          account: r.accountNumberMasked,
          issuer: r.issuer,
          date: d(r.chequeDate),
          amount: m(r.amount),
          dishonoured: d(r.dateDishonoured),
          reason: r.dishonourReason,
          demand: d(r.demandLetterDate),
          status: label(r.status),
          complaint: label(r.criminalComplaintStatus),
        })),
        summary: [`${rows.length} cheque(s)`, `Total value: ${toDbString(sum(rows.map((r) => r.amount)))}`],
      };
    },
  },
  {
    key: "evidence-register",
    title: "Evidence register",
    description: "Evidence items with hashes, custodians and legal-hold status.",
    module: "EVIDENCE",
    async build(user, f) {
      const rows = await prisma.evidence.findMany({
        where: { ...live, case: caseWhere(user, "EVIDENCE", f), ...(between(f) ? { createdAt: between(f) } : {}) },
        orderBy: { reference: "asc" },
        include: { uploadedBy: { select: { fullName: true } } },
      });
      return {
        columns: [
          { key: "reference", label: "Reference" },
          { key: "title", label: "Title" },
          { key: "category", label: "Category" },
          { key: "file", label: "Original filename" },
          { key: "sha256", label: "SHA-256" },
          { key: "received", label: "Received" },
          { key: "uploaded", label: "Uploaded" },
          { key: "by", label: "Uploaded by" },
          { key: "hold", label: "Legal hold" },
        ],
        rows: rows.map((r) => ({
          reference: r.reference,
          title: r.title,
          category: label(r.category),
          file: r.originalFilename,
          sha256: r.sha256,
          received: d(r.dateReceived),
          uploaded: d(r.createdAt),
          by: r.uploadedBy.fullName,
          hold: r.legalHold ? "Yes" : "No",
        })),
        summary: [`${rows.length} item(s)`, `${rows.filter((r) => r.legalHold).length} under legal hold`],
      };
    },
  },
  {
    key: "interview-register",
    title: "Interview register",
    description: "Interviews with type, interviewers and next action.",
    module: "INTERVIEWS",
    async build(user, f) {
      const rows = await prisma.interview.findMany({
        where: { ...live, case: caseWhere(user, "INTERVIEWS", f), ...(between(f) ? { interviewDate: between(f) } : {}) },
        orderBy: { interviewDate: "asc" },
        include: { case: { select: { reference: true } }, party: { select: { name: true } }, signedStatement: { select: { signed: true } } },
      });
      return {
        columns: [
          { key: "case", label: "Case" },
          { key: "date", label: "Date" },
          { key: "interviewee", label: "Interviewee" },
          { key: "type", label: "Type" },
          { key: "interviewers", label: "Interviewers" },
          { key: "location", label: "Location" },
          { key: "signed", label: "Signed statement" },
          { key: "next", label: "Next action" },
        ],
        rows: rows.map((r) => ({
          case: r.case.reference,
          date: d(r.interviewDate),
          interviewee: r.party?.name ?? "",
          type: label(r.interviewType),
          interviewers: r.interviewers,
          location: r.location,
          signed: r.signedStatement?.signed ? "Yes" : "No",
          next: r.nextAction,
        })),
        summary: [`${rows.length} interview(s)`],
      };
    },
  },
  {
    key: "criminal-progress",
    title: "Criminal progress",
    description: "Police, DCI and DPP referrals with their latest milestone.",
    module: "CRIMINAL",
    async build(user, f) {
      const rows = await prisma.criminalMatter.findMany({
        where: { ...live, case: caseWhere(user, "CRIMINAL", f) },
        include: { case: { select: { reference: true } }, milestones: { where: live, orderBy: { milestoneDate: "desc" }, take: 1 } },
        orderBy: { dateReported: "asc" },
      });
      return {
        columns: [
          { key: "case", label: "Case" },
          { key: "station", label: "Station / DCI office" },
          { key: "ob", label: "OB number" },
          { key: "officer", label: "Investigating officer" },
          { key: "reported", label: "Reported" },
          { key: "status", label: "Status" },
          { key: "latest", label: "Latest milestone" },
          { key: "latestDate", label: "Milestone date" },
          { key: "next", label: "Next date" },
        ],
        rows: rows.map((r) => ({
          case: r.case.reference,
          station: r.policeStation,
          ob: r.obNumber,
          officer: [r.officerRank, r.investigatingOfficer].filter(Boolean).join(" "),
          reported: d(r.dateReported),
          status: label(r.status),
          latest: label(r.milestones[0]?.milestone),
          latestDate: d(r.milestones[0]?.milestoneDate),
          next: d(r.milestones[0]?.nextDate),
        })),
        summary: [`${rows.length} referral(s)`],
      };
    },
  },
  {
    key: "civil-progress",
    title: "Civil progress",
    description: "Advocate referrals and court cases with the latest event and next court date.",
    module: "CIVIL",
    async build(user, f) {
      const rows = await prisma.civilMatter.findMany({
        where: { ...live, case: caseWhere(user, "CIVIL", f) },
        include: { case: { select: { reference: true } }, events: { where: live, orderBy: { eventDate: "desc" }, take: 1 } },
        orderBy: { referralDate: "asc" },
      });
      return {
        columns: [
          { key: "case", label: "Case" },
          { key: "firm", label: "Legal firm" },
          { key: "advocate", label: "Advocate" },
          { key: "court", label: "Court" },
          { key: "courtCase", label: "Court case" },
          { key: "claimed", label: "Amount claimed", money: true },
          { key: "status", label: "Status" },
          { key: "latest", label: "Latest event" },
          { key: "next", label: "Next court date" },
        ],
        rows: rows.map((r) => ({
          case: r.case.reference,
          firm: r.legalFirm,
          advocate: r.advocate,
          court: [r.court, r.courtStation].filter(Boolean).join(", "),
          courtCase: r.courtCaseNumber,
          claimed: m(r.amountClaimed),
          status: label(r.status),
          latest: r.events[0] ? `${label(r.events[0].eventType)} (${d(r.events[0].eventDate)})` : "",
          next: d(r.events[0]?.nextCourtDate),
        })),
        summary: [`${rows.length} matter(s)`],
      };
    },
  },
  {
    key: "court-diary",
    title: "Court diary",
    description: "Upcoming court dates (civil) and next police/DPP dates (criminal).",
    module: "CIVIL",
    async build(user, f) {
      const from = f.from ?? new Date(Date.now() - 86_400_000);
      const to = f.to ?? new Date(Date.now() + 90 * 86_400_000);
      const [events, milestones] = await Promise.all([
        prisma.courtEvent.findMany({
          where: { ...live, nextCourtDate: { gte: from, lte: to }, matter: { isDeleted: false, case: caseWhere(user, "CIVIL", f) } },
          include: { matter: { select: { courtCaseNumber: true, court: true, advocate: true, case: { select: { reference: true } } } } },
        }),
        prisma.criminalMilestone.findMany({
          where: { ...live, nextDate: { gte: from, lte: to }, matter: { isDeleted: false, case: caseWhere(user, "CRIMINAL", f) } },
          include: { matter: { select: { obNumber: true, policeStation: true, case: { select: { reference: true } } } } },
        }),
      ]);
      const rows = [
        ...events.map((e) => ({
          date: d(e.nextCourtDate),
          track: "Civil",
          case: e.matter.case.reference,
          matter: e.matter.courtCaseNumber ?? "",
          where: e.matter.court ?? "",
          after: label(e.eventType),
          next: e.nextTask ?? "",
          responsible: e.responsibleParty ?? e.matter.advocate,
        })),
        ...milestones.map((x) => ({
          date: d(x.nextDate),
          track: "Criminal",
          case: x.matter.case.reference,
          matter: x.matter.obNumber ?? "",
          where: x.matter.policeStation,
          after: label(x.milestone),
          next: x.nextTask ?? "",
          responsible: x.responsibleParty ?? "",
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      return {
        columns: [
          { key: "date", label: "Date" },
          { key: "track", label: "Track" },
          { key: "case", label: "Case" },
          { key: "matter", label: "Court case / OB" },
          { key: "where", label: "Court / station" },
          { key: "after", label: "After" },
          { key: "next", label: "Next task" },
          { key: "responsible", label: "Responsible" },
        ],
        rows,
        summary: [`${d(from)} to ${d(to)}`, `${rows.length} date(s)`],
      };
    },
  },
  {
    key: "expense-report",
    title: "Expense report",
    description: "Investigation expenses with approval and payment status.",
    module: "EXPENSES",
    async build(user, f) {
      const rows = await prisma.expense.findMany({
        where: { ...live, case: caseWhere(user, "EXPENSES", f), ...(between(f) ? { expenseDate: between(f) } : {}) },
        orderBy: { expenseDate: "asc" },
        include: { case: { select: { reference: true } }, employee: { select: { fullName: true } } },
      });
      const approved = sum(rows.filter((r) => COUNTED_EXPENSE_STATUSES.has(r.status)).map((r) => r.approvedAmount));
      return {
        columns: [
          { key: "reference", label: "Reference" },
          { key: "case", label: "Case" },
          { key: "date", label: "Date" },
          { key: "pathway", label: "Pathway" },
          { key: "category", label: "Category" },
          { key: "description", label: "Description" },
          { key: "employee", label: "Employee" },
          { key: "requested", label: "Requested", money: true },
          { key: "approved", label: "Approved", money: true },
          { key: "paid", label: "Paid", money: true },
          { key: "status", label: "Status" },
        ],
        rows: rows.map((r) => ({
          reference: r.reference,
          case: r.case.reference,
          date: d(r.expenseDate),
          pathway: label(r.pathway),
          category: label(r.category),
          description: r.description,
          employee: r.employee?.fullName ?? "",
          requested: m(r.requestedAmount),
          approved: m(r.approvedAmount),
          paid: m(r.paidAmount),
          status: label(r.status),
        })),
        summary: [`${rows.length} expense(s)`, `Approved (counted): ${toDbString(approved)}`],
      };
    },
  },
  {
    key: "budget-vs-actual",
    title: "Budget versus actual",
    description: "Approved budget, actual expenses, variance and utilisation per case and pathway.",
    module: "BUDGETS",
    async build(user, f) {
      const cases = await prisma.case.findMany({
        where: caseWhere(user, "BUDGETS", f),
        select: {
          reference: true,
          budgets: { where: live, select: { pathway: true, status: true, approvedAmount: true } },
          expenses: { where: live, select: { pathway: true, status: true, approvedAmount: true } },
          recoveries: { where: { ...live, status: "VERIFIED" }, select: { status: true, grossAmount: true, recoveryCosts: true } },
        },
        orderBy: { reference: "asc" },
      });
      const rows = cases.flatMap((c) =>
        budgetVsActual(
          c.budgets.map((b) => ({ ...b, pathway: b.pathway as Pathway })),
          c.expenses.map((e) => ({ ...e, pathway: e.pathway as Pathway })),
          c.recoveries,
        ).lines.map((l) => ({
          case: c.reference,
          pathway: label(l.pathway),
          approved: toDbString(l.approved),
          actual: toDbString(l.actual),
          variance: toDbString(l.variance),
          utilisation: formatPercent(l.utilisation),
          flag: l.overBudget ? "Over budget" : "",
        })),
      );
      return {
        columns: [
          { key: "case", label: "Case" },
          { key: "pathway", label: "Pathway" },
          { key: "approved", label: "Approved budget", money: true },
          { key: "actual", label: "Actual", money: true },
          { key: "variance", label: "Variance", money: true },
          { key: "utilisation", label: "Utilisation" },
          { key: "flag", label: "Flag" },
        ],
        rows,
        summary: [`${cases.length} case(s)`, `${rows.filter((r) => r.flag).length} pathway line(s) over budget`],
      };
    },
  },
  {
    key: "advance-imprest",
    title: "Advance and imprest",
    description: "Advances issued, accounted and outstanding.",
    module: "ADVANCES",
    async build(user, f) {
      const rows = await prisma.advance.findMany({
        where: { ...live, case: caseWhere(user, "ADVANCES", f) },
        include: { case: { select: { reference: true } }, employee: { select: { fullName: true } }, expenses: { where: live, select: { status: true, approvedAmount: true } } },
        orderBy: { createdAt: "asc" },
      });
      const out = rows.map((r) => {
        const actual = sum(r.expenses.filter((e) => COUNTED_EXPENSE_STATUSES.has(e.status)).map((e) => e.approvedAmount));
        const outstanding = money(r.amountIssued).minus(actual).minus(r.amountReturned.toString());
        return {
          reference: r.reference,
          case: r.case.reference,
          employee: r.employee.fullName,
          purpose: r.purpose,
          requested: m(r.amountRequested),
          issued: m(r.amountIssued),
          actual: toDbString(actual),
          returned: m(r.amountReturned),
          outstanding: toDbString(outstanding.isNegative() ? 0 : outstanding),
          deadline: d(r.accountingDeadline),
          status: label(r.status),
        };
      });
      return {
        columns: [
          { key: "reference", label: "Reference" },
          { key: "case", label: "Case" },
          { key: "employee", label: "Employee" },
          { key: "purpose", label: "Purpose" },
          { key: "requested", label: "Requested", money: true },
          { key: "issued", label: "Issued", money: true },
          { key: "actual", label: "Actual expenditure", money: true },
          { key: "returned", label: "Returned", money: true },
          { key: "outstanding", label: "Outstanding", money: true },
          { key: "deadline", label: "Accounting deadline" },
          { key: "status", label: "Status" },
        ],
        rows: out,
        summary: [`${rows.length} advance(s)`, `Total outstanding: ${toDbString(sum(out.map((r) => r.outstanding)))}`],
      };
    },
  },
  {
    key: "gross-recovery",
    title: "Gross recovery",
    description: "Verified recoveries by date, method and payer.",
    module: "RECOVERIES",
    async build(user, f) {
      const rows = await prisma.recovery.findMany({
        where: { ...live, status: "VERIFIED", case: caseWhere(user, "RECOVERIES", f), ...(between(f) ? { recoveryDate: between(f) } : {}) },
        orderBy: { recoveryDate: "asc" },
        include: { case: { select: { reference: true } } },
      });
      const showFull = canSeeSensitiveIdentifiers(user);
      return {
        columns: [
          { key: "reference", label: "Reference" },
          { key: "case", label: "Case" },
          { key: "date", label: "Date" },
          { key: "payer", label: "Payer" },
          { key: "method", label: "Method" },
          { key: "gross", label: "Gross", money: true },
          { key: "costs", label: "Recovery costs", money: true },
          { key: "net", label: "Net", money: true },
          { key: "receipt", label: "Receipt" },
          { key: "account", label: "Receiving account" },
        ],
        rows: rows.map((r) => ({
          reference: r.reference,
          case: r.case.reference,
          date: d(r.recoveryDate),
          payer: r.payer,
          method: label(r.method),
          gross: m(r.grossAmount),
          costs: m(r.recoveryCosts),
          net: toDbString(money(r.grossAmount).minus(r.recoveryCosts.toString())),
          receipt: r.receiptNumber,
          account: showFull ? r.receivingAccount : maskAccount(r.receivingAccount),
        })),
        summary: [`${rows.length} verified recover${rows.length === 1 ? "y" : "ies"}`, `Gross recovery: ${toDbString(sum(rows.map((r) => r.grossAmount)))}`],
      };
    },
  },
  ...(["net-recovery", "cost-to-recovery"] as const).map((key): ReportDef => ({
    key,
    title: key === "net-recovery" ? "Net recovery" : "Cost-to-recovery analysis",
    description: key === "net-recovery" ? "Gross recovery less total investigation cost, per case." : "Total investigation cost as a percentage of gross recovery, and recovery rate, per case.",
    module: "RECOVERIES",
    async build(user, f) {
      const cases = await prisma.case.findMany({
        where: caseWhere(user, "RECOVERIES", f),
        select: {
          reference: true,
          title: true,
          grossAmount: true,
          amountDemanded: true,
          amountDisputed: true,
          amountAcknowledged: true,
          amountConfirmedRecoverable: true,
          expenses: { where: live, select: { pathway: true, status: true, approvedAmount: true } },
          recoveries: { where: live, select: { status: true, grossAmount: true, recoveryCosts: true } },
          writeOffs: { where: live, select: { status: true, amount: true } },
          invoices: { where: live, select: { classification: true, invoiceAmount: true, amountPaid: true } },
          cheques: { where: live, select: { amount: true, status: true, dateDishonoured: true } },
        },
        orderBy: { reference: "asc" },
      });
      const rows = cases.map((c) => {
        const s = computeCaseFinancials({
          exposure: c,
          expenses: c.expenses.map((e) => ({ ...e, pathway: e.pathway as Pathway })),
          recoveries: c.recoveries,
          writeOffs: c.writeOffs,
          invoices: c.invoices,
          cheques: c.cheques,
        });
        return {
          case: c.reference,
          title: c.title,
          confirmed: toDbString(s.amountConfirmedRecoverable),
          gross: toDbString(s.amountRecovered),
          costs: toDbString(s.totalCosts),
          net: toDbString(s.netRecovery),
          rate: formatPercent(s.recoveryRate),
          ratio: formatPercent(s.costToRecoveryRatio),
        };
      });
      return {
        columns: [
          { key: "case", label: "Case" },
          { key: "title", label: "Title" },
          { key: "confirmed", label: "Confirmed recoverable", money: true },
          { key: "gross", label: "Gross recovery", money: true },
          { key: "costs", label: "Total investigation cost", money: true },
          { key: "net", label: "Net recovery", money: true },
          { key: "rate", label: "Recovery rate" },
          { key: "ratio", label: "Cost-to-recovery ratio" },
        ],
        rows,
        summary: [`${rows.length} case(s)`, `Total net recovery: ${toDbString(sum(rows.map((r) => r.net)))}`, "Ratios show “Not applicable” where the denominator is zero."],
      };
    },
  })),
  {
    key: "money-movement",
    title: "Money-movement analysis",
    description: "Counterparty totals and flows from the case's bank and M-Pesa statements. Automated analysis produces leads that require human verification.",
    module: "STATEMENTS",
    requiresCase: true,
    async build(user, f) {
      const mm = await moneyMovement(user, f.caseId!, {});
      return {
        columns: [
          { key: "label", label: "Counterparty" },
          { key: "inflow", label: "Money in", money: true },
          { key: "outflow", label: "Money out", money: true },
          { key: "count", label: "Transactions" },
          { key: "flagged", label: "Flagged (leads)" },
          { key: "known", label: "Identified" },
        ],
        rows: mm.counterparties.map((c) => ({ ...c, known: c.known ? "Known party" : "Unknown" })),
        summary: [mm.notice, `${mm.transactionCount} transactions`, `Money in ${mm.totals.inflow}; money out ${mm.totals.outflow}`],
      };
    },
  },
  {
    key: "management-recommendation",
    title: "Management recommendation",
    description: "Findings, recommendations and management decisions.",
    module: "FINDINGS",
    async build(user, f) {
      const rows = await prisma.finding.findMany({
        where: { ...live, case: caseWhere(user, "FINDINGS", f) },
        include: { case: { select: { reference: true } }, recommendations: true, decisions: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      });
      return {
        columns: [
          { key: "case", label: "Case" },
          { key: "title", label: "Finding" },
          { key: "confirmed", label: "Confirmed amount", money: true },
          { key: "sufficiency", label: "Evidence sufficiency" },
          { key: "recommendations", label: "Recommendations" },
          { key: "status", label: "Status" },
          { key: "decision", label: "Decision" },
          { key: "conditions", label: "Conditions" },
        ],
        rows: rows.map((r) => ({
          case: r.case.reference,
          title: r.title,
          confirmed: m(r.confirmedAmount),
          sufficiency: label(r.evidenceSufficiency),
          recommendations: r.recommendations.map((x) => `${label(x.type)}${x.approved === true ? " (approved)" : x.approved === false ? " (not approved)" : ""}`).join("; "),
          status: label(r.status),
          decision: r.decisions[0] ? `${label(r.decisions[0].outcome)} ${d(r.decisions[0].decisionDate)}` : "",
          conditions: r.decisions[0]?.conditions ?? "",
        })),
        summary: [`${rows.length} finding(s)`, `${rows.filter((r) => r.status === "SUBMITTED").length} awaiting decision`],
      };
    },
  },
  {
    key: "case-closure",
    title: "Case closure",
    description: "Closed cases with closure reasons, summaries and the checklist at closure.",
    module: "CASES",
    async build(user, f) {
      const rows = await prisma.caseClosure.findMany({
        where: { case: caseWhere(user, "CASES", f), ...(between(f) ? { closedAt: between(f) } : {}) },
        include: { case: { select: { reference: true, title: true, status: true } } },
        orderBy: { closedAt: "asc" },
      });
      return {
        columns: [
          { key: "case", label: "Case" },
          { key: "title", label: "Title" },
          { key: "closed", label: "Closed" },
          { key: "reason", label: "Reason" },
          { key: "summary", label: "Summary" },
          { key: "warnings", label: "Warnings at closure" },
          { key: "current", label: "Current status" },
        ],
        rows: rows.map((r) => ({
          case: r.case.reference,
          title: r.case.title,
          closed: d(r.closedAt),
          reason: r.reason,
          summary: r.summary,
          warnings: (r.checklist as { ok: boolean; label: string }[])
            .filter((c) => !c.ok)
            .map((c) => c.label)
            .join("; "),
          current: label(r.case.status),
        })),
        summary: [`${rows.length} closure record(s)`],
      };
    },
  },
];

export const REPORT_MAP = Object.fromEntries(REPORTS.map((r) => [r.key, r]));
