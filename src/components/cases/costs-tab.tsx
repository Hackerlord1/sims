"use client";

import type { CaseSummary } from "@/components/cases/types";
import { ResourceTable } from "@/components/resources/resource-table";
import { useCan } from "@/components/session-context";
import { Money } from "@/components/ui/display";
import { formatPercent, money } from "@/lib/money";

export function CostsTab({ caseId, summary }: { caseId: string; summary: CaseSummary }) {
  const can = useCan();
  const t = summary.budget.total;
  const cur = summary.case.currency;
  return (
    <div className="space-y-5">
      <dl className="depth grid gap-3 rounded-xl border border-border bg-surface p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Approved budget</dt>
          <dd className="mt-0.5 font-semibold">
            <Money value={t.approved} currency={cur} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Actual expenses</dt>
          <dd className="mt-0.5 font-semibold">
            <Money value={t.actual} currency={cur} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Budget variance</dt>
          <dd className="mt-0.5 font-semibold">
            <Money value={t.variance} currency={cur} /> {t.overBudget ? <span className="text-xs text-danger">(over budget)</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Budget utilisation</dt>
          <dd className="tabular mt-0.5 font-semibold">{formatPercent(t.utilisation === null ? null : money(t.utilisation))}</dd>
        </div>
      </dl>
      {can("EXPENSES", "VIEW") ? <ResourceTable resource="expenses" caseId={caseId} title="Investigation expenses" /> : null}
      {can("ADVANCES", "VIEW") ? <ResourceTable resource="advances" caseId={caseId} title="Advances and imprests" /> : null}
      {can("BUDGETS", "VIEW") ? <ResourceTable resource="budgets" caseId={caseId} title="Budget lines" /> : null}
    </div>
  );
}
