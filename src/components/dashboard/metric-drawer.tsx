"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { DateText, Money, Ref, ScrollRegion } from "@/components/ui/display";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { apiGet, errorMessage } from "@/lib/api-client";
import { METRIC_INFO, type DashboardMetric } from "@/lib/dashboard-metrics";
import { enumLabel } from "@/lib/enums";
import { sum, toDbString } from "@/lib/money";

interface MetricRow {
  id: string;
  href: string;
  reference: string | null;
  title: string;
  subtitle: string | null;
  status: string | null;
  date: string | null;
  amount: string | null;
}
interface MetricResult {
  metric: DashboardMetric;
  total: number;
  rows: MetricRow[];
  dateLabel: string | null;
  amountLabel: string | null;
}

/** The records behind a dashboard figure, in a side panel. Rows open the case they belong to. */
export function MetricDrawer({ metric, onClose }: { metric: DashboardMetric | null; onClose: () => void }) {
  const info = metric ? METRIC_INFO[metric] : null;
  return (
    <Drawer
      open={metric !== null}
      onOpenChange={(o) => !o && onClose()}
      width="xl"
      title={
        <span className="block">
          <span className="eyebrow block text-[0.6rem] font-normal text-muted">Dashboard · records behind the figure</span>
          <span className="mt-1 block font-display text-2xl font-medium">{info?.title}</span>
        </span>
      }
      description={info?.description}
      footer={
        info?.register ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={info.register.href} onClick={onClose}>
              {info.register.label} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        ) : undefined
      }
    >
      {metric ? <MetricBody key={metric} metric={metric} onNavigate={onClose} /> : null}
    </Drawer>
  );
}

function MetricBody({ metric, onNavigate }: { metric: DashboardMetric; onNavigate: () => void }) {
  const [q, setQ] = useState("");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard", "metric", metric],
    queryFn: ({ signal }) => apiGet<MetricResult>(`/dashboard/metrics/${metric}`, undefined, signal),
  });
  const result = data?.data;
  const rows = useMemo(() => {
    const all = result?.rows ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((r) => [r.reference, r.title, r.subtitle, r.status && enumLabel(r.status)].some((v) => v?.toLowerCase().includes(needle)));
  }, [result, q]);

  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (isLoading || !result) return <LoadingRows rows={8} label="Loading records" />;
  if (!result.total) return <EmptyState title="No records" description="Nothing currently counts towards this figure." />;

  const hasAmount = result.amountLabel !== null;
  const shownTotal = hasAmount ? toDbString(sum(rows.map((r) => r.amount ?? "0"))) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-dashed border-border pb-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <dt className="eyebrow text-[0.6rem] text-muted">Records</dt>
            <dd className="kpi-value text-[1.6rem]">{result.total.toLocaleString("en-KE")}</dd>
          </div>
          {hasAmount ? (
            <div>
              <dt className="eyebrow text-[0.6rem] text-muted">{q ? "Total of filtered rows" : result.rows.length < result.total ? `Total of first ${result.rows.length}` : "Total"}</dt>
              <dd className="kpi-value text-[1.6rem]">
                <Money value={shownTotal} />
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="relative w-full sm:w-64">
          <label htmlFor="metric-filter" className="sr-only">
            Filter these records
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="metric-filter"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by reference, title, status…"
            className="h-9 w-full rounded-[5px] border border-border bg-surface pr-3 pl-8 text-sm placeholder:text-muted hover:border-border-strong focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none"
            autoComplete="off"
          />
        </div>
      </div>

      {result.rows.length < result.total ? (
        <p className="text-xs text-muted" role="note">
          Showing the first {result.rows.length} of {result.total.toLocaleString("en-KE")} records. Open the register for the full list.
        </p>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {q ? `${rows.length} matching records` : ""}
      </p>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No records match “{q}”.</p>
      ) : (
        <ScrollRegion label={`${METRIC_INFO[metric].title} records`} className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">{METRIC_INFO[metric].title}</caption>
            <thead>
              <tr className="border-b border-border-strong text-left text-muted">
                <th scope="col" className="py-2 pr-3">
                  Record
                </th>
                <th scope="col" className="py-2 pr-3">
                  Status
                </th>
                {result.dateLabel ? (
                  <th scope="col" className="py-2 pr-3">
                    {result.dateLabel}
                  </th>
                ) : null}
                {hasAmount ? (
                  <th scope="col" className="py-2 text-right">
                    {result.amountLabel}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={r.id} className="group metric-row" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                  <td className="py-2.5 pr-3 align-top">
                    <Link href={r.href} onClick={onNavigate} className="block min-w-0 rounded-sm focus-visible:outline-offset-4">
                      {r.reference ? <Ref className="text-xs text-muted">{r.reference}</Ref> : null}
                      <span className="block font-medium group-hover:underline">{r.title}</span>
                      {r.subtitle ? <span className="block text-xs text-muted">{r.subtitle}</span> : null}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    <StatusBadge value={r.status} />
                  </td>
                  {result.dateLabel ? (
                    <td className="py-2.5 pr-3 align-top text-xs whitespace-nowrap">
                      <DateText value={r.date} />
                    </td>
                  ) : null}
                  {hasAmount ? (
                    <td className="py-2.5 text-right align-top">
                      <Money value={r.amount} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
    </div>
  );
}
