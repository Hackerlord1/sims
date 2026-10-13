"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Download, EyeOff, Link2, Network, RefreshCw, ScanSearch, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AsyncSelect } from "@/components/resources/async-select";
import { useDebounced } from "@/components/resources/hooks";
import { useCan } from "@/components/session-context";
import { Badge, DemoBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { DateText, DescriptionList, Money, PageHeader, Ref } from "@/components/ui/display";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, ErrorState, LeadNotice, LoadingRows } from "@/components/ui/states";
import { apiGet, apiPost, downloadFromApi, errorMessage } from "@/lib/api-client";
import { enumLabel } from "@/lib/enums";
import { FLAG_LABELS, FLAGS, type Flag } from "@/lib/statements/analysis";
import { cn } from "@/lib/cn";

interface Overview {
  statement: Record<string, string | number | null> & { id: string; status: string; caseId: string; currency: string; isDemo: boolean };
  case: { id: string; reference: string; title: string };
  flags: Partial<Record<Flag, number>>;
  links: Partial<Record<"SUGGESTED" | "CONFIRMED" | "REJECTED", number>>;
  totals: { debit: string; credit: string };
  job: { status: string; attempts: number; lastError: string | null } | null;
}

interface TxnRow {
  id: string;
  rowNumber: number;
  txnDate: string;
  txnTime: string | null;
  reference: string | null;
  description: string;
  debit: string;
  credit: string;
  balance: string | null;
  counterpartyName: string | null;
  counterpartyPhone: string | null;
  counterpartyAccount: string | null;
  flags: Flag[];
  excluded: boolean;
  links: { id: string; status: string; linkClass: string; targetLabel: string; score: number }[];
}

interface LinkRow {
  id: string;
  linkClass: string;
  score: number;
  rationale: string;
  status: string;
  targetLabel: string;
  targetType: string;
  reviewNote: string | null;
  transaction: { id: string; txnDate: string; reference: string | null; description: string; debit: string; credit: string; counterpartyName: string | null };
}

/** Parsing and case-wide analysis run in one background job; the page polls until both have finished. */
function isBusy(o: Overview | undefined) {
  if (!o) return false;
  return ["QUEUED", "PARSING"].includes(o.statement.status) || ["QUEUED", "RUNNING"].includes(o.job?.status ?? "");
}

export function StatementAnalysis({ id }: { id: string }) {
  const can = useCan();
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ["statement-overview", id],
    queryFn: ({ signal }) => apiGet<Overview>(`/financial-statements/${id}/overview`, undefined, signal),
    refetchInterval: (q) => (isBusy(q.state.data?.data) ? 2000 : false),
  });
  const [tab, setTab] = useState("transactions");
  const [flag, setFlag] = useState<Flag | "">("");
  if (overview.isError) return <ErrorState message={errorMessage(overview.error)} onRetry={() => overview.refetch()} />;
  if (!overview.data) return <LoadingRows rows={8} label="Loading statement" />;
  const o = overview.data.data;
  const st = o.statement;
  const busy = isBusy(o);
  // Transactions and links are re-read whenever an analysis run completes.
  const analysed = String(st.analysedAt ?? "");
  const refresh = () =>
    qc
      .invalidateQueries({ queryKey: ["statement-overview", id] })
      .then(() => qc.invalidateQueries({ queryKey: ["statement-txns", id] }))
      .then(() => qc.invalidateQueries({ queryKey: ["statement-links", id] }));
  const act = async (path: string, msg: string) => {
    try {
      await apiPost(path);
      toast.success(msg);
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Link href={`/cases/${o.case.id}?tab=analysis`} className="hover:underline">
              <Ref>{o.case.reference}</Ref> {o.case.title}
            </Link>
          </>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {String(st.ownerName)}{" "}
            <span className="text-base font-normal text-muted">
              · {String(st.institution)} {String(st.maskedAccount)}
            </span>
            {st.isDemo ? <DemoBadge /> : null}
          </span>
        }
        description={<Ref>{String(st.reference)}</Ref>}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/money-movement?caseId=${o.case.id}`}>
                <Network className="h-4 w-4" aria-hidden /> Money movement
              </Link>
            </Button>
            {can("STATEMENTS", "EDIT") ? (
              <>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(`/financial-statements/${id}/analyse`, "Analysis refreshed.")}>
                  <ScanSearch className="h-4 w-4" aria-hidden /> Re-run analysis
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(`/financial-statements/${id}/reparse`, "Queued for parsing.")}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> Re-parse
                </Button>
                {["PARSED", "NEEDS_MANUAL_REVIEW"].includes(st.status) ? (
                  <Button size="sm" onClick={() => act(`/financial-statements/${id}/review`, "Marked as reviewed.")}>
                    <Check className="h-4 w-4" aria-hidden /> Mark reviewed
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadFromApi(`/financial-statements/${id}/export`, { query: { format: "xlsx" }, fallbackName: "transaction-schedule.xlsx" }).catch((e) => toast.error(errorMessage(e)))}
            >
              <Download className="h-4 w-4" aria-hidden /> Transaction schedule
            </Button>
          </>
        }
      />
      <LeadNotice />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="depth rounded-xl border border-border bg-surface p-4 lg:col-span-2" aria-label="Statement details">
          <DescriptionList
            columns={3}
            items={[
              { label: "Status", value: <StatusBadge value={st.status} /> },
              { label: "Parser", value: st.parserUsed ? String(st.parserUsed) : busy ? "Waiting…" : "—" },
              { label: "Transactions", value: String(st.transactionCount) },
              { label: "Total debits", value: <Money value={o.totals.debit} currency={st.currency} /> },
              { label: "Total credits", value: <Money value={o.totals.credit} currency={st.currency} /> },
              {
                label: "Period",
                value: (
                  <>
                    <DateText value={st.periodStart as string | null} /> – <DateText value={st.periodEnd as string | null} />
                  </>
                ),
              },
              { label: "Format", value: enumLabel(String(st.format)) },
              { label: "Authority for processing", value: String(st.processingAuthority) },
              { label: "Original file", value: <Ref className="text-xs">{String(st.originalFilename)}</Ref> },
              { label: "SHA-256 of original", value: <Ref className="text-xs break-all whitespace-normal">{String(st.sha256)}</Ref>, wide: true },
            ]}
          />
          {busy ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-info" role="status">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> Parsing and analysing in the background — this page updates automatically.
            </p>
          ) : null}
          {o.job?.status === "FAILED" || st.status === "FAILED" ? <FormAlert>Parsing failed: {o.job?.lastError ?? String(st.parseMessage ?? "unknown error")}</FormAlert> : null}
          {st.parseMessage && st.status !== "FAILED" ? (
            <details className="mt-3 text-xs text-muted">
              <summary className="cursor-pointer">Parser notes</summary>
              <pre className="mt-1 whitespace-pre-wrap">{String(st.parseMessage)}</pre>
            </details>
          ) : null}
        </section>
        <section className="depth rounded-xl border border-border bg-surface p-4" aria-label="Pattern flags">
          <h2 className="text-sm font-semibold">Pattern flags (leads)</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {FLAGS.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  className={cn("flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-surface-2", flag === f && "bg-accent-soft")}
                  aria-pressed={flag === f}
                  onClick={() => {
                    setFlag(flag === f ? "" : f);
                    setTab("transactions");
                  }}
                >
                  <span>{FLAG_LABELS[f]}</span>
                  <span className="tabular font-semibold">{o.flags[f] ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Links: {o.links.SUGGESTED ?? 0} suggested · {o.links.CONFIRMED ?? 0} confirmed · {o.links.REJECTED ?? 0} rejected
          </p>
        </section>
      </div>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List aria-label="Statement analysis sections" className="flex gap-1 border-b border-border">
          {[
            ["transactions", "Transactions"],
            ["links", `Suggested links (${o.links.SUGGESTED ?? 0})`],
            ["reviewed", "Reviewed links"],
          ].map(([v, l]) => (
            <Tabs.Trigger key={v} value={v} className="tab-trigger rounded-t-md px-3 py-2 text-sm text-muted hover:text-text data-[state=active]:font-semibold data-[state=active]:text-text">
              {l}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="pt-4">
          <Tabs.Content value="transactions">
            {tab === "transactions" ? <TransactionsTable id={id} analysed={analysed} caseId={o.case.id} currency={st.currency} flag={flag} setFlag={setFlag} onChanged={refresh} /> : null}
          </Tabs.Content>
          <Tabs.Content value="links">{tab === "links" ? <LinksQueue id={id} analysed={analysed} status="SUGGESTED" onChanged={refresh} /> : null}</Tabs.Content>
          <Tabs.Content value="reviewed">{tab === "reviewed" ? <LinksQueue id={id} analysed={analysed} status="CONFIRMED" onChanged={refresh} alt="REJECTED" /> : null}</Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

function TransactionsTable({
  id,
  analysed,
  caseId,
  currency,
  flag,
  setFlag,
  onChanged,
}: {
  id: string;
  analysed: string;
  caseId: string;
  currency: string;
  flag: Flag | "";
  setFlag: (f: Flag | "") => void;
  onChanged: () => Promise<unknown>;
}) {
  const can = useCan();
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState("");
  const [q, setQ] = useState("");
  const [excluded, setExcluded] = useState("");
  const [linkFor, setLinkFor] = useState<TxnRow | null>(null);
  const [excludeFor, setExcludeFor] = useState<TxnRow | null>(null);
  const dq = useDebounced(q, 300);
  const params = { page, pageSize: 100, flag: flag || undefined, direction: direction || undefined, q: dq || undefined, excluded: excluded || undefined };
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["statement-txns", id, analysed, params],
    queryFn: ({ signal }) => apiGet<TxnRow[]>(`/financial-statements/${id}/transactions`, params, signal),
    placeholderData: keepPreviousData,
  });
  const rows = data?.data ?? [];
  const meta = data?.meta;
  return (
    <section className="panel rounded-xl border border-border bg-surface shadow-card" aria-label="Transactions">
      <div className="panel-header flex flex-wrap items-end gap-2 rounded-t-xl border-b border-border p-3">
        <label className="text-xs font-medium">
          Search
          <Input
            className="mt-1 h-9 w-56"
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Description, reference, counterparty"
          />
        </label>
        <label className="text-xs font-medium">
          Flag
          <Select
            className="mt-1 h-9 w-60"
            value={flag}
            onChange={(e) => {
              setFlag(e.target.value as Flag | "");
              setPage(1);
            }}
          >
            <option value="">All transactions</option>
            {FLAGS.map((f) => (
              <option key={f} value={f}>
                {FLAG_LABELS[f]}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs font-medium">
          Direction
          <Select
            className="mt-1 h-9 w-32"
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Both</option>
            <option value="DEBIT">Money out</option>
            <option value="CREDIT">Money in</option>
          </Select>
        </label>
        <label className="text-xs font-medium">
          Rows
          <Select
            className="mt-1 h-9 w-40"
            value={excluded}
            onChange={(e) => {
              setExcluded(e.target.value);
              setPage(1);
            }}
          >
            <option value="">In analysis</option>
            <option value="only">Excluded rows</option>
            <option value="include">All rows</option>
          </Select>
        </label>
      </div>
      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingRows />
      ) : rows.length === 0 ? (
        <EmptyState title="No transactions" description="Nothing matches, or the statement has not been parsed yet." />
      ) : (
        <div className="max-h-[70vh] overflow-auto" aria-busy={isFetching}>
          <table className="w-full min-w-[980px] text-left text-sm">
            <caption className="sr-only">Statement transactions</caption>
            <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Date
                </th>
                <th scope="col" className="px-3 py-2">
                  Reference
                </th>
                <th scope="col" className="px-3 py-2">
                  Description / counterparty
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Debit
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Credit
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Balance
                </th>
                <th scope="col" className="px-3 py-2">
                  Flags (leads)
                </th>
                <th scope="col" className="px-3 py-2">
                  Links
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => (
                <tr key={t.id} className={cn(t.excluded && "opacity-60")}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <DateText value={t.txnDate} /> {t.txnTime ? <span className="text-xs text-muted">{t.txnTime}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <Ref className="text-xs">{t.reference ?? "—"}</Ref>
                  </td>
                  <td className="max-w-80 px-3 py-2">
                    <span className="block truncate" title={t.description}>
                      {t.description}
                    </span>
                    {t.counterpartyName || t.counterpartyPhone || t.counterpartyAccount ? (
                      <span className="block text-xs text-muted">
                        {t.counterpartyName} {t.counterpartyPhone ? <Ref>{t.counterpartyPhone}</Ref> : null} {t.counterpartyAccount ? <Ref>{t.counterpartyAccount}</Ref> : null}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">{t.debit !== "0" && t.debit !== "0.00" ? <Money value={t.debit} currency={null} /> : ""}</td>
                  <td className="px-3 py-2 text-right">{t.credit !== "0" && t.credit !== "0.00" ? <Money value={t.credit} currency={null} /> : ""}</td>
                  <td className="px-3 py-2 text-right">{t.balance ? <Money value={t.balance} currency={null} /> : ""}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {t.flags.map((f) => (
                        <Badge key={f} tone={f === "UNKNOWN_COUNTERPARTY" || f === "ROUND_FIGURE" ? "neutral" : "warning"} title={FLAG_LABELS[f]}>
                          {FLAG_LABELS[f]}
                        </Badge>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {t.links
                      .filter((l) => l.status !== "REJECTED")
                      .map((l) => (
                        <span key={l.id} className="block">
                          {l.status === "CONFIRMED" ? "✓ " : "? "}
                          {l.targetLabel}
                        </span>
                      ))}
                  </td>
                  <td className="px-3 py-2">
                    {can("STATEMENTS", "EDIT") ? (
                      <span className="flex gap-1">
                        <Button size="icon" variant="ghost" aria-label="Link transaction to a record" onClick={() => setLinkFor(t)}>
                          <Link2 className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={t.excluded ? "Include in analysis" : "Exclude from analysis"} onClick={() => setExcludeFor(t)}>
                          <EyeOff className="h-4 w-4" aria-hidden />
                        </Button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && meta.total > 0 ? (
        <nav className="flex items-center justify-between border-t border-border px-3 py-2 text-sm" aria-label="Transaction pagination">
          <span className="text-muted">
            {meta.total} transactions · page {meta.page} of {meta.totalPages} · amounts in {currency}
          </span>
          <span className="flex gap-2">
            <Button size="icon" variant="secondary" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button size="icon" variant="secondary" aria-label="Next page" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </span>
        </nav>
      ) : null}
      {linkFor ? (
        <ManualLinkDialog
          txn={linkFor}
          caseId={caseId}
          onClose={() => setLinkFor(null)}
          onDone={async () => {
            await refetch();
            await onChanged();
          }}
        />
      ) : null}
      {excludeFor ? (
        <ExcludeDialog
          txn={excludeFor}
          onClose={() => setExcludeFor(null)}
          onDone={async () => {
            await refetch();
            await onChanged();
          }}
        />
      ) : null}
    </section>
  );
}

const TARGET_RESOURCES = { PARTY: "parties", INVOICE: "invoices", CHEQUE: "cheques", KNOWN_ACCOUNT: "known-accounts" } as const;

function ManualLinkDialog({ txn, caseId, onClose, onDone }: { txn: TxnRow; caseId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [type, setType] = useState<keyof typeof TARGET_RESOURCES>("PARTY");
  const [target, setTarget] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Link transaction to a record"
      description={`${txn.description} — this creates an investigator-confirmed link.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              if (!target) return setError("Choose a record.");
              setBusy(true);
              try {
                await apiPost(`/statement-transactions/${txn.id}/links`, { targetType: type, targetId: target, note: note || undefined });
                toast.success("Link recorded.");
                await onDone();
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Link
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field id="ml-type" label="Record type">
          <Select
            id="ml-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as keyof typeof TARGET_RESOURCES);
              setTarget(null);
            }}
          >
            <option value="PARTY">Party</option>
            <option value="INVOICE">Invoice</option>
            <option value="CHEQUE">Cheque</option>
            <option value="KNOWN_ACCOUNT">Known account</option>
          </Select>
        </Field>
        <Field id="ml-target" label="Record" required>
          <AsyncSelect key={type} id="ml-target" path={`/options/records/${TARGET_RESOURCES[type]}`} params={{ caseId }} value={target} onChange={setTarget} />
        </Field>
        <Field id="ml-note" label="Note">
          <Textarea id="ml-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ExcludeDialog({ txn, onClose, onDone }: { txn: TxnRow; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={txn.excluded ? "Include this row in analysis again?" : "Exclude this row from analysis?"}
      description="Use this for rows the parser misread (for example totals or page headers). The row is kept and the change is audited."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (reason.trim().length < 3) return setError("Enter a reason.");
              try {
                await apiPost(`/statement-transactions/${txn.id}/exclusion`, { excluded: !txn.excluded, reason });
                toast.success(txn.excluded ? "Row included." : "Row excluded.");
                await onDone();
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            {txn.excluded ? "Include" : "Exclude"}
          </Button>
        </>
      }
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id="ex-reason" label="Reason" required>
        <Textarea id="ex-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}

function LinksQueue({ id, analysed, status, alt, onChanged }: { id: string; analysed: string; status: "SUGGESTED" | "CONFIRMED"; alt?: "REJECTED"; onChanged: () => Promise<unknown> }) {
  const can = useCan();
  const [view, setView] = useState<string>(status);
  const [page, setPage] = useState(1);
  const [reject, setReject] = useState<LinkRow | null>(null);
  const [note, setNote] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["statement-links", id, analysed, view, page],
    queryFn: ({ signal }) => apiGet<LinkRow[]>(`/financial-statements/${id}/links`, { status: view, page, pageSize: 50 }, signal),
    placeholderData: keepPreviousData,
  });
  const review = async (link: LinkRow, s: "CONFIRMED" | "REJECTED", n?: string) => {
    try {
      await apiPost(`/transaction-links/${link.id}/review`, { status: s, note: n || undefined });
      toast.success(s === "CONFIRMED" ? "Link confirmed." : "Link rejected.");
      await refetch();
      await onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const rows = data?.data ?? [];
  const meta = data?.meta;
  return (
    <section aria-label="Transaction links" className="space-y-3">
      {alt ? (
        <Select
          aria-label="Reviewed link status"
          className="h-9 w-48"
          value={view}
          onChange={(e) => {
            setView(e.target.value);
            setPage(1);
          }}
        >
          <option value="CONFIRMED">Confirmed</option>
          <option value="REJECTED">Rejected</option>
        </Select>
      ) : null}
      {isLoading ? (
        <LoadingRows />
      ) : rows.length === 0 ? (
        <EmptyState title={view === "SUGGESTED" ? "No suggested links awaiting review" : "No reviewed links"} />
      ) : (
        <ul className="space-y-2">
          {rows.map((l) => (
            <li key={l.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    <StatusBadge value={l.linkClass} /> <span className="ml-1">{l.targetLabel}</span> <span className="text-xs text-muted">· lead strength {l.score}/100</span>
                  </p>
                  <p className="mt-1 text-muted">{l.rationale}</p>
                  <p className="mt-1 text-xs">
                    <DateText value={l.transaction.txnDate} /> · <Ref>{l.transaction.reference ?? "—"}</Ref> · {l.transaction.description} ·{" "}
                    {l.transaction.debit !== "0" && l.transaction.debit !== "0.00" ? (
                      <>
                        out <Money value={l.transaction.debit} currency={null} />
                      </>
                    ) : (
                      <>
                        in <Money value={l.transaction.credit} currency={null} />
                      </>
                    )}
                  </p>
                  {l.reviewNote ? <p className="mt-1 text-xs">Note: {l.reviewNote}</p> : null}
                </div>
                {view === "SUGGESTED" && can("STATEMENTS", "EDIT") ? (
                  <span className="flex gap-1.5">
                    <Button size="sm" onClick={() => review(l, "CONFIRMED")}>
                      <Check className="h-4 w-4" aria-hidden /> Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setReject(l);
                        setNote("");
                      }}
                    >
                      <X className="h-4 w-4" aria-hidden /> Reject
                    </Button>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {meta && meta.totalPages > 1 ? (
        <nav className="flex items-center gap-2 text-sm" aria-label="Link pagination">
          <Button size="icon" variant="secondary" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <span className="text-muted">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button size="icon" variant="secondary" aria-label="Next page" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </nav>
      ) : null}
      <Modal
        open={Boolean(reject)}
        onOpenChange={(o) => !o && setReject(null)}
        title="Reject suggested link"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReject(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (note.trim().length < 3) return;
                await review(reject!, "REJECTED", note);
                setReject(null);
              }}
            >
              Reject link
            </Button>
          </>
        }
      >
        <Field id="rej-note" label="Why is this not a match?" required>
          <Textarea id="rej-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>
    </section>
  );
}
