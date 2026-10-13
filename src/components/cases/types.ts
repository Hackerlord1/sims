export interface CaseRecord {
  id: string;
  reference: string;
  title: string;
  status: string;
  stage: string;
  priority: string;
  confidentiality: string;
  financialRisk: string;
  category: string;
  currency: string;
  legalHold: boolean;
  isDemo: boolean;
  isDeleted: boolean;
  version: number;
  description: string | null;
  allegationSummary: string | null;
  referralSource: string | null;
  businessUnit: string | null;
  location: string | null;
  openedAt: string;
  incidentDate: string | null;
  incidentPeriodFrom: string | null;
  incidentPeriodTo: string | null;
  targetClosureDate: string | null;
  actualClosureDate: string | null;
  closureReason: string | null;
  lastActivityAt: string;
  company: { name: string };
  branch: { name: string } | null;
  leadInvestigator: { id: string; fullName: string } | null;
  supervisingManager: { id: string; fullName: string } | null;
}

export interface Financials {
  grossAmount: string;
  amountDemanded: string;
  amountDisputed: string;
  amountAcknowledged: string;
  amountConfirmedRecoverable: string;
  amountRecovered: string;
  amountWrittenOff: string;
  remainingExposure: string;
  outstandingPrincipal: string;
  unsupportedInvoiceValue: string;
  badChequeValue: string;
  investigationExpenses: string;
  criminalExpenses: string;
  civilExpenses: string;
  recoveryExpenses: string;
  totalCosts: string;
  netRecovery: string;
  recoveryRate: string | null;
  costToRecoveryRatio: string | null;
  overRecovered: boolean;
}

export interface BudgetLineView {
  pathway: string;
  approved: string;
  actual: string;
  variance: string;
  utilisation: string | null;
  overBudget: boolean;
}

export interface CaseSummary {
  case: CaseRecord;
  financials: Financials;
  budget: { lines: BudgetLineView[]; total: Omit<BudgetLineView, "pathway"> };
  counts: Record<"subFiles" | "parties" | "invoices" | "cheques" | "interviews" | "evidence" | "workLogs" | "openTasks" | "overdueTasks" | "criminal" | "civil" | "statements", number>;
  history: { id: string; fromStatus: string | null; toStatus: string; reason: string | null; changedAt: string; changedBy: string }[];
  reopenings: { id: string; reason: string; newInformation: string; previousStatus: string; reopenedAt: string; reopenedBy: string }[];
  closures: { id: string; reason: string; summary: string; closedAt: string; closedBy: string }[];
}
