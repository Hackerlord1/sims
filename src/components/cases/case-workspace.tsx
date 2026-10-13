"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Lock } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CaseActions } from "@/components/cases/case-actions";
import { CaseOverview } from "@/components/cases/case-overview";
import { ClosurePanel } from "@/components/cases/closure-panel";
import { CostsTab } from "@/components/cases/costs-tab";
import { InvestigationPathway } from "@/components/cases/pathway";
import type { CaseSummary } from "@/components/cases/types";
import { AuditTrail } from "@/components/admin/audit-trail";
import { StatementsTab } from "@/components/statements/statements-tab";
import { ResourceTable } from "@/components/resources/resource-table";
import { useCan } from "@/components/session-context";
import { Badge, DemoBadge, StatusBadge } from "@/components/ui/badge";
import { Ref } from "@/components/ui/display";
import { ErrorState, LoadingRows } from "@/components/ui/states";
import { apiGet, errorMessage } from "@/lib/api-client";
import { enumLabel } from "@/lib/enums";
import type { Action, Module } from "@/lib/permissions";
import { cn } from "@/lib/cn";

const EvidenceVaultLazy = dynamic(() => import("@/components/evidence/evidence-vault").then((m) => m.EvidenceVault), {
  loading: () => <LoadingRows rows={6} label="Loading evidence vault" />,
});

interface TabDef {
  value: string;
  label: string;
  requires: [Module, Action][];
  count?: (s: CaseSummary) => number | undefined;
}

const TABS: TabDef[] = [
  { value: "overview", label: "Overview", requires: [["CASES", "VIEW"]] },
  { value: "subfiles", label: "Sub-files", requires: [["SUBFILES", "VIEW"]], count: (s) => s.counts.subFiles },
  { value: "parties", label: "Parties", requires: [["PARTIES", "VIEW"]], count: (s) => s.counts.parties },
  { value: "invoices", label: "Invoices", requires: [["INVOICES", "VIEW"]], count: (s) => s.counts.invoices },
  { value: "cheques", label: "Bad cheques", requires: [["CHEQUES", "VIEW"]], count: (s) => s.counts.cheques },
  { value: "interviews", label: "Interviews and statements", requires: [["INTERVIEWS", "VIEW"]], count: (s) => s.counts.interviews },
  { value: "evidence", label: "Evidence", requires: [["EVIDENCE", "VIEW"]], count: (s) => s.counts.evidence },
  { value: "work", label: "Work done", requires: [["WORK_LOGS", "VIEW"]], count: (s) => s.counts.workLogs },
  { value: "tasks", label: "Tasks", requires: [["TASKS", "VIEW"]], count: (s) => s.counts.openTasks },
  { value: "findings", label: "Findings", requires: [["FINDINGS", "VIEW"]] },
  { value: "criminal", label: "Criminal", requires: [["CRIMINAL", "VIEW"]], count: (s) => s.counts.criminal },
  { value: "civil", label: "Civil", requires: [["CIVIL", "VIEW"]], count: (s) => s.counts.civil },
  { value: "disciplinary", label: "Disciplinary", requires: [["DISCIPLINARY", "VIEW"]] },
  {
    value: "costs",
    label: "Costs and budget",
    requires: [
      ["EXPENSES", "VIEW"],
      ["ADVANCES", "VIEW"],
      ["BUDGETS", "VIEW"],
    ],
  },
  { value: "recoveries", label: "Recoveries", requires: [["RECOVERIES", "VIEW"]] },
  { value: "write-offs", label: "Write-off", requires: [["WRITE_OFFS", "VIEW"]] },
  { value: "analysis", label: "Statement analysis", requires: [["STATEMENTS", "VIEW"]], count: (s) => s.counts.statements },
  { value: "closure", label: "Closure and history", requires: [["CASES", "VIEW"]] },
  { value: "audit", label: "Audit trail", requires: [["AUDIT", "VIEW_AUDIT_LOGS"]] },
];

export function CaseWorkspace({ caseId, initialTab, justOpened }: { caseId: string; initialTab?: string; justOpened?: boolean }) {
  const can = useCan();
  const router = useRouter();
  const pathname = usePathname();
  const tabs = TABS.filter((t) => t.requires.some(([m, a]) => can(m, a)));
  const [tab, setTab] = useState(tabs.some((t) => t.value === initialTab) ? initialTab! : "overview");
  const [showOpened, setShowOpened] = useState(Boolean(justOpened));
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["case-summary", caseId],
    queryFn: ({ signal }) => apiGet<CaseSummary>(`/cases/${caseId}/summary`, undefined, signal),
  });

  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingRows rows={10} label="Loading case" />;
  const s = data.data;
  const c = s.case;
  const closed = c.status === "CLOSED";

  const changeTab = (v: string) => {
    setTab(v);
    router.replace(`${pathname}?tab=${v}`, { scroll: false });
  };

  return (
    <div className="space-y-5">
      <AnimatePresence>
        {showOpened ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center justify-between gap-3 rounded-lg border border-success/40 bg-success-soft px-4 py-3 text-sm text-success"
            role="status"
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" aria-hidden /> Case <Ref>{c.reference}</Ref> opened.
            </span>
            <button type="button" className="text-xs underline" onClick={() => setShowOpened(false)}>
              Dismiss
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="text-xs text-muted">
          <Link href="/cases" className="hover:underline">
            Case files
          </Link>{" "}
          / <Ref>{c.reference}</Ref>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Ref className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-sm shadow-card">{c.reference}</Ref>
              <StatusBadge value={c.status} />
              <StatusBadge value={c.priority} />
              <Badge tone={c.confidentiality === "RESTRICTED" || c.confidentiality === "HIGHLY_CONFIDENTIAL" ? "danger" : "neutral"} icon={Lock}>
                {enumLabel(c.confidentiality)}
              </Badge>
              {c.legalHold ? (
                <Badge tone="warning" icon={Lock}>
                  Legal hold
                </Badge>
              ) : null}
              {c.isDemo ? <DemoBadge /> : null}
            </div>
            <h1 className="mt-2 text-[1.75rem] leading-tight sm:text-[2.1rem]">{c.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {c.company.name}
              {c.branch ? ` · ${c.branch.name}` : ""}
              {c.location ? ` · ${c.location}` : ""} · {enumLabel(c.category)} · Lead: {c.leadInvestigator?.fullName ?? "Unassigned"}
            </p>
          </div>
          <CaseActions summary={s} onChanged={() => refetch()} />
        </div>
        {closed ? (
          <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted" role="note">
            This case is closed. Its records are read-only until the case is reopened.
          </p>
        ) : null}
        <InvestigationPathway summary={s} />
      </header>

      <Tabs.Root value={tab} onValueChange={changeTab}>
        <Tabs.List aria-label="Case sections" className="flex gap-1 overflow-x-auto border-b border-border pb-px">
          {tabs.map((t) => {
            const n = t.count?.(s);
            return (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className={cn(
                  "tab-trigger relative shrink-0 rounded-t-md px-3 py-2 text-sm whitespace-nowrap text-muted hover:text-text",
                  "data-[state=active]:font-semibold data-[state=active]:text-text",
                )}
              >
                {t.label}
                {n ? <span className="tabular ml-1.5 rounded-full bg-surface-3 px-1.5 text-[11px] text-muted">{n}</span> : null}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
        <div className="pt-4">
          <Tabs.Content value="overview">{tab === "overview" ? <CaseOverview summary={s} onChanged={() => refetch()} /> : null}</Tabs.Content>
          <Tabs.Content value="subfiles">{tab === "subfiles" ? <ResourceTable resource="subfiles" caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="parties">{tab === "parties" ? <ResourceTable resource="parties" caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="invoices">{tab === "invoices" ? <ResourceTable resource="invoices" caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="cheques">{tab === "cheques" ? <ResourceTable resource="cheques" caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="interviews">
            {tab === "interviews" ? (
              <div className="space-y-5">
                <ResourceTable resource="interviews" caseId={caseId} title="Interviews" />
                <ResourceTable resource="party-statements" caseId={caseId} title="Statements" />
              </div>
            ) : null}
          </Tabs.Content>
          <Tabs.Content value="evidence">{tab === "evidence" ? <EvidenceVaultLazy caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="work">{tab === "work" ? <ResourceTable resource="work-logs" caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="tasks">{tab === "tasks" ? <ResourceTable resource="tasks" caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="findings">{tab === "findings" ? <ResourceTable resource="findings" caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="criminal">{tab === "criminal" ? <ResourceTable resource="criminal-matters" caseId={caseId} title="Police, DCI and DPP referrals" /> : null}</Tabs.Content>
          <Tabs.Content value="civil">{tab === "civil" ? <ResourceTable resource="civil-matters" caseId={caseId} title="Advocates and court cases" /> : null}</Tabs.Content>
          <Tabs.Content value="disciplinary">{tab === "disciplinary" ? <ResourceTable resource="disciplinary" caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="costs">{tab === "costs" ? <CostsTab caseId={caseId} summary={s} /> : null}</Tabs.Content>
          <Tabs.Content value="recoveries">{tab === "recoveries" ? <ResourceTable resource="recoveries" caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="write-offs">{tab === "write-offs" ? <ResourceTable resource="write-offs" caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="analysis">{tab === "analysis" ? <StatementsTab caseId={caseId} /> : null}</Tabs.Content>
          <Tabs.Content value="closure">{tab === "closure" ? <ClosurePanel summary={s} onChanged={() => refetch()} /> : null}</Tabs.Content>
          <Tabs.Content value="audit">{tab === "audit" ? <AuditTrail caseId={caseId} /> : null}</Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}
