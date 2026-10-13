"use client";

import * as Popover from "@radix-ui/react-popover";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Filter, Plus, Search, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BulkActionBar, BulkResultDialog, type BulkResult } from "@/components/resources/bulk-action-bar";
import { CaseLink, Cell } from "@/components/resources/cells";
import { useDebounced, useResourceList, type Row } from "@/components/resources/hooks";
import { ResourceDrawer } from "@/components/resources/resource-drawer";
import { ResourceForm } from "@/components/resources/resource-form";
import { useRowWindow } from "@/components/resources/use-row-window";
import { useCan } from "@/components/session-context";
import { DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { downloadFromApi, errorMessage, type QueryValue } from "@/lib/api-client";
import { enumOptions } from "@/lib/enums";
import { getResource } from "@/lib/resources/registry";
import { listFields, type FieldDef } from "@/lib/resources/types";
import { cn } from "@/lib/cn";

export type Mode = "active" | "archived" | "deleted";

export interface ResourceTableProps {
  resource: string;
  caseId?: string;
  matterId?: string;
  /** Always-applied filters (not shown in the filter UI). */
  fixedFilters?: Record<string, string>;
  /** Values set on records created from this table (e.g. matterId, linkType, linkId). */
  createFixed?: Record<string, unknown>;
  title?: ReactNode;
  mode?: Mode;
  allowModeSwitch?: boolean;
  allowCreate?: boolean;
  columns?: string[];
  onOpen?: (row: Row) => void;
  emptyText?: string;
  toolbarExtra?: ReactNode;
  defaultPageSize?: number;
}

const PAGE_SIZES = [10, 25, 50, 100, 200];

export function ResourceTable({
  resource: key,
  caseId,
  matterId,
  fixedFilters = {},
  createFixed,
  title,
  mode: initialMode = "active",
  allowModeSwitch = true,
  allowCreate = true,
  columns,
  onOpen,
  emptyText,
  toolbarExtra,
  defaultPageSize = 25,
}: ResourceTableProps) {
  const r = getResource(key)!;
  const can = useCan();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sort, setSort] = useState<string | undefined>();
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const q = useDebounced(search.trim(), 300);

  const fields = useMemo(() => {
    const list = listFields(r);
    return columns ? columns.map((c) => r.fields.find((f) => f.name === c)).filter((f): f is FieldDef => Boolean(f)) : list;
  }, [r, columns]);
  const filterable = useMemo(() => r.fields.filter((f) => f.filterable && f.type === "enum"), [r]);
  const dateField = useMemo(() => r.fields.find((f) => (f.type === "date" || f.type === "datetime") && f.list), [r]);

  const params: Record<string, QueryValue> = {
    page,
    pageSize,
    sort,
    order: sort ? order : undefined,
    q: q || undefined,
    caseId,
    matterId,
    deleted: mode === "deleted" ? "only" : undefined,
    archived: mode === "archived" ? "only" : undefined,
    ...fixedFilters,
    ...filters,
  };
  const { data, isLoading, isError, error, refetch, isFetching } = useResourceList(key, params);
  const rows = useMemo(() => data?.data ?? [], [data]);
  const meta = data?.meta;

  const resetSelection = useCallback(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, []);

  const changeFilter = (name: string, value: string) => {
    setFilters((f) => {
      const next = { ...f };
      if (value) next[name] = value;
      else delete next[name];
      return next;
    });
    setPage(1);
    resetSelection();
  };

  const toggleSort = (f: FieldDef) => {
    if (sort === f.name) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(f.name);
      setOrder("asc");
    }
    setPage(1);
  };

  const pageIds = rows.map((row) => row.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectionCount = allMatching ? (meta?.total ?? 0) : selected.size;
  const canBulk = can(r.module, "ARCHIVE") || can(r.module, "SOFT_DELETE") || can(r.module, "RESTORE") || can(r.module, "EXPORT") || can(r.module, "EDIT");
  const showCreate = allowCreate && mode === "active" && !r.uploadOnly && can(r.module, "CREATE");

  // Large pages are virtualised so the browser renders only visible rows.
  const scrollRef = useRef<HTMLDivElement>(null);
  const { enabled: virtual, visible: visibleRows, padTop, padBottom } = useRowWindow(rows, scrollRef);

  const exportAll = async (format: "csv" | "xlsx") => {
    try {
      await downloadFromApi(`/export/${key}`, {
        method: "POST",
        body: {
          format,
          filter: {
            caseId,
            matterId,
            q: q || undefined,
            filters: { ...fixedFilters, ...filters },
            deleted: mode === "deleted" ? "only" : undefined,
            archived: mode === "archived" ? "only" : undefined,
          },
        },
        fallbackName: `${key}.${format}`,
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const showCase = !caseId && r.key !== "cases";
  const colCount = fields.length + (showCase ? 1 : 0) + (canBulk ? 1 : 0);
  const open = (row: Row) => (onOpen ? onOpen(row) : setOpenId(row.id));

  return (
    <section className="panel rounded-xl border border-border bg-surface shadow-card" aria-label={typeof title === "string" ? title : r.plural}>
      <div className="panel-header flex flex-wrap items-center gap-2 rounded-t-xl border-b border-border p-3">
        {title ? <h2 className="mr-2 text-sm font-semibold">{title}</h2> : null}
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            aria-label={`Search ${r.plural.toLowerCase()}`}
            placeholder="Search…"
            className="h-9 pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              resetSelection();
            }}
          />
        </div>
        {filterable.length || dateField ? (
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="secondary" size="sm">
                <Filter className="h-4 w-4" aria-hidden /> Filters
                {Object.keys(filters).length ? (
                  <span className="rounded-full bg-accent px-1.5 text-[10px] text-accent-contrast shadow-[0_0_10px_var(--glow-color)]">{Object.keys(filters).length}</span>
                ) : null}
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="start" sideOffset={6} className="elevated z-40 w-80 space-y-3 rounded-lg border border-border bg-surface p-3">
                {filterable.map((f) => (
                  <label key={f.name} className="block text-xs font-medium">
                    {f.label}
                    <Select className="mt-1 h-9" value={filters[f.name] ?? ""} onChange={(e) => changeFilter(f.name, e.target.value)}>
                      <option value="">Any</option>
                      {enumOptions(f.enum!).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
                {dateField ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-medium">
                      {dateField.label} from
                      <Input type="date" className="mt-1 h-9" value={filters[`from.${dateField.name}`] ?? ""} onChange={(e) => changeFilter(`from.${dateField.name}`, e.target.value)} />
                    </label>
                    <label className="block text-xs font-medium">
                      to
                      <Input type="date" className="mt-1 h-9" value={filters[`to.${dateField.name}`] ?? ""} onChange={(e) => changeFilter(`to.${dateField.name}`, e.target.value)} />
                    </label>
                  </div>
                ) : null}
                {Object.keys(filters).length ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilters({});
                      setPage(1);
                      resetSelection();
                    }}
                  >
                    <X className="h-4 w-4" aria-hidden /> Clear filters
                  </Button>
                ) : null}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : null}
        {allowModeSwitch && r.softDelete !== false ? (
          <Select
            aria-label="Record view"
            className="h-9 w-auto"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as Mode);
              setPage(1);
              resetSelection();
            }}
          >
            <option value="active">Active records</option>
            <option value="archived">Archived</option>
            {can(r.module, "RESTORE") ? <option value="deleted">Recycle Bin</option> : null}
          </Select>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {toolbarExtra}
          {can(r.module, "EXPORT") ? (
            <Popover.Root>
              <Popover.Trigger asChild>
                <Button variant="secondary" size="sm">
                  <Download className="h-4 w-4" aria-hidden /> Export
                </Button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="end" sideOffset={6} className="elevated z-40 w-56 rounded-lg border border-border bg-surface p-1">
                  <p className="px-2 py-1 text-xs text-muted">All {meta?.total ?? 0} matching records</p>
                  <button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2" onClick={() => exportAll("xlsx")}>
                    Excel (.xlsx)
                  </button>
                  <button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2" onClick={() => exportAll("csv")}>
                    CSV
                  </button>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          ) : null}
          {showCreate ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden /> New {r.label.toLowerCase()}
            </Button>
          ) : null}
        </div>
      </div>

      {canBulk && selectionCount > 0 ? (
        <BulkActionBar
          resource={r}
          mode={mode}
          count={selectionCount}
          ids={allMatching ? undefined : [...selected]}
          filter={
            allMatching
              ? { caseId, matterId, q: q || undefined, filters: { ...fixedFilters, ...filters }, deleted: mode === "deleted" ? "only" : undefined, archived: mode === "archived" ? "only" : undefined }
              : undefined
          }
          onDone={(result) => {
            setBulkResult(result);
            resetSelection();
            void qc.invalidateQueries({ queryKey: ["list"] });
            void qc.invalidateQueries({ queryKey: ["bulk-batches"] });
          }}
          onClear={resetSelection}
        />
      ) : null}
      {canBulk && pageAllSelected && !allMatching && meta && meta.total > rows.length ? (
        <div className="border-b border-border bg-info-soft px-3 py-2 text-sm text-info" role="status">
          All {rows.length} records on this page are selected.{" "}
          <button type="button" className="font-semibold underline" onClick={() => setAllMatching(true)}>
            Select all {meta.total} matching records
          </button>
        </div>
      ) : null}

      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingRows label={`Loading ${r.plural.toLowerCase()}`} />
      ) : (
        <div ref={scrollRef} className={cn("overflow-auto", virtual && "max-h-[70vh]")} aria-busy={isFetching}>
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">
              {r.plural}
              {meta ? `, ${meta.total} records, page ${meta.page} of ${meta.totalPages}` : ""}
            </caption>
            <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted shadow-[inset_0_-1px_0_var(--border)]">
              <tr>
                {canBulk ? (
                  <th scope="col" className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent)]"
                      aria-label="Select all records on this page"
                      checked={pageAllSelected || allMatching}
                      onChange={(e) => {
                        setAllMatching(false);
                        setSelected((s) => {
                          const next = new Set(s);
                          for (const id of pageIds) {
                            if (e.target.checked) next.add(id);
                            else next.delete(id);
                          }
                          return next;
                        });
                      }}
                    />
                  </th>
                ) : null}
                {showCase ? (
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Case
                  </th>
                ) : null}
                {fields.map((f) => {
                  const sortable = f.type !== "computed" && f.type !== "relation" && f.type !== "user";
                  const dir = sort === f.name ? order : undefined;
                  return (
                    <th key={f.name} scope="col" className="px-3 py-2 font-semibold whitespace-nowrap" aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}>
                      {sortable ? (
                        <button type="button" className="inline-flex items-center gap-1 transition-colors hover:text-text" onClick={() => toggleSort(f)}>
                          {f.label}
                          {dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : dir === "desc" ? (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        f.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {padTop > 0 ? (
                <tr aria-hidden>
                  <td colSpan={colCount} style={{ height: padTop }} />
                </tr>
              ) : null}
              {visibleRows.map((row) => (
                <tr key={row.id} className={cn("cursor-pointer focus-within:bg-surface-2 hover:bg-surface-2", (selected.has(row.id) || allMatching) && "bg-accent-soft/50")} onClick={() => open(row)}>
                  {canBulk ? (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
                        aria-label={`Select ${String(row[r.titleField] ?? row.reference ?? "record")}`}
                        checked={allMatching || selected.has(row.id)}
                        onChange={(e) => {
                          setAllMatching(false);
                          setSelected((s) => {
                            const next = new Set(s);
                            if (e.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                  ) : null}
                  {showCase ? (
                    <td className="px-3 py-2">
                      <CaseLink row={row} />
                    </td>
                  ) : null}
                  {fields.map((f, i) => (
                    <td
                      key={f.name}
                      className={cn(
                        "px-3 py-2 align-top",
                        (f.type === "money" || MONEYISH.has(f.name)) && "text-right whitespace-nowrap",
                        (f.name === r.titleField || f.type === "textarea") && "min-w-56",
                      )}
                    >
                      {i === 0 ? (
                        <button
                          type="button"
                          className="text-left font-medium text-text hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(row);
                          }}
                        >
                          <Cell field={f} row={row} />
                          {row.isDemo ? <DemoBadge className="ml-1.5 align-middle" /> : null}
                        </button>
                      ) : (
                        <Cell field={f} row={row} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {padBottom > 0 ? (
                <tr aria-hidden>
                  <td colSpan={colCount} style={{ height: padBottom }} />
                </tr>
              ) : null}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <EmptyState
              title={mode === "deleted" ? "The Recycle Bin is empty" : mode === "archived" ? "No archived records" : (emptyText ?? `No ${r.plural.toLowerCase()} yet`)}
              description={q || Object.keys(filters).length ? "No records match the current search or filters." : undefined}
              action={
                showCreate && !q ? (
                  <Button size="sm" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" aria-hidden /> New {r.label.toLowerCase()}
                  </Button>
                ) : undefined
              }
            />
          ) : null}
        </div>
      )}

      {meta && meta.total > 0 ? (
        <nav className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm" aria-label="Pagination">
          <p className="text-muted" aria-live="polite">
            {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
          </p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Rows
              <Select
                className="h-8 w-auto"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </label>
            <Button variant="secondary" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={meta.page <= 1} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <span className="text-xs text-muted">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button variant="secondary" size="icon" onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={meta.page >= meta.totalPages} aria-label="Next page">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </nav>
      ) : null}

      <ResourceDrawer resource={key} id={openId} onClose={() => setOpenId(null)} caseId={caseId} />
      <BulkResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />
      <Drawer open={creating} onOpenChange={setCreating} title={`New ${r.label.toLowerCase()}`}>
        {creating ? (
          <ResourceForm
            resource={r}
            caseId={caseId}
            fixed={{ ...(matterId ? { matterId } : {}), ...(createFixed ?? {}) }}
            onCancel={() => setCreating(false)}
            onSaved={(row) => {
              setCreating(false);
              setOpenId(row.id);
            }}
          />
        ) : null}
      </Drawer>
    </section>
  );
}

const MONEYISH = new Set(["amountOutstanding", "amountRecovered", "outstandingBalance", "netAmount", "actualExpenditure", "unusedBalance", "additionalAmountDue"]);
