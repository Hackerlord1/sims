"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, Briefcase, CalendarClock, CircleDollarSign, Coins, FileWarning, Gauge, Hourglass, Landmark, Scale, TrendingUp, Wallet } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useCan, useSession } from "@/components/session-context";
import { StatusBadge } from "@/components/ui/badge";
import { Card, DateText, Money, PageHeader, Ref } from "@/components/ui/display";
import { KpiCard } from "@/components/ui/kpi";
import { MetricDrawer } from "@/components/dashboard/metric-drawer";
import type { DashboardMetric } from "@/lib/dashboard-metrics";
import { ErrorState, LoadingRows } from "@/components/ui/states";
import { apiGet, errorMessage } from "@/lib/api-client";
import { enumLabel } from "@/lib/enums";
import { formatPercent, money } from "@/lib/money";

const BarChart = dynamic(() => import("@/components/dashboard/bar-chart"), { ssr: false, loading: () => <LoadingRows rows={3} label="Loading chart" /> });

interface Dash {
  counts: Record<"openCases" | "closedCases" | "overdueTasks" | "inactiveCases" | "awaitingDecision" | "findingsSubmitted" | "pendingExpenses" | "pendingRecoveries" | "unaccountedAdvances", number>;
  casesByStatus: { status: string; count: number }[];
  casesByStage: { stage: string; count: number }[];
  aging: { bucket: string; count: number }[];
  exposure: Record<"grossAmount" | "amountDemanded" | "amountDisputed" | "amountAcknowledged" | "amountConfirmedRecoverable" | "amountRecovered", string>;
  costs: { investigation: string; criminal: string; civil: string; recovery: string; total: string; netRecovery: string; recoveryRate: string | null; costToRecoveryRatio: string | null };
  expensesByCategory: { category: string; amount: string }[];
  budget: { approved: string; actual: string; variance: string; utilisation: string | null };
  myTasks: { id: string; reference: string; title: string; dueDate: string | null; status: string; category: string; caseId: string }[];
  inactive: { id: string; reference: string; title: string; lastActivityAt: string }[];
  followUps: { id: string; title: string; dueDate: string | null; category: string; caseId: string; case: { reference: string } }[];
  milestones: { id: string; milestone: string; nextDate: string; nextTask: string | null; matter: { obNumber: string | null; policeStation: string; caseId: string } }[];
  courtDates: { id: string; eventType: string; nextCourtDate: string; nextTask: string | null; matter: { courtCaseNumber: string | null; court: string | null; caseId: string } }[];
  awaitingDecision: { id: string; reference: string; title: string; lastActivityAt: string }[];
  unaccounted: { id: string; reference: string; purpose: string; amountIssued: string; accountingDeadline: string; caseId: string; employee: { fullName: string } }[];
  importFailures: { id: string; reference: string; entityType: string; status: string; createdAt: string; failedRows: number; invalidRows: number }[];
}

const deskDate = new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" });

const pct = (v: string | null) => formatPercent(v === null ? null : money(v));

function ChartWithTable({ title, rows, money: isMoney, id }: { title: string; rows: { name: string; value: string | number }[]; money?: boolean; id: string }) {
  const [table, setTable] = useState(false);
  return (
    <Card
      title={title}
      id={id}
      actions={
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-accent underline-offset-2 transition-colors hover:bg-accent-soft hover:underline"
          aria-pressed={table}
          onClick={() => setTable((t) => !t)}
        >
          {table ? "Show chart" : "Show table"}
        </button>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No data yet.</p>
      ) : table ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.name}>
                <th scope="row" className="py-1 text-left font-normal">
                  {r.name}
                </th>
                <td className="tabular py-1 text-right">{isMoney ? <Money value={String(r.value)} /> : r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <BarChart label={title} money={isMoney} data={rows.map((r) => ({ name: r.name, value: Number(r.value) }))} />
      )}
    </Card>
  );
}

function ListCard({ title, id, empty, children }: { title: string; id: string; empty: boolean; children: ReactNode }) {
  return (
    <Card title={title} id={id}>
      {empty ? <p className="text-sm text-muted">Nothing to show.</p> : <ul className="list-rows divide-y divide-border text-sm">{children}</ul>}
    </Card>
  );
}

export function Dashboard() {
  const s = useSession();
  const can = useCan();
  const views = [
    { value: "investigator", label: "Investigator", show: can("CASES", "VIEW") },
    { value: "management", label: "Management", show: can("CASES", "VIEW") },
    { value: "finance", label: "Finance", show: can("EXPENSES", "VIEW") || can("RECOVERIES", "VIEW") },
    { value: "legal", label: "Legal", show: can("CRIMINAL", "VIEW") || can("CIVIL", "VIEW") },
    { value: "admin", label: "Administration", show: can("DATA_ADMIN", "VIEW") },
  ].filter((v) => v.show);
  const defaultView =
    s.role === "FINANCE_REVIEWER"
      ? "finance"
      : s.role === "LEGAL_OFFICER" || s.role === "EXTERNAL_ADVOCATE_RESTRICTED"
        ? "legal"
        : s.role === "SYSTEM_ADMIN"
          ? "admin"
          : ["MANAGEMENT_APPROVER", "EXECUTIVE_READ_ONLY", "INTERNAL_AUDIT_REVIEWER", "COMPLIANCE_REVIEWER"].includes(s.role)
            ? "management"
            : "investigator";
  const [view, setView] = useState(views.some((v) => v.value === defaultView) ? defaultView : (views[0]?.value ?? "investigator"));
  const [metric, setMetric] = useState<DashboardMetric | null>(null);
  // A figure opens its records only for viewers who can see that module; the API enforces the same rule.
  const open = (m: DashboardMetric, allowed: boolean) => (allowed ? () => setMetric(m) : undefined);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["dashboard"], queryFn: ({ signal }) => apiGet<Dash>("/dashboard", undefined, signal), refetchInterval: 120_000 });

  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingRows rows={10} label="Loading dashboard" />;
  const d = data.data;

  const exposureKpis = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        index={0}
        label="Financial exposure (gross)"
        icon={Scale}
        onOpen={open("exposure", can("CASES", "VIEW"))}
        value={<Money value={d.exposure.grossAmount} />}
        hint={
          <>
            Confirmed recoverable <Money value={d.exposure.amountConfirmedRecoverable} />
          </>
        }
      />
      <KpiCard
        index={1}
        label="Amount recovered"
        icon={TrendingUp}
        tone="success"
        onOpen={open("recovered", can("RECOVERIES", "VIEW"))}
        value={<Money value={d.exposure.amountRecovered} />}
        hint={`Recovery rate ${pct(d.costs.recoveryRate)}`}
      />
      <KpiCard
        index={2}
        label="Investigation expenses"
        icon={Wallet}
        tone="warning"
        onOpen={open("expenses", can("EXPENSES", "VIEW"))}
        value={<Money value={d.costs.total} />}
        hint={`Cost-to-recovery ${pct(d.costs.costToRecoveryRatio)}`}
      />
      <KpiCard index={3} label="Net recovery" icon={Coins} tone={money(d.costs.netRecovery).isNegative() ? "danger" : "accent"} value={<Money value={d.costs.netRecovery} />} />
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Case desk · ${deskDate.format(new Date())}`}
        title={`Welcome, ${s.fullName.split(" ")[0]}`}
        description={`${s.roleLabel} · Investigation command centre for the cases you can access.`}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard index={0} label="Open cases" icon={Briefcase} onOpen={open("open-cases", can("CASES", "VIEW"))} value={d.counts.openCases} hint={`${d.counts.closedCases} closed`} />
        <KpiCard
          index={1}
          label="Overdue tasks"
          icon={AlarmClock}
          onOpen={open("overdue-tasks", can("TASKS", "VIEW"))}
          tone={d.counts.overdueTasks ? "danger" : "default"}
          value={d.counts.overdueTasks}
        />
        <KpiCard
          index={2}
          label="Inactive cases"
          icon={Hourglass}
          onOpen={open("inactive-cases", can("CASES", "VIEW"))}
          tone={d.counts.inactiveCases ? "warning" : "default"}
          value={d.counts.inactiveCases}
        />
        <KpiCard
          index={3}
          label="Awaiting management decision"
          icon={Gauge}
          onOpen={open("awaiting-decision", can("CASES", "VIEW"))}
          tone={d.counts.awaitingDecision ? "warning" : "default"}
          value={d.counts.awaitingDecision}
          hint={`${d.counts.findingsSubmitted} finding(s) submitted`}
        />
        <KpiCard
          index={4}
          label="Unaccounted advances"
          icon={FileWarning}
          onOpen={open("unaccounted-advances", can("ADVANCES", "VIEW"))}
          tone={d.counts.unaccountedAdvances ? "danger" : "default"}
          value={d.counts.unaccountedAdvances}
        />
      </div>

      <Tabs.Root value={view} onValueChange={setView}>
        <Tabs.List aria-label="Dashboard views" className="flex gap-1 overflow-x-auto border-b border-border">
          {views.map((v) => (
            <Tabs.Trigger
              key={v.value}
              value={v.value}
              className="tab-trigger rounded-t-md px-3 py-2 text-sm whitespace-nowrap text-muted hover:text-text data-[state=active]:font-semibold data-[state=active]:text-text"
            >
              {v.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="investigator" className="space-y-5 pt-4">
          <div className="grid gap-5 xl:grid-cols-2">
            <ListCard title="My open tasks" id="my-tasks" empty={!d.myTasks.length}>
              {d.myTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/cases/${t.caseId}?tab=tasks`} className="min-w-0 hover:underline">
                    <Ref className="text-xs text-muted">{t.reference}</Ref> <span className="block truncate">{t.title}</span>
                  </Link>
                  <span className="shrink-0 text-right text-xs">
                    <StatusBadge value={t.dueDate && new Date(t.dueDate) < new Date() ? "OVERDUE" : t.status} />
                    <span className="block text-muted">
                      <DateText value={t.dueDate} />
                    </span>
                  </span>
                </li>
              ))}
            </ListCard>
            <ListCard title="Inactive cases" id="inactive" empty={!d.inactive.length}>
              {d.inactive.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/cases/${c.id}`} className="min-w-0 hover:underline">
                    <Ref className="text-xs">{c.reference}</Ref> <span className="block truncate">{c.title}</span>
                  </Link>
                  <span className="text-xs text-muted">
                    Last activity <DateText value={c.lastActivityAt} />
                  </span>
                </li>
              ))}
            </ListCard>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartWithTable id="by-stage" title="Open cases by investigation stage" rows={d.casesByStage.map((x) => ({ name: enumLabel(x.stage), value: x.count }))} />
            <ChartWithTable id="aging" title="Case aging (open cases)" rows={d.aging.map((a) => ({ name: a.bucket, value: a.count }))} />
          </div>
        </Tabs.Content>

        <Tabs.Content value="management" className="space-y-5 pt-4">
          {exposureKpis}
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Financial exposure (open cases)" id="exposure">
              <table className="w-full text-sm">
                <caption className="sr-only">Exposure totals</caption>
                <tbody className="divide-y divide-border">
                  {(
                    [
                      ["Gross amount under investigation", d.exposure.grossAmount],
                      ["Amount demanded", d.exposure.amountDemanded],
                      ["Amount disputed", d.exposure.amountDisputed],
                      ["Amount acknowledged", d.exposure.amountAcknowledged],
                      ["Confirmed recoverable", d.exposure.amountConfirmedRecoverable],
                      ["Recovered (verified)", d.exposure.amountRecovered],
                    ] as const
                  ).map(([l, v]) => (
                    <tr key={l}>
                      <th scope="row" className="py-1.5 text-left font-normal text-muted">
                        {l}
                      </th>
                      <td className="py-1.5 text-right">
                        <Money value={v} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <ChartWithTable id="by-status" title="Cases by status" rows={d.casesByStatus.map((x) => ({ name: enumLabel(x.status), value: x.count }))} />
          </div>
          <ListCard title="Cases awaiting management decisions" id="awaiting" empty={!d.awaitingDecision.length}>
            {d.awaitingDecision.map((c) => (
              <li key={c.id} className="py-2">
                <Link href={`/cases/${c.id}?tab=findings`} className="hover:underline">
                  <Ref className="text-xs">{c.reference}</Ref> {c.title}
                </Link>
              </li>
            ))}
          </ListCard>
        </Tabs.Content>

        <Tabs.Content value="finance" className="space-y-5 pt-4">
          {exposureKpis}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Approved budget" icon={Landmark} onOpen={open("budgets", can("BUDGETS", "VIEW"))} value={<Money value={d.budget.approved} />} />
            <KpiCard
              label="Actual expenses"
              icon={Wallet}
              onOpen={open("expenses", can("EXPENSES", "VIEW"))}
              value={<Money value={d.budget.actual} />}
              hint={`Utilisation ${pct(d.budget.utilisation)}`}
            />
            <KpiCard label="Budget variance" icon={Gauge} tone={money(d.budget.variance).isNegative() ? "danger" : "default"} value={<Money value={d.budget.variance} />} />
            <KpiCard
              label="Awaiting finance action"
              icon={CircleDollarSign}
              onOpen={open("pending-finance", can("EXPENSES", "VIEW") || can("RECOVERIES", "VIEW"))}
              value={d.counts.pendingExpenses + d.counts.pendingRecoveries}
              hint={`${d.counts.pendingExpenses} expense(s) · ${d.counts.pendingRecoveries} recovery record(s)`}
            />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartWithTable id="by-category" title="Expenses by category" money rows={d.expensesByCategory.map((e) => ({ name: enumLabel(e.category), value: e.amount }))} />
            <ChartWithTable
              id="by-pathway"
              title="Costs by pathway"
              money
              rows={[
                { name: "Internal investigation", value: d.costs.investigation },
                { name: "Criminal action", value: d.costs.criminal },
                { name: "Civil action", value: d.costs.civil },
                { name: "Recovery and enforcement", value: d.costs.recovery },
              ]}
            />
          </div>
          <ListCard title="Unaccounted advances" id="unaccounted" empty={!d.unaccounted.length}>
            {d.unaccounted.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/cases/${a.caseId}?tab=costs`} className="hover:underline">
                  <Ref className="text-xs">{a.reference}</Ref> {a.purpose} — {a.employee.fullName}
                </Link>
                <span className="text-xs">
                  <Money value={a.amountIssued} /> · deadline <DateText value={a.accountingDeadline} />
                </span>
              </li>
            ))}
          </ListCard>
        </Tabs.Content>

        <Tabs.Content value="legal" className="space-y-5 pt-4">
          <div className="grid gap-5 xl:grid-cols-2">
            <ListCard title="Upcoming court dates" id="court" empty={!d.courtDates.length}>
              {d.courtDates.map((c) => (
                <li key={c.id} className="flex items-start gap-3 py-2">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent" aria-hidden>
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <Link href={`/cases/${c.matter.caseId}?tab=civil`} className="hover:underline">
                    <strong>
                      <DateText value={c.nextCourtDate} />
                    </strong>{" "}
                    · <Ref>{c.matter.courtCaseNumber ?? "Court case"}</Ref> {c.matter.court ? `· ${c.matter.court}` : ""}
                    <span className="block text-xs text-muted">
                      After {enumLabel(c.eventType).toLowerCase()}
                      {c.nextTask ? ` — ${c.nextTask}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ListCard>
            <ListCard title="Police, DCI and DPP follow-ups" id="followups" empty={!d.followUps.length && !d.milestones.length}>
              {d.milestones.map((m) => (
                <li key={m.id} className="py-2">
                  <Link href={`/cases/${m.matter.caseId}?tab=criminal`} className="hover:underline">
                    <strong>
                      <DateText value={m.nextDate} />
                    </strong>{" "}
                    · {m.matter.obNumber ? <Ref>OB {m.matter.obNumber}</Ref> : m.matter.policeStation}
                    <span className="block text-xs text-muted">
                      After {enumLabel(m.milestone).toLowerCase()}
                      {m.nextTask ? ` — ${m.nextTask}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
              {d.followUps.map((t) => (
                <li key={t.id} className="py-2">
                  <Link href={`/cases/${t.caseId}?tab=tasks`} className="hover:underline">
                    <StatusBadge value={t.category} /> {t.title}
                    <span className="block text-xs text-muted">
                      <Ref>{t.case.reference}</Ref> · due <DateText value={t.dueDate} />
                    </span>
                  </Link>
                </li>
              ))}
            </ListCard>
          </div>
        </Tabs.Content>

        <Tabs.Content value="admin" className="space-y-5 pt-4">
          <ListCard title="Bulk-upload failures (last 30 days)" id="import-failures" empty={!d.importFailures.length}>
            {d.importFailures.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/admin/data?batch=${b.id}`} className="hover:underline">
                  <Ref className="text-xs">{b.reference}</Ref> {b.entityType}
                </Link>
                <span className="text-xs">
                  <StatusBadge value={b.status} /> {b.failedRows} failed · {b.invalidRows} invalid
                </span>
              </li>
            ))}
          </ListCard>
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartWithTable id="admin-status" title="Cases by status" rows={d.casesByStatus.map((x) => ({ name: enumLabel(x.status), value: x.count }))} />
            <ChartWithTable id="admin-aging" title="Case aging (open cases)" rows={d.aging.map((a) => ({ name: a.bucket, value: a.count }))} />
          </div>
        </Tabs.Content>
      </Tabs.Root>

      <MetricDrawer metric={metric} onClose={() => setMetric(null)} />
    </div>
  );
}
