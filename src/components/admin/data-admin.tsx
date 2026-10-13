"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DropZone, UploadProgress } from "@/components/evidence/upload-evidence";
import { AsyncSelect } from "@/components/resources/async-select";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DateText, PageHeader, Ref, ScrollRegion } from "@/components/ui/display";
import { Field, FormAlert, Select } from "@/components/ui/field";
import { KpiCard } from "@/components/ui/kpi";
import { EmptyState, LoadingRows } from "@/components/ui/states";
import { apiGet, apiPost, downloadFromApi, errorMessage, uploadWithProgress } from "@/lib/api-client";
import { enumLabel, enumOptions } from "@/lib/enums";
import { FILE_IMPORTS, IGNORE, IMPORTABLE, type TemplateColumn } from "@/lib/imports";
import { getResource } from "@/lib/resources/registry";

interface Batch {
  id: string;
  reference: string;
  entityType: string;
  fileName: string;
  mode: string;
  duplicateStrategy: string;
  mapping: Record<string, string>;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
  updatedRows: number;
  skippedRows: number;
  failedRows: number;
  message: string | null;
  createdAt: string;
  completedAt: string | null;
}
interface ImportRowView {
  id: string;
  rowNumber: number;
  status: string;
  errors: string[];
  duplicateOfId: string | null;
  data: Record<string, unknown>;
}
interface Detail {
  batch: Batch;
  preview: ImportRowView[];
  columns: TemplateColumn[];
  resourceLabel: string;
  idempotentReplay?: boolean;
}

const DUPLICATE_HELP: Record<string, string> = {
  SKIP: "Leave the existing record and skip the duplicate row.",
  UPDATE_EXISTING: "Update the existing record with the values in the file.",
  CREATE_NEW_VERSION: "Move the existing record to the Recycle Bin and import the new one.",
  IMPORT_SEPARATELY: "Import the row as a separate record, keeping both.",
  STOP_ENTIRE_BATCH: "Import nothing if any duplicate is found.",
};

export function DataAdmin({ initialBatch }: { initialBatch?: string }) {
  const qc = useQueryClient();
  const [resource, setResource] = useState<string>("invoices");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [mode, setMode] = useState("ATOMIC");
  const [strategy, setStrategy] = useState("SKIP");
  const [file, setFile] = useState<File | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(initialBatch ?? null);
  const [mapping, setMapping] = useState<Record<string, string> | null>(null);
  const [rowStatus, setRowStatus] = useState("");
  const [rowPage, setRowPage] = useState(1);
  const [committing, setCommitting] = useState(false);
  const fileImport = FILE_IMPORTS.has(resource);

  const detail = useQuery({
    queryKey: ["import", batchId],
    queryFn: ({ signal }) => apiGet<Detail>(`/imports/${batchId}`, undefined, signal),
    enabled: Boolean(batchId),
    refetchInterval: (q) => (["QUEUED", "IMPORTING"].includes(q.state.data?.data.batch.status ?? "") ? 1500 : false),
  });
  const rows = useQuery({
    queryKey: ["import-rows", batchId, rowStatus, rowPage],
    queryFn: ({ signal }) => apiGet<ImportRowView[]>(`/imports/${batchId}/rows`, { status: rowStatus || undefined, page: rowPage, pageSize: 50 }, signal),
    enabled: Boolean(batchId),
    placeholderData: keepPreviousData,
  });
  const history = useQuery({ queryKey: ["imports"], queryFn: ({ signal }) => apiGet<(Batch & { createdBy: string; resourceLabel: string })[]>("/imports", { pageSize: 20 }, signal) });
  const b = detail.data?.data.batch;

  useEffect(() => {
    if (b && ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "ROLLED_BACK"].includes(b.status)) {
      void qc.invalidateQueries({ queryKey: ["imports"] });
      void qc.invalidateQueries({ queryKey: ["import-rows", batchId] });
    }
  }, [b, b?.status, batchId, qc]);

  const validate = async (withMapping?: Record<string, string>) => {
    setError(null);
    if (!file) return setError("Choose a file.");
    const form = new FormData();
    form.set("file", file);
    form.set("resource", resource);
    if (caseId) form.set("caseId", caseId);
    form.set("mode", mode);
    form.set("duplicateStrategy", strategy);
    if (withMapping) form.set("mapping", JSON.stringify(withMapping));
    setPercent(0);
    try {
      const res = await uploadWithProgress<Detail>("/imports/validate", form, setPercent);
      setBatchId(res.data.batch.id);
      setMapping(res.data.batch.mapping);
      setRowPage(1);
      toast.success(res.data.idempotentReplay ? `This file was already validated as ${res.data.batch.reference}.` : `Validated as batch ${res.data.batch.reference}. Review before importing.`);
      await qc.invalidateQueries({ queryKey: ["imports"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPercent(null);
    }
  };

  const commit = async () => {
    if (!b) return;
    setCommitting(true);
    try {
      const res = await apiPost<{ status?: string; importedRows?: number; message?: string | null; pendingApproval?: boolean }>(`/imports/${b.id}/commit`);
      if (res.data.pendingApproval) toast.success("Submitted for approval", { description: res.data.message ?? undefined });
      else if (res.data.status === "QUEUED") toast.info("Large batch queued. Progress updates automatically.");
      else if (res.data.status === "ROLLED_BACK") toast.error(`Import rolled back: ${res.data.message}`);
      else toast.success(`Import ${enumLabel(res.data.status).toLowerCase()}.`);
      await qc.invalidateQueries({ queryKey: ["change-requests"] });
      await detail.refetch();
      await rows.refetch();
      await qc.invalidateQueries({ queryKey: ["imports"] });
      await qc.invalidateQueries({ queryKey: ["list"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCommitting(false);
    }
  };

  const columns = detail.data?.data.columns ?? [];
  const headers = useMemo(() => Object.keys(mapping ?? b?.mapping ?? {}), [mapping, b]);
  const committed = b && !["VALIDATED", "ROLLED_BACK"].includes(b.status);
  const commitBlocked = b ? (b.mode === "ATOMIC" && b.invalidRows > 0) || (b.duplicateStrategy === "STOP_ENTIRE_BATCH" && b.duplicateRows > 0) || b.validRows + b.duplicateRows === 0 : true;

  return (
    <>
      <PageHeader
        title="Data Administration Centre"
        description="Bulk upload records with templates, column mapping, validation, duplicate handling and a preview before anything is imported. Every batch is recorded, idempotent and auditable."
      />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="1. Upload a file" id="upload">
          <div className="space-y-3">
            {error ? <FormAlert>{error}</FormAlert> : null}
            <Field id="imp-resource" label="Record type" required>
              <Select
                id="imp-resource"
                value={resource}
                onChange={(e) => {
                  setResource(e.target.value);
                  setBatchId(null);
                  setMapping(null);
                }}
              >
                {IMPORTABLE.map((k) => (
                  <option key={k} value={k}>
                    {getResource(k)!.plural}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-muted">Templates:</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-accent underline"
                onClick={() => downloadFromApi(`/imports/templates/${resource}`, { query: { format: "xlsx" }, fallbackName: `${resource}-template.xlsx` }).catch((e) => toast.error(errorMessage(e)))}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Excel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-accent underline"
                onClick={() => downloadFromApi(`/imports/templates/${resource}`, { query: { format: "csv" }, fallbackName: `${resource}-template.csv` }).catch((e) => toast.error(errorMessage(e)))}
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> CSV
              </button>
            </div>
            {fileImport ? (
              <p className="text-xs text-muted">
                Upload a ZIP of files with an optional manifest (CSV/XLSX) naming each file.{resource === "evidence" ? " A single PDF, DOCX or image is also accepted." : ""} Without a manifest, choose
                the case below.
              </p>
            ) : null}
            <Field id="imp-case" label="Default case (for rows without a case reference)">
              <AsyncSelect id="imp-case" path="/options/records/cases" value={caseId} onChange={setCaseId} />
            </Field>
            <Field id="imp-mode" label="Import mode">
              <Select id="imp-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="ATOMIC">Atomic — all rows or nothing (rolls back on any failure)</option>
                <option value="PARTIAL">Partial — import valid rows, report the rest</option>
              </Select>
            </Field>
            <Field id="imp-dup" label="Duplicates" hint={DUPLICATE_HELP[strategy]}>
              <Select id="imp-dup" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                {enumOptions("DuplicateStrategy").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <DropZone file={file} onFile={setFile} accept={fileImport ? (resource === "evidence" ? ".zip,.pdf,.docx,.png,.jpg,.jpeg" : ".zip") : ".csv,.xlsx,.zip"} />
            <UploadProgress percent={percent} />
            <Button onClick={() => validate()} loading={percent !== null}>
              <Upload className="h-4 w-4" aria-hidden /> Validate file
            </Button>
          </div>
        </Card>

        <div className="space-y-5 xl:col-span-2">
          {!batchId ? (
            <Card title="2. Review and import">
              <EmptyState title="No batch selected" description="Validate a file, or open a batch from the import history below." />
            </Card>
          ) : !b ? (
            <LoadingRows />
          ) : (
            <>
              <Card
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    2. Review batch <Ref>{b.reference}</Ref> <StatusBadge value={b.status} />
                  </span>
                }
                actions={
                  <span className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => downloadFromApi(`/imports/${b.id}/errors`, { fallbackName: `${b.reference}-errors.csv` }).catch((e) => toast.error(errorMessage(e)))}
                    >
                      <Download className="h-4 w-4" aria-hidden /> Error report
                    </Button>
                    {b.status === "VALIDATED" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await apiPost(`/imports/${b.id}/cancel`);
                            await detail.refetch();
                            await qc.invalidateQueries({ queryKey: ["imports"] });
                          } catch (e) {
                            toast.error(errorMessage(e));
                          }
                        }}
                      >
                        Cancel batch
                      </Button>
                    ) : null}
                    {!committed ? (
                      <Button size="sm" onClick={commit} loading={committing} disabled={commitBlocked}>
                        <CheckCircle2 className="h-4 w-4" aria-hidden /> Import {b.validRows + (b.duplicateStrategy === "SKIP" ? 0 : b.duplicateRows)} row(s)
                      </Button>
                    ) : null}
                  </span>
                }
              >
                <p className="mb-3 text-sm text-muted">
                  {b.fileName} · {getResource(b.entityType)?.plural} · {enumLabel(b.mode)} · duplicates: {enumLabel(b.duplicateStrategy).toLowerCase()} · <DateText value={b.createdAt} withTime />
                </p>
                <div className="grid gap-3 sm:grid-cols-4">
                  <KpiCard label="Rows" value={b.totalRows} />
                  <KpiCard label="Valid" tone="success" value={b.validRows} />
                  <KpiCard label="Invalid" tone={b.invalidRows ? "danger" : "default"} value={b.invalidRows} />
                  <KpiCard label="Duplicates" tone={b.duplicateRows ? "warning" : "default"} value={b.duplicateRows} />
                </div>
                {b.mode === "ATOMIC" && b.invalidRows > 0 && !committed ? (
                  <FormAlert tone="warning">Atomic imports need every row to be valid. Fix the file, or re-validate in partial mode.</FormAlert>
                ) : null}
                {b.duplicateStrategy === "STOP_ENTIRE_BATCH" && b.duplicateRows > 0 ? (
                  <FormAlert tone="warning">Duplicates were found and the strategy is “stop entire batch”: nothing will be imported.</FormAlert>
                ) : null}
                {b.status === "AWAITING_APPROVAL" ? (
                  <FormAlert tone="info">
                    This record type needs approval. Nothing has been imported yet: the batch starts once an approver accepts it.{" "}
                    <a href="/admin/approvals?mine=1" className="underline">
                      See my submitted changes
                    </a>
                    .
                  </FormAlert>
                ) : null}
                {["QUEUED", "IMPORTING"].includes(b.status) ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-info" role="status">
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> Importing in the background…
                  </p>
                ) : null}
                {committed && !["QUEUED", "IMPORTING", "AWAITING_APPROVAL"].includes(b.status) ? (
                  <div className="mt-3 rounded-md border border-border p-3 text-sm" role="status">
                    <p className="font-semibold">Result: {enumLabel(b.status)}</p>
                    <p>
                      Imported {b.importedRows} · updated {b.updatedRows} · skipped {b.skippedRows} · failed {b.failedRows}
                    </p>
                    {b.message ? <p className="text-danger">{b.message}</p> : null}
                  </div>
                ) : null}
              </Card>

              {!committed && headers.length ? (
                <Card title="Column mapping">
                  <p className="mb-2 text-xs text-muted">Columns were matched automatically. Adjust any mapping and re-validate. Unmapped columns are ignored.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {headers.map((h) => (
                      <label key={h} className="text-xs">
                        <span className="font-medium">{h}</span>
                        <Select className="mt-1 h-9" value={(mapping ?? b.mapping)[h] ?? IGNORE} onChange={(e) => setMapping({ ...(mapping ?? b.mapping), [h]: e.target.value })}>
                          <option value={IGNORE}>— Ignore —</option>
                          {columns.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.header}
                              {c.required ? " *" : ""}
                            </option>
                          ))}
                        </Select>
                      </label>
                    ))}
                  </div>
                  <Button size="sm" variant="secondary" className="mt-3" disabled={!file} onClick={() => validate(mapping ?? b.mapping)}>
                    <RefreshCw className="h-4 w-4" aria-hidden /> Re-validate with this mapping
                  </Button>
                  {!file ? <p className="mt-1 text-xs text-muted">Choose the file again to re-validate.</p> : null}
                </Card>
              ) : null}

              <Card
                title="Rows"
                actions={
                  <Select
                    aria-label="Row status filter"
                    className="h-8 w-44"
                    value={rowStatus}
                    onChange={(e) => {
                      setRowStatus(e.target.value);
                      setRowPage(1);
                    }}
                  >
                    <option value="">All rows</option>
                    {enumOptions("ImportRowStatus").map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                }
              >
                {!rows.data ? (
                  <LoadingRows rows={4} />
                ) : rows.data.data.length === 0 ? (
                  <EmptyState title="No rows" />
                ) : (
                  <ScrollRegion className="max-h-[28rem] overflow-auto" label="Validated rows">
                    <table className="w-full min-w-[640px] text-sm">
                      <caption className="sr-only">Validated rows</caption>
                      <thead className="sticky top-0 bg-surface text-xs text-muted">
                        <tr>
                          <th scope="col" className="py-1.5 text-left">
                            Row
                          </th>
                          <th scope="col" className="py-1.5 text-left">
                            Status
                          </th>
                          <th scope="col" className="py-1.5 text-left">
                            Errors / notes
                          </th>
                          <th scope="col" className="py-1.5 text-left">
                            Values
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.data.data.map((row) => (
                          <tr key={row.id} className="align-top">
                            <td className="tabular py-1.5">{row.rowNumber}</td>
                            <td className="py-1.5">
                              <StatusBadge value={row.status} />
                            </td>
                            <td className="py-1.5 text-xs">
                              {row.errors.length ? (
                                <ul className="space-y-0.5">
                                  {row.errors.map((e, i) => (
                                    <li key={i} className="flex gap-1">
                                      <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-danger" aria-hidden />
                                      {e}
                                    </li>
                                  ))}
                                </ul>
                              ) : row.duplicateOfId ? (
                                <Badge tone="warning">Duplicate of {row.duplicateOfId.startsWith("row:") ? `row ${row.duplicateOfId.slice(4)} in this file` : "an existing record"}</Badge>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="max-w-md py-1.5 text-xs break-words text-muted">
                              {Object.entries(row.data)
                                .filter(([k]) => k !== "caseId")
                                .slice(0, 8)
                                .map(([k, v]) => `${columns.find((c) => c.key === k)?.header ?? k}: ${String(v)}`)
                                .join(" · ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollRegion>
                )}
                {rows.data?.meta && rows.data.meta.totalPages > 1 ? (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <Button size="sm" variant="secondary" disabled={rowPage <= 1} onClick={() => setRowPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <span className="text-muted">
                      Page {rowPage} of {rows.data.meta.totalPages}
                    </span>
                    <Button size="sm" variant="secondary" disabled={rowPage >= rows.data.meta.totalPages} onClick={() => setRowPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                ) : null}
              </Card>
            </>
          )}
        </div>
      </div>

      <Card title="Import history" className="mt-5">
        {!history.data ? (
          <LoadingRows rows={3} />
        ) : history.data.data.length === 0 ? (
          <EmptyState title="No imports yet" />
        ) : (
          <ScrollRegion className="overflow-x-auto" label="Import batches">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Import batches</caption>
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1.5 text-left">
                    Batch
                  </th>
                  <th scope="col" className="py-1.5 text-left">
                    Records
                  </th>
                  <th scope="col" className="py-1.5 text-left">
                    File
                  </th>
                  <th scope="col" className="py-1.5 text-left">
                    Status
                  </th>
                  <th scope="col" className="py-1.5 text-right">
                    Valid / invalid / duplicate
                  </th>
                  <th scope="col" className="py-1.5 text-right">
                    Imported
                  </th>
                  <th scope="col" className="py-1.5 text-left">
                    By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.data.data.map((h) => (
                  <tr
                    key={h.id}
                    className="cursor-pointer hover:bg-surface-2"
                    onClick={() => {
                      setBatchId(h.id);
                      setMapping(null);
                      setRowPage(1);
                    }}
                  >
                    <td className="py-1.5">
                      <button
                        type="button"
                        className="text-accent underline"
                        onClick={() => {
                          setBatchId(h.id);
                          setMapping(null);
                        }}
                      >
                        <Ref>{h.reference}</Ref>
                      </button>
                    </td>
                    <td className="py-1.5">{h.resourceLabel}</td>
                    <td className="max-w-48 truncate py-1.5 text-xs" title={h.fileName}>
                      {h.fileName}
                    </td>
                    <td className="py-1.5">
                      <StatusBadge value={h.status} />
                    </td>
                    <td className="tabular py-1.5 text-right">
                      {h.validRows} / {h.invalidRows} / {h.duplicateRows}
                    </td>
                    <td className="tabular py-1.5 text-right">{h.importedRows + h.updatedRows}</td>
                    <td className="py-1.5 text-xs">
                      {h.createdBy} · <DateText value={h.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </Card>
    </>
  );
}
