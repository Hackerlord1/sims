"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AsyncSelect } from "@/components/resources/async-select";
import type { GraphEdge, GraphNode } from "@/components/statements/network-graph";
import { Badge } from "@/components/ui/badge";
import { Card, Money, PageHeader, ScrollRegion } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { KpiCard } from "@/components/ui/kpi";
import { EmptyState, ErrorState, LeadNotice, LoadingRows } from "@/components/ui/states";
import { apiGet, errorMessage } from "@/lib/api-client";
import { money } from "@/lib/money";

const NetworkGraph = dynamic(() => import("@/components/statements/network-graph"), { ssr: false, loading: () => <LoadingRows rows={6} label="Loading network" /> });
const TimelineChart = dynamic(() => import("@/components/statements/timeline-chart"), { ssr: false, loading: () => <LoadingRows rows={4} label="Loading chart" /> });

interface Movement {
  notice: string;
  transactionCount: number;
  totals: { inflow: string; outflow: string };
  nodes: GraphNode[];
  edges: GraphEdge[];
  matrix: { counterparties: string[]; rows: { owner: string; ownerId: string; cells: { counterparty: string; out: string; in: string }[] }[] };
  timeline: { date: string; inflow: string; outflow: string; count: number }[];
  counterparties: { key: string; label: string; inflow: string; outflow: string; count: number; flagged: number; known: boolean }[];
}

export function MoneyMovement({ initialCaseId }: { initialCaseId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [caseId, setCaseId] = useState<string | null>(initialCaseId ?? null);
  const [minAmount, setMinAmount] = useState("");
  const [showGraph, setShowGraph] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["money-movement", caseId, minAmount],
    queryFn: ({ signal }) => apiGet<Movement>(`/cases/${caseId}/money-movement`, { minAmount: /^\d+(\.\d{1,2})?$/.test(minAmount) ? minAmount : undefined }, signal),
    enabled: Boolean(caseId),
  });
  const m = data?.data;
  const names = useMemo(() => new Map((m?.nodes ?? []).map((n) => [n.id, n.label])), [m]);
  const edges = useMemo(() => (m?.edges ?? []).filter((e) => !selected || e.from === selected || e.to === selected).sort((a, b) => money(b.total).comparedTo(a.total)), [m, selected]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Money-movement analysis"
        description="Flows between statement owners and counterparties across every statement in a case. Computed on the server; the browser only draws the results."
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-md">
          <Field id="mm-case" label="Case">
            <AsyncSelect
              id="mm-case"
              path="/options/records/cases"
              value={caseId}
              onChange={(v) => {
                setCaseId(v);
                setSelected(null);
                router.replace(v ? `${pathname}?caseId=${v}` : pathname, { scroll: false });
              }}
            />
          </Field>
        </div>
        <Field id="mm-min" label="Minimum amount">
          <Input id="mm-min" inputMode="decimal" className="ref w-40" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="e.g. 5000" />
        </Field>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={showGraph} onChange={(e) => setShowGraph(e.target.checked)} /> Show network graph
        </label>
      </div>
      <LeadNotice />
      {!caseId ? (
        <EmptyState title="Choose a case" description="Select a case with uploaded bank or M-Pesa statements." />
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isLoading || !m ? (
        <LoadingRows rows={8} label="Analysing money movement" />
      ) : m.transactionCount === 0 ? (
        <EmptyState title="No parsed transactions" description="Upload statements for this case and wait for parsing to finish." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard index={0} label="Transactions analysed" value={m.transactionCount.toLocaleString("en-KE")} />
            <KpiCard index={1} label="Money in" tone="success" value={<Money value={m.totals.inflow} />} />
            <KpiCard index={2} label="Money out" tone="warning" value={<Money value={m.totals.outflow} />} />
          </div>
          {showGraph ? (
            <Card
              title="Money-movement network"
              depth
              actions={
                selected ? (
                  <button type="button" className="text-xs text-accent underline" onClick={() => setSelected(null)}>
                    Clear selection ({names.get(selected)})
                  </button>
                ) : (
                  <span className="text-xs text-muted">Select a node to filter the flow table</span>
                )
              }
            >
              <NetworkGraph nodes={m.nodes} edges={m.edges} onSelect={setSelected} />
            </Card>
          ) : null}
          <Card title={`Flows${selected ? ` involving ${names.get(selected)}` : ""} (table)`}>
            <ScrollRegion className="max-h-96 overflow-auto" label="Aggregated money flows between parties">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">Aggregated money flows between parties</caption>
                <thead className="sticky top-0 bg-surface text-xs text-muted">
                  <tr>
                    <th scope="col" className="py-1.5 text-left">
                      From
                    </th>
                    <th scope="col" className="py-1.5 text-left">
                      To
                    </th>
                    <th scope="col" className="py-1.5 text-right">
                      Total
                    </th>
                    <th scope="col" className="py-1.5 text-right">
                      Transactions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {edges.map((e, i) => (
                    <tr key={i}>
                      <td className="py-1.5">{names.get(e.from)}</td>
                      <td className="py-1.5">{names.get(e.to)}</td>
                      <td className="py-1.5 text-right">
                        <Money value={e.total} />
                      </td>
                      <td className="tabular py-1.5 text-right">{e.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </Card>
          <Card title="Transfer matrix (top counterparties)">
            <ScrollRegion className="overflow-x-auto" label="Money out and in between each statement owner and the top counterparties">
              <table className="text-xs">
                <caption className="sr-only">Money out and in between each statement owner and the top counterparties</caption>
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 bg-surface p-2 text-left">
                      Owner
                    </th>
                    {m.matrix.counterparties.map((c) => (
                      <th key={c} scope="col" className="max-w-32 p-2 text-left font-semibold" title={c}>
                        <span className="block max-w-32 truncate">{c}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {m.matrix.rows.map((r) => (
                    <tr key={r.ownerId}>
                      <th scope="row" className="sticky left-0 bg-surface p-2 text-left font-semibold">
                        {r.owner}
                      </th>
                      {r.cells.map((c) => (
                        <td key={c.counterparty} className="p-2 align-top whitespace-nowrap">
                          {c.out !== "0.00" ? (
                            <span className="block">
                              Out <Money value={c.out} currency={null} />
                            </span>
                          ) : null}
                          {c.in !== "0.00" ? (
                            <span className="block">
                              In <Money value={c.in} currency={null} />
                            </span>
                          ) : null}
                          {c.out === "0.00" && c.in === "0.00" ? <span className="text-muted">—</span> : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </Card>
          <Card title="Transaction timeline">
            {showGraph ? <TimelineChart data={m.timeline} /> : null}
            <details className="mt-3" open={!showGraph}>
              <summary className="cursor-pointer text-sm font-medium">Timeline table</summary>
              <ScrollRegion className="mt-2 max-h-80 overflow-auto" label="Daily money in and out">
                <table className="w-full text-sm">
                  <caption className="sr-only">Daily money in and out</caption>
                  <thead className="text-xs text-muted">
                    <tr>
                      <th scope="col" className="text-left">
                        Date
                      </th>
                      <th scope="col" className="text-right">
                        Money in
                      </th>
                      <th scope="col" className="text-right">
                        Money out
                      </th>
                      <th scope="col" className="text-right">
                        Transactions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {m.timeline.map((d) => (
                      <tr key={d.date}>
                        <td className="py-1">{d.date}</td>
                        <td className="py-1 text-right">
                          <Money value={d.inflow} currency={null} />
                        </td>
                        <td className="py-1 text-right">
                          <Money value={d.outflow} currency={null} />
                        </td>
                        <td className="tabular py-1 text-right">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            </details>
          </Card>
          <Card title="Counterparty summary">
            <ScrollRegion className="max-h-96 overflow-auto" label="Totals per counterparty">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">Totals per counterparty</caption>
                <thead className="sticky top-0 bg-surface text-xs text-muted">
                  <tr>
                    <th scope="col" className="py-1.5 text-left">
                      Counterparty
                    </th>
                    <th scope="col" className="py-1.5 text-right">
                      Money in
                    </th>
                    <th scope="col" className="py-1.5 text-right">
                      Money out
                    </th>
                    <th scope="col" className="py-1.5 text-right">
                      Transactions
                    </th>
                    <th scope="col" className="py-1.5 text-right">
                      Flagged
                    </th>
                    <th scope="col" className="py-1.5 text-left">
                      Identified
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {m.counterparties.map((c) => (
                    <tr key={c.key}>
                      <td className="py-1.5">{c.label}</td>
                      <td className="py-1.5 text-right">
                        <Money value={c.inflow} currency={null} />
                      </td>
                      <td className="py-1.5 text-right">
                        <Money value={c.outflow} currency={null} />
                      </td>
                      <td className="tabular py-1.5 text-right">{c.count}</td>
                      <td className="tabular py-1.5 text-right">{c.flagged}</td>
                      <td className="py-1.5">{c.known ? <Badge tone="success">Known party</Badge> : <Badge tone="neutral">Unknown</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </Card>
        </>
      )}
    </div>
  );
}
