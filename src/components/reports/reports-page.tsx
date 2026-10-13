"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BadgeCheck, Download, FileDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AsyncSelect } from "@/components/resources/async-select";
import { useCan, useSession } from "@/components/session-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DateText, PageHeader, Ref, ScrollRegion } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { apiGet, apiPost, downloadFromApi, errorMessage } from "@/lib/api-client";

interface CatalogItem {
  key: string;
  title: string;
  description: string;
  requiresCase: boolean;
  canExport: boolean;
}
interface HistoryRow {
  id: string;
  reference: string;
  title: string;
  format: string;
  rowCount: number;
  createdAt: string;
  generatedBy: string;
  generatedById: string;
  isFinal: boolean;
  approvedBy: string | null;
}

export function ReportsPage() {
  const can = useCan();
  const me = useSession();
  const catalog = useQuery({ queryKey: ["report-catalog"], queryFn: ({ signal }) => apiGet<CatalogItem[]>("/reports/catalog", undefined, signal) });
  const [page, setPage] = useState(1);
  const history = useQuery({ queryKey: ["report-history", page], queryFn: ({ signal }) => apiGet<HistoryRow[]>("/reports", { page, pageSize: 20 }, signal), placeholderData: keepPreviousData });
  const [key, setKey] = useState("");
  const [format, setFormat] = useState("PDF");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = catalog.data?.data.find((c) => c.key === key);

  const generate = async () => {
    if (!key) return toast.error("Choose a report.");
    if (selected?.requiresCase && !caseId) return toast.error("This report needs a case.");
    setBusy(true);
    try {
      await downloadFromApi("/reports/generate", {
        method: "POST",
        body: { key, format, caseId: caseId ?? undefined, from: from || undefined, to: to || undefined },
        fallbackName: `${key}.${format.toLowerCase()}`,
      });
      toast.success("Report generated.");
      await history.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Reports and exports" description="Generate any report as PDF, Word, Excel or CSV. Every generated file is kept in the history and every export is audited." />
      {catalog.isError ? (
        <ErrorState message={errorMessage(catalog.error)} onRetry={() => catalog.refetch()} />
      ) : !catalog.data ? (
        <LoadingRows />
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          <Card title="Generate a report">
            <div className="space-y-3">
              <Field id="rep-key" label="Report" required>
                <Select id="rep-key" value={key} onChange={(e) => setKey(e.target.value)}>
                  <option value="">Choose a report…</option>
                  {catalog.data.data.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              </Field>
              {selected ? <p className="text-xs text-muted">{selected.description}</p> : null}
              <Field id="rep-case" label={selected?.requiresCase ? "Case" : "Case (optional)"} required={selected?.requiresCase}>
                <AsyncSelect id="rep-case" path="/options/records/cases" value={caseId} onChange={setCaseId} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field id="rep-from" label="From">
                  <Input id="rep-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </Field>
                <Field id="rep-to" label="To">
                  <Input id="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </Field>
              </div>
              <Field id="rep-format" label="Format">
                <Select id="rep-format" value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="PDF">PDF</option>
                  <option value="DOCX">Word (.docx)</option>
                  <option value="XLSX">Excel (.xlsx)</option>
                  <option value="CSV">CSV</option>
                </Select>
              </Field>
              <Button onClick={generate} loading={busy} disabled={!can("REPORTS", "EXPORT")}>
                <FileDown className="h-4 w-4" aria-hidden /> Generate and download
              </Button>
              {!can("REPORTS", "EXPORT") ? <p className="text-xs text-muted">Your role can view reports but not export them.</p> : null}
            </div>
          </Card>
          <Card title="Available reports" className="xl:col-span-2">
            <ul className="grid gap-2 sm:grid-cols-2">
              {catalog.data.data.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-border p-3 text-left hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-accent-soft"
                    aria-pressed={key === c.key}
                    onClick={() => setKey(c.key)}
                  >
                    <span className="block text-sm font-semibold">{c.title}</span>
                    <span className="block text-xs text-muted">{c.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      <Card title="Report history" className="mt-5">
        {!history.data ? (
          <LoadingRows rows={3} />
        ) : history.data.data.length === 0 ? (
          <EmptyState title="No reports generated yet" />
        ) : (
          <ScrollRegion className="overflow-x-auto" label="Generated reports">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Generated reports</caption>
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1.5 text-left">
                    Reference
                  </th>
                  <th scope="col" className="py-1.5 text-left">
                    Report
                  </th>
                  <th scope="col" className="py-1.5 text-left">
                    Format
                  </th>
                  <th scope="col" className="py-1.5 text-right">
                    Rows
                  </th>
                  <th scope="col" className="py-1.5 text-left">
                    Generated
                  </th>
                  <th scope="col" className="py-1.5 text-left">
                    Final
                  </th>
                  <th scope="col" className="py-1.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.data.data.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5">
                      <Ref className="text-xs">{r.reference}</Ref>
                    </td>
                    <td className="py-1.5">{r.title}</td>
                    <td className="py-1.5">{r.format}</td>
                    <td className="tabular py-1.5 text-right">{r.rowCount}</td>
                    <td className="py-1.5 text-xs">
                      <DateText value={r.createdAt} withTime /> · {r.generatedBy}
                    </td>
                    <td className="py-1.5">
                      {r.isFinal ? (
                        <Badge tone="success" icon={BadgeCheck}>
                          Approved final{r.approvedBy ? ` · ${r.approvedBy}` : ""}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Download ${r.reference}`}
                        onClick={() => downloadFromApi(`/reports/${r.id}/download`, { fallbackName: r.reference }).catch((e) => toast.error(errorMessage(e)))}
                      >
                        <Download className="h-4 w-4" aria-hidden />
                      </Button>
                      {!r.isFinal && can("DECISIONS", "APPROVE") && r.generatedById !== me.id ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            try {
                              await apiPost(`/reports/${r.id}/approve-final`);
                              toast.success("Approved as final. The report is now protected.");
                              await history.refetch();
                            } catch (e) {
                              toast.error(errorMessage(e));
                            }
                          }}
                        >
                          Approve as final
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.data.meta && history.data.meta.totalPages > 1 ? (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="secondary" disabled={page >= history.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            ) : null}
          </ScrollRegion>
        )}
      </Card>
    </>
  );
}
