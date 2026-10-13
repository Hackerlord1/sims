"use client";

import type { ComponentType } from "react";
import type { Row } from "@/components/resources/hooks";
import { EvidencePanel } from "@/components/resources/extensions/evidence-panel";
import { AdvancePanel, BudgetPanel, ExpensePanel, RecoveryPanel, WriteOffPanel } from "@/components/resources/extensions/finance-panels";
import {
  ChequePanel,
  CivilMatterPanel,
  CourtEventPanel,
  CriminalMatterPanel,
  DisciplinaryPanel,
  FindingPanel,
  InvoicePanel,
  MilestonePanel,
  PartyPanel,
  PartyStatementPanel,
  StatementFilePanel,
  SubFilePanel,
  WorkLogPanel,
} from "@/components/resources/extensions/record-panels";

export interface ExtensionProps {
  row: Row;
  refresh: () => Promise<void>;
}

/** Workflow panels shown above a record's details, keyed by resource. */
export const DETAIL_EXTENSIONS: Record<string, ComponentType<ExtensionProps>> = {
  evidence: EvidencePanel,
  expenses: ExpensePanel,
  budgets: BudgetPanel,
  advances: AdvancePanel,
  recoveries: RecoveryPanel,
  "write-offs": WriteOffPanel,
  cheques: ChequePanel,
  invoices: InvoicePanel,
  subfiles: SubFilePanel,
  "work-logs": WorkLogPanel,
  "party-statements": PartyStatementPanel,
  findings: FindingPanel,
  "criminal-matters": CriminalMatterPanel,
  "criminal-milestones": MilestonePanel,
  "civil-matters": CivilMatterPanel,
  "court-events": CourtEventPanel,
  disciplinary: DisciplinaryPanel,
  parties: PartyPanel,
  "financial-statements": StatementFilePanel,
};
