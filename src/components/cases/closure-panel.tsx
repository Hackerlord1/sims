"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FolderLock, FolderOpen, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { CaseSummary } from "@/components/cases/types";
import { useCan } from "@/components/session-context";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DateText } from "@/components/ui/display";
import { Field, FormAlert, Input, Textarea } from "@/components/ui/field";
import { LoadingRows } from "@/components/ui/states";
import { apiGet, apiPost, errorMessage } from "@/lib/api-client";
import type { ClosureCheck } from "@/lib/case-status";

export function ClosurePanel({ summary, onChanged }: { summary: CaseSummary; onChanged: () => void }) {
  const c = summary.case;
  const can = useCan();
  const qc = useQueryClient();
  const closed = c.status === "CLOSED";
  const [reason, setReason] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checks = useQuery({
    queryKey: ["closure-check", c.id, c.status],
    queryFn: ({ signal }) => apiGet<{ checks: ClosureCheck[]; blocked: boolean }>(`/cases/${c.id}/closure-check`, undefined, signal),
    enabled: !closed,
  });

  const submit = async () => {
    setError(null);
    if (reason.trim().length < 3) return setError("Enter a reason.");
    if (text.trim().length < 10) return setError(closed ? "Describe the new information (at least 10 characters)." : "Write a closure summary (at least 10 characters).");
    setBusy(true);
    try {
      if (closed) await apiPost(`/cases/${c.id}/reopen`, { reason, newInformation: text });
      else await apiPost(`/cases/${c.id}/close`, { reason, summary: text });
      toast.success(closed ? "Case reopened." : "Case closed.");
      setReason("");
      setText("");
      await qc.invalidateQueries({ queryKey: ["case-summary", c.id] });
      await qc.invalidateQueries({ queryKey: ["list", "cases"] });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const mayApprove = can("CASES", "APPROVE");
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title={closed ? "Reopen case" : "Close case"} id="closure">
        {!closed ? (
          checks.isLoading ? (
            <LoadingRows rows={4} />
          ) : (
            <ul className="mb-4 space-y-1.5 text-sm" aria-label="Closure checklist">
              {checks.data?.data.checks.map((ch) => (
                <li key={ch.key} className="flex items-start gap-2">
                  {ch.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  ) : ch.blocking ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  )}
                  <span>
                    <span className="font-medium">{ch.label}</span>{" "}
                    <span className="text-muted">
                      — {ch.ok ? "passed" : ch.blocking ? "blocking" : "warning"}: {ch.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="mb-4 text-sm text-muted">
            Closed on <DateText value={c.actualClosureDate} />. Reason: {c.closureReason}
          </p>
        )}
        {mayApprove ? (
          <AnimatePresence mode="wait">
            <motion.div key={closed ? "reopen" : "close"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-3">
              {error ? <FormAlert>{error}</FormAlert> : null}
              <Field id="closure-reason" label={closed ? "Reason for reopening" : "Closure reason"} required>
                <Input id="closure-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
              </Field>
              <Field id="closure-text" label={closed ? "New information" : "Closure summary"} required>
                <Textarea id="closure-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} />
              </Field>
              <Button onClick={submit} loading={busy} variant={closed ? "primary" : "danger"} disabled={!closed && checks.data?.data.blocked}>
                {closed ? <FolderOpen className="h-4 w-4" aria-hidden /> : <FolderLock className="h-4 w-4" aria-hidden />}
                {closed ? "Reopen case" : "Close case"}
              </Button>
              {!closed && checks.data?.data.blocked ? <p className="text-xs text-muted">Resolve the blocking checks before closing.</p> : null}
            </motion.div>
          </AnimatePresence>
        ) : (
          <p className="text-sm text-muted">Closing and reopening cases requires case approval rights.</p>
        )}
      </Card>

      <Card title="Status history" id="status-history">
        <ol className="space-y-2 text-sm">
          {summary.history.map((h) => (
            <li key={h.id} className="border-l-2 border-border pl-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {h.fromStatus ? <StatusBadge value={h.fromStatus} /> : null}
                {h.fromStatus ? <span aria-hidden>→</span> : null}
                <StatusBadge value={h.toStatus} />
              </div>
              <p className="mt-0.5 text-xs text-muted">
                <DateText value={h.changedAt} withTime /> · {h.changedBy}
                {h.reason ? ` · ${h.reason}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      {summary.reopenings.length ? (
        <Card title="Reopening history" id="reopenings" className="xl:col-span-2">
          <ul className="divide-y divide-border text-sm">
            {summary.reopenings.map((r) => (
              <li key={r.id} className="py-2">
                <p className="font-medium">
                  <DateText value={r.reopenedAt} withTime /> by {r.reopenedBy}
                </p>
                <p>Reason: {r.reason}</p>
                <p className="whitespace-pre-wrap text-muted">New information: {r.newInformation}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {summary.closures.length ? (
        <Card title="Closure records" id="closures" className="xl:col-span-2">
          <ul className="divide-y divide-border text-sm">
            {summary.closures.map((r) => (
              <li key={r.id} className="py-2">
                <p className="font-medium">
                  <DateText value={r.closedAt} withTime /> by {r.closedBy} — {r.reason}
                </p>
                <p className="whitespace-pre-wrap text-muted">{r.summary}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
