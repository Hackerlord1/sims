"use client";

import { AlertTriangle, Banknote, Coins, Gauge, Percent, Scale, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { CaseTeam } from "@/components/cases/case-team";
import type { CaseSummary } from "@/components/cases/types";
import { StatusBadge } from "@/components/ui/badge";
import { Card, DateText, DescriptionList, Money, ScrollRegion } from "@/components/ui/display";
import { KpiCard } from "@/components/ui/kpi";
import { enumLabel } from "@/lib/enums";
import { formatPercent, money } from "@/lib/money";

export function CaseOverview({ summary, onChanged }: { summary: CaseSummary; onChanged: () => void }) {
  const c = summary.case;
  const f = summary.financials;
  const cur = c.currency;
  const pct = (v: string | null) => formatPercent(v === null ? null : money(v));

  const exposure: [string, string][] = [
    ["Gross amount under investigation", f.grossAmount],
    ["Amount demanded", f.amountDemanded],
    ["Amount disputed", f.amountDisputed],
    ["Amount acknowledged", f.amountAcknowledged],
    ["Confirmed recoverable", f.amountConfirmedRecoverable],
    ["Amount recovered (verified)", f.amountRecovered],
    ["Amount written off", f.amountWrittenOff],
    ["Remaining exposure", f.remainingExposure],
    ["Unsupported invoice value", f.unsupportedInvoiceValue],
    ["Bad-cheque value", f.badChequeValue],
  ];
  const costs: [string, string][] = [
    ["Investigation expenses", f.investigationExpenses],
    ["Criminal-action expenses", f.criminalExpenses],
    ["Civil-action expenses", f.civilExpenses],
    ["Recovery and enforcement expenses", f.recoveryExpenses],
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard index={0} label="Confirmed recoverable" icon={Scale} value={<Money value={f.amountConfirmedRecoverable} currency={cur} />} />
        <KpiCard index={1} label="Gross recovery" icon={TrendingUp} tone="success" value={<Money value={f.amountRecovered} currency={cur} />} hint={`Recovery rate: ${pct(f.recoveryRate)}`} />
        <KpiCard
          index={2}
          label="Total investigation cost"
          icon={Wallet}
          tone="warning"
          value={<Money value={f.totalCosts} currency={cur} />}
          hint={`Cost-to-recovery: ${pct(f.costToRecoveryRatio)}`}
        />
        <KpiCard
          index={3}
          label="Net recovery"
          icon={money(f.netRecovery).isNegative() ? TrendingDown : Coins}
          tone={money(f.netRecovery).isNegative() ? "danger" : "accent"}
          value={<Money value={f.netRecovery} currency={cur} />}
          hint="Gross recovery − total investigation cost"
        />
      </div>

      {f.overRecovered ? (
        <p className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden /> Recoveries and write-offs exceed the confirmed recoverable amount. Reconcile the exposure figures.
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Financial exposure" className="xl:col-span-2" id="exposure">
          <table className="w-full text-sm">
            <caption className="sr-only">Financial exposure for this case</caption>
            <tbody className="divide-y divide-border">
              {exposure.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted">
                    {label}
                  </th>
                  <td className="py-1.5 text-right">
                    <Money value={value} currency={cur} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Costs and ratios" id="costs">
          <table className="w-full text-sm">
            <caption className="sr-only">Investigation costs</caption>
            <tbody className="divide-y divide-border">
              {costs.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted">
                    {label}
                  </th>
                  <td className="py-1.5 text-right">
                    <Money value={value} currency={cur} />
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="py-1.5 pr-3 text-left font-semibold">
                  Total investigation cost
                </th>
                <td className="py-1.5 text-right">
                  <Money value={f.totalCosts} currency={cur} emphasise />
                </td>
              </tr>
              <tr>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted">
                  <Percent className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  Recovery rate
                </th>
                <td className="tabular py-1.5 text-right">{pct(f.recoveryRate)}</td>
              </tr>
              <tr>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted">
                  <Gauge className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  Cost-to-recovery ratio
                </th>
                <td className="tabular py-1.5 text-right">{pct(f.costToRecoveryRatio)}</td>
              </tr>
              <tr>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted">
                  <Banknote className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  Outstanding principal
                </th>
                <td className="py-1.5 text-right">
                  <Money value={f.outstandingPrincipal} currency={cur} />
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Case file" className="xl:col-span-2" id="casefile">
          <DescriptionList
            items={[
              { label: "Category", value: enumLabel(c.category) },
              { label: "Investigation stage", value: <StatusBadge value={c.stage} /> },
              { label: "Financial risk", value: <StatusBadge value={c.financialRisk} /> },
              { label: "Referral source", value: c.referralSource },
              { label: "Business unit", value: c.businessUnit },
              { label: "Date opened", value: <DateText value={c.openedAt} /> },
              { label: "Incident date", value: <DateText value={c.incidentDate} /> },
              {
                label: "Incident period",
                value:
                  c.incidentPeriodFrom || c.incidentPeriodTo ? (
                    <>
                      <DateText value={c.incidentPeriodFrom} /> – <DateText value={c.incidentPeriodTo} />
                    </>
                  ) : null,
              },
              { label: "Target closure date", value: <DateText value={c.targetClosureDate} /> },
              { label: "Last activity", value: <DateText value={c.lastActivityAt} withTime /> },
              { label: "Supervising manager", value: c.supervisingManager?.fullName },
              { label: "Open / overdue tasks", value: `${summary.counts.openTasks} open · ${summary.counts.overdueTasks} overdue` },
              { label: "Allegation summary", value: c.allegationSummary, wide: true },
              { label: "Description", value: c.description, wide: true },
            ]}
          />
        </Card>
        <CaseTeam caseId={c.id} closed={c.status === "CLOSED"} onChanged={onChanged} />
      </div>

      <Card title="Budget versus actual" id="budget">
        <ScrollRegion className="overflow-x-auto" label="Approved budget against actual expenses by pathway">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Approved budget against actual expenses by pathway</caption>
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-1.5 text-left font-semibold">
                  Pathway
                </th>
                <th scope="col" className="py-1.5 text-right font-semibold">
                  Approved budget
                </th>
                <th scope="col" className="py-1.5 text-right font-semibold">
                  Actual
                </th>
                <th scope="col" className="py-1.5 text-right font-semibold">
                  Variance
                </th>
                <th scope="col" className="py-1.5 text-right font-semibold">
                  Utilisation
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.budget.lines.map((l) => (
                <tr key={l.pathway}>
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {enumLabel(l.pathway)}
                  </th>
                  <td className="py-1.5 text-right">
                    <Money value={l.approved} currency={cur} />
                  </td>
                  <td className="py-1.5 text-right">
                    <Money value={l.actual} currency={cur} />
                  </td>
                  <td className="py-1.5 text-right">
                    <Money value={l.variance} currency={cur} />
                    {l.overBudget ? <span className="ml-1 text-xs font-semibold text-danger">Over budget</span> : null}
                  </td>
                  <td className="tabular py-1.5 text-right">{pct(l.utilisation)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <th scope="row" className="py-1.5 text-left">
                  Total
                </th>
                <td className="py-1.5 text-right">
                  <Money value={summary.budget.total.approved} currency={cur} />
                </td>
                <td className="py-1.5 text-right">
                  <Money value={summary.budget.total.actual} currency={cur} />
                </td>
                <td className="py-1.5 text-right">
                  <Money value={summary.budget.total.variance} currency={cur} />
                </td>
                <td className="tabular py-1.5 text-right">{pct(summary.budget.total.utilisation)}</td>
              </tr>
            </tbody>
          </table>
        </ScrollRegion>
      </Card>
    </div>
  );
}
