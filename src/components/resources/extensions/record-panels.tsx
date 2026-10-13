"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, FileSignature, ListPlus, Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DropZone } from "@/components/evidence/upload-evidence";
import { LinkedEvidence } from "@/components/evidence/linked-evidence";
import { AsyncSelect } from "@/components/resources/async-select";
import { rowCurrency } from "@/components/resources/cells";
import type { ExtensionProps } from "@/components/resources/detail-extensions";
import { ActionButton, ActionDialog, PanelSection, post } from "@/components/resources/extensions/action";
import { ResourceTable } from "@/components/resources/resource-table";
import { useCan, useSession } from "@/components/session-context";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateText, Money, Ref } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { apiGet, apiPut, errorMessage, uploadWithProgress } from "@/lib/api-client";
import { ENUMS, enumLabel, enumOptions } from "@/lib/enums";
import { money, sum, toDbString } from "@/lib/money";

const caseIdOf = (row: ExtensionProps["row"]) => String(row.caseId);

// ───────────────────── Cheques ─────────────────────

interface ChequeLink {
  invoiceId: string;
  amount: string;
  invoice: { id: string; invoiceNumber: string; customerName: string; invoiceAmount: string; amountPaid: string };
}

export function ChequePanel({ row, refresh }: ExtensionProps) {
  const can = useCan();
  const warnings = (row.warnings as { code: string; message: string }[] | undefined) ?? [];
  const links = useQuery({ queryKey: ["cheque-invoices", row.id], queryFn: ({ signal }) => apiGet<ChequeLink[]>(`/cheques/${row.id}/invoices`, undefined, signal) });
  const [draft, setDraft] = useState<{ invoiceId: string; label?: string; amount: string }[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [pickLabel, setPickLabel] = useState<string | undefined>();
  const editing = draft !== null;
  const current = links.data?.data ?? [];
  const cur = rowCurrency(row);

  const save = async () => {
    try {
      await apiPut(`/cheques/${row.id}/invoices`, { links: draft!.map((d) => ({ invoiceId: d.invoiceId, amount: d.amount || "0" })) });
      toast.success("Linked invoices saved.");
      setDraft(null);
      await links.refetch();
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-3">
      {warnings.length ? (
        <section aria-label="Cheque warnings" className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
          <h3 className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4" aria-hidden /> {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </h3>
          <ul className="list-disc space-y-0.5 pl-5">
            {warnings.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-sm text-success">No warnings for this cheque.</p>
      )}

      <PanelSection
        title="Related invoices"
        actions={
          can("CHEQUES", "EDIT") && !editing ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDraft(current.map((l) => ({ invoiceId: l.invoiceId, label: `${l.invoice.invoiceNumber} — ${l.invoice.customerName}`, amount: l.amount })))}
            >
              Edit links
            </Button>
          ) : null
        }
      >
        {editing ? (
          <div className="space-y-2">
            {draft!.map((d, i) => (
              <div key={d.invoiceId} className="flex flex-wrap items-end gap-2">
                <span className="min-w-40 flex-1 text-sm">{d.label ?? d.invoiceId}</span>
                <label className="text-xs">
                  Allocated amount
                  <Input className="ref mt-1 h-9 w-36" inputMode="decimal" value={d.amount} onChange={(e) => setDraft(draft!.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                </label>
                <Button size="icon" variant="ghost" aria-label="Remove link" onClick={() => setDraft(draft!.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
              <div className="min-w-56 flex-1">
                <Field id="link-invoice" label="Add invoice">
                  <AsyncSelect
                    id="link-invoice"
                    path="/options/records/invoices"
                    params={{ caseId: caseIdOf(row) }}
                    value={pick}
                    onChange={(v, o) => {
                      setPick(v);
                      setPickLabel(o?.label);
                    }}
                  />
                </Field>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (pick && !draft!.some((d) => d.invoiceId === pick)) setDraft([...draft!, { invoiceId: pick, label: pickLabel, amount: "" }]);
                  setPick(null);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden /> Add
              </Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save}>
                Save links
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : current.length ? (
          <table className="w-full text-sm">
            <caption className="sr-only">Invoices linked to this cheque</caption>
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="text-left font-semibold">
                  Invoice
                </th>
                <th scope="col" className="text-right font-semibold">
                  Outstanding
                </th>
                <th scope="col" className="text-right font-semibold">
                  Allocated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {current.map((l) => (
                <tr key={l.invoiceId}>
                  <td className="py-1">
                    <Ref>{l.invoice.invoiceNumber}</Ref> <span className="text-muted">{l.invoice.customerName}</span>
                  </td>
                  <td className="py-1 text-right">
                    <Money value={toDbString(money(l.invoice.invoiceAmount).minus(l.invoice.amountPaid))} currency={cur} />
                  </td>
                  <td className="py-1 text-right">
                    <Money value={l.amount} currency={cur} />
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1">Total</td>
                <td className="py-1 text-right">
                  <Money value={toDbString(sum(current.map((l) => money(l.invoice.invoiceAmount).minus(l.invoice.amountPaid))))} currency={cur} />
                </td>
                <td className="py-1 text-right">
                  <Money value={toDbString(sum(current.map((l) => l.amount)))} currency={cur} />
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">No invoices linked.</p>
        )}
      </PanelSection>

      <ResourceTable
        resource="tasks"
        caseId={caseIdOf(row)}
        fixedFilters={{ linkType: "CHEQUE", linkId: row.id }}
        createFixed={{ linkType: "CHEQUE", linkId: row.id }}
        title="Follow-up tasks"
        columns={["title", "category", "status", "assigneeId", "dueDate"]}
        allowModeSwitch={false}
        defaultPageSize={10}
      />
      <LinkedEvidence caseId={caseIdOf(row)} linkType="CHEQUE" linkId={row.id} title="Cheque image and bank-return memo" defaultCategory="CHEQUE_IMAGE" uploadLabel="Upload image or memo" />
    </div>
  );
}

// ───────────────────── Invoices and sub-files ─────────────────────

export function InvoicePanel({ row }: ExtensionProps) {
  return <LinkedEvidence caseId={caseIdOf(row)} linkType="INVOICE" linkId={row.id} title="Supporting documents (invoice copy, delivery note, proof of delivery)" defaultCategory="INVOICE_COPY" />;
}

export function SubFilePanel({ row }: ExtensionProps) {
  return (
    <div className="space-y-3">
      <ResourceTable
        resource="invoices"
        caseId={caseIdOf(row)}
        fixedFilters={{ subFileId: row.id }}
        createFixed={{ subFileId: row.id }}
        title="Invoices in this sub-file"
        allowModeSwitch={false}
        defaultPageSize={10}
      />
      <ResourceTable
        resource="cheques"
        caseId={caseIdOf(row)}
        fixedFilters={{ subFileId: row.id }}
        createFixed={{ subFileId: row.id }}
        title="Cheques in this sub-file"
        allowModeSwitch={false}
        defaultPageSize={10}
      />
    </div>
  );
}

// ───────────────────── Work-done log ─────────────────────

export function WorkLogPanel({ row, refresh }: ExtensionProps) {
  const can = useCan();
  const me = useSession();
  const [task, setTask] = useState({ title: String(row.nextTask ?? ""), assigneeId: (row.responsibleOfficerId as string | null) ?? null, dueDate: "", category: "GENERAL" });
  const [review, setReview] = useState({ status: "REVIEWED", comment: "" });
  return (
    <div className="space-y-3">
      <PanelSection
        title="Follow-up and review"
        actions={
          <>
            {can("TASKS", "CREATE") ? (
              <ActionDialog
                label="Generate follow-up task"
                icon={<ListPlus className="h-4 w-4" aria-hidden />}
                title="Generate a follow-up task"
                submitLabel="Create task"
                onSubmit={async () => {
                  await post(`/work-logs/${row.id}/tasks`, { ...task, dueDate: task.dueDate || null }, "Task created.");
                  await refresh();
                }}
              >
                <Field id="wl-title" label="Task" required>
                  <Input id="wl-title" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
                </Field>
                <Field id="wl-assignee" label="Assign to">
                  <AsyncSelect id="wl-assignee" path="/options/users" value={task.assigneeId} valueLabel={row._labels?.responsibleOfficerId} onChange={(v) => setTask({ ...task, assigneeId: v })} />
                </Field>
                <Field id="wl-due" label="Due date">
                  <Input id="wl-due" type="date" value={task.dueDate} onChange={(e) => setTask({ ...task, dueDate: e.target.value })} />
                </Field>
                <Field id="wl-cat" label="Category">
                  <Select id="wl-cat" value={task.category} onChange={(e) => setTask({ ...task, category: e.target.value })}>
                    {enumOptions("TaskCategory").map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </ActionDialog>
            ) : null}
            {can("WORK_LOGS", "EDIT") && row.investigatorId !== me.id ? (
              <ActionDialog
                label="Supervisor review"
                variant="secondary"
                icon={<BadgeCheck className="h-4 w-4" aria-hidden />}
                title="Supervisor review"
                onSubmit={async () => {
                  await post(`/work-logs/${row.id}/review`, review, "Review recorded.");
                  await refresh();
                }}
              >
                <Field id="wl-rstatus" label="Outcome">
                  <Select id="wl-rstatus" value={review.status} onChange={(e) => setReview({ ...review, status: e.target.value })}>
                    <option value="REVIEWED">Reviewed</option>
                    <option value="RETURNED">Returned for correction</option>
                  </Select>
                </Field>
                <Field id="wl-rcomment" label="Comments" required>
                  <Textarea id="wl-rcomment" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} />
                </Field>
              </ActionDialog>
            ) : null}
          </>
        }
      >
        <p className="text-sm">
          Supervisor review: <StatusBadge value={String(row.supervisorStatus)} />
          {row.supervisorReview ? <span className="mt-1 block whitespace-pre-wrap text-muted">{String(row.supervisorReview)}</span> : null}
        </p>
      </PanelSection>
      <ResourceTable
        resource="tasks"
        caseId={caseIdOf(row)}
        fixedFilters={{ sourceWorkLogId: row.id }}
        title="Tasks generated from this entry"
        columns={["reference", "title", "status", "assigneeId", "dueDate"]}
        allowCreate={false}
        allowModeSwitch={false}
        defaultPageSize={10}
      />
      <LinkedEvidence caseId={caseIdOf(row)} linkType="WORK_LOG" linkId={row.id} title="Attachments" />
    </div>
  );
}

// ───────────────────── Statements ─────────────────────

export function PartyStatementPanel({ row, refresh }: ExtensionProps) {
  const can = useCan();
  const [file, setFile] = useState<File | null>(null);
  if (row.signed) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-sm text-success">
        <FileSignature className="h-4 w-4" aria-hidden /> Signed copy recorded as evidence {row._labels?.evidenceId ?? ""}. Signed statements are protected and cannot be edited or deleted.
      </p>
    );
  }
  return can("INTERVIEWS", "EDIT") && can("EVIDENCE", "CREATE") ? (
    <PanelSection
      title="Signed statement"
      actions={
        <ActionDialog
          label="Upload signed copy"
          icon={<FileSignature className="h-4 w-4" aria-hidden />}
          title="Upload the signed statement"
          description="The signed copy is stored as protected evidence and the statement becomes read-only."
          submitLabel="Upload"
          onSubmit={async () => {
            if (!file) throw new Error("Choose the signed file.");
            const form = new FormData();
            form.set("file", file);
            await uploadWithProgress(`/party-statements/${row.id}/signed-copy`, form);
            toast.success("Signed statement recorded.");
            setFile(null);
            await refresh();
          }}
        >
          <DropZone file={file} onFile={setFile} accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" />
        </ActionDialog>
      }
    >
      <p className="text-sm text-muted">No signed copy uploaded yet.</p>
    </PanelSection>
  ) : null;
}

// ───────────────────── Findings and decisions ─────────────────────

interface FindingDetail {
  recommendations: { id: string; type: string; details: string | null; approved: boolean | null }[];
  decisions: { id: string; outcome: string; decisionDate: string; conditions: string | null; comments: string | null; approver: string }[];
}

export function FindingPanel({ row, refresh }: ExtensionProps) {
  const can = useCan();
  const me = useSession();
  const status = String(row.status);
  const detail = useQuery({ queryKey: ["finding-detail", row.id], queryFn: ({ signal }) => apiGet<FindingDetail>(`/findings/${row.id}/detail`, undefined, signal) });
  const recs = detail.data?.data.recommendations ?? [];
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [decision, setDecision] = useState({ outcome: "APPROVED", decisionDate: new Date().toISOString().slice(0, 10), conditions: "", comments: "", approvedTypes: [] as string[] });
  const editable = ["DRAFT", "RETURNED"].includes(status) && can("FINDINGS", "EDIT");
  const after = async () => {
    await detail.refetch();
    await refresh();
  };

  return (
    <div className="space-y-3">
      <PanelSection
        title="Recommendations"
        actions={
          editable && !edit ? (
            <Button size="sm" variant="secondary" onClick={() => setEdit(Object.fromEntries(recs.map((r) => [r.type, r.details ?? ""])))}>
              Edit recommendations
            </Button>
          ) : null
        }
      >
        {edit ? (
          <div className="space-y-2">
            <fieldset className="space-y-2">
              <legend className="sr-only">Recommended actions</legend>
              {ENUMS.RecommendationType.map((t) => (
                <div key={t} className="rounded border border-border p-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent)]"
                      checked={t in edit}
                      onChange={(e) => {
                        const next = { ...edit };
                        if (e.target.checked) next[t] = "";
                        else delete next[t];
                        setEdit(next);
                      }}
                    />
                    {enumLabel(t)}
                  </label>
                  {t in edit ? (
                    <Textarea
                      aria-label={`Details for ${enumLabel(t)}`}
                      className="mt-2"
                      rows={2}
                      value={edit[t]}
                      onChange={(e) => setEdit({ ...edit, [t]: e.target.value })}
                      placeholder="Details (optional)"
                    />
                  ) : null}
                </div>
              ))}
            </fieldset>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await apiPut(`/findings/${row.id}/recommendations`, { items: Object.entries(edit).map(([type, details]) => ({ type, details: details || null })) });
                    toast.success("Recommendations saved.");
                    setEdit(null);
                    await after();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                Save recommendations
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : recs.length ? (
          <ul className="space-y-1 text-sm">
            {recs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-2">
                <Badge tone={r.approved === true ? "success" : r.approved === false ? "neutral" : "info"}>{enumLabel(r.type)}</Badge>
                <span className="text-xs text-muted">{r.approved === true ? "Approved" : r.approved === false ? "Not approved" : "Awaiting decision"}</span>
                {r.details ? <span className="block w-full text-muted">{r.details}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No recommendations yet.</p>
        )}
      </PanelSection>

      <PanelSection
        title="Management decision"
        actions={
          <>
            {editable && !edit ? (
              <ActionButton path={`/findings/${row.id}/submit`} success="Submitted for management decision." onDone={after}>
                <Send className="h-4 w-4" aria-hidden /> Submit for decision
              </ActionButton>
            ) : null}
            {status === "SUBMITTED" && can("DECISIONS", "APPROVE") && row.createdById !== me.id ? (
              <ActionDialog
                label="Record decision"
                icon={<BadgeCheck className="h-4 w-4" aria-hidden />}
                title="Management decision"
                onSubmit={async () => {
                  await post(`/findings/${row.id}/decision`, decision, "Decision recorded.");
                  await after();
                }}
              >
                <Field id="dec-outcome" label="Decision" required>
                  <Select id="dec-outcome" value={decision.outcome} onChange={(e) => setDecision({ ...decision, outcome: e.target.value })}>
                    {enumOptions("DecisionOutcome").map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="dec-date" label="Decision date" required>
                  <Input id="dec-date" type="date" value={decision.decisionDate} onChange={(e) => setDecision({ ...decision, decisionDate: e.target.value })} />
                </Field>
                <fieldset>
                  <legend className="text-sm font-medium">Approved recommendations</legend>
                  {recs.map((r) => (
                    <label key={r.type} className="mt-1 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
                        checked={decision.approvedTypes.includes(r.type)}
                        onChange={(e) => setDecision({ ...decision, approvedTypes: e.target.checked ? [...decision.approvedTypes, r.type] : decision.approvedTypes.filter((x) => x !== r.type) })}
                      />
                      {enumLabel(r.type)}
                    </label>
                  ))}
                </fieldset>
                <Field id="dec-cond" label="Conditions">
                  <Textarea id="dec-cond" value={decision.conditions} onChange={(e) => setDecision({ ...decision, conditions: e.target.value })} />
                </Field>
                <Field id="dec-comments" label="Comments">
                  <Textarea id="dec-comments" value={decision.comments} onChange={(e) => setDecision({ ...decision, comments: e.target.value })} />
                </Field>
              </ActionDialog>
            ) : null}
          </>
        }
      >
        {detail.data?.data.decisions.length ? (
          <ul className="space-y-2 text-sm">
            {detail.data.data.decisions.map((d) => (
              <li key={d.id} className="border-l-2 border-accent/40 pl-3">
                <StatusBadge value={d.outcome} /> by {d.approver} on <DateText value={d.decisionDate} />
                {d.conditions ? <span className="block">Conditions: {d.conditions}</span> : null}
                {d.comments ? <span className="block text-muted">{d.comments}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{status === "SUBMITTED" ? "Awaiting management decision." : "No decision yet."}</p>
        )}
      </PanelSection>
    </div>
  );
}

// ───────────────────── Legal pathways ─────────────────────

export function CriminalMatterPanel({ row }: ExtensionProps) {
  return (
    <div className="space-y-3">
      <ResourceTable resource="criminal-milestones" caseId={caseIdOf(row)} matterId={row.id} title="Police, DCI and DPP milestones" allowModeSwitch={false} defaultPageSize={10} />
      <ResourceTable
        resource="tasks"
        caseId={caseIdOf(row)}
        fixedFilters={{ linkType: "CRIMINAL_MATTER", linkId: row.id }}
        createFixed={{ linkType: "CRIMINAL_MATTER", linkId: row.id, category: "POLICE_FOLLOW_UP" }}
        title="Police, DCI and DPP follow-ups"
        columns={["title", "category", "status", "assigneeId", "dueDate"]}
        allowModeSwitch={false}
        defaultPageSize={10}
      />
      <LinkedEvidence caseId={caseIdOf(row)} linkType="CRIMINAL_MATTER" linkId={row.id} title="Documents handed over and received" />
    </div>
  );
}

export function CivilMatterPanel({ row }: ExtensionProps) {
  return (
    <div className="space-y-3">
      <ResourceTable resource="court-events" caseId={caseIdOf(row)} matterId={row.id} title="Court events" allowModeSwitch={false} defaultPageSize={10} />
      <ResourceTable
        resource="tasks"
        caseId={caseIdOf(row)}
        fixedFilters={{ linkType: "CIVIL_MATTER", linkId: row.id }}
        createFixed={{ linkType: "CIVIL_MATTER", linkId: row.id, category: "ADVOCATE_FOLLOW_UP" }}
        title="Advocate follow-ups"
        columns={["title", "category", "status", "assigneeId", "dueDate"]}
        allowModeSwitch={false}
        defaultPageSize={10}
      />
      <ResourceTable
        resource="recoveries"
        caseId={caseIdOf(row)}
        fixedFilters={{ civilMatterId: row.id }}
        createFixed={{ civilMatterId: row.id }}
        title="Recoveries through this court case"
        allowModeSwitch={false}
        defaultPageSize={10}
      />
      <LinkedEvidence caseId={caseIdOf(row)} linkType="CIVIL_MATTER" linkId={row.id} title="Pleadings, demand letters and correspondence" />
    </div>
  );
}

export function CourtEventPanel({ row }: ExtensionProps) {
  return <LinkedEvidence caseId={caseIdOf(row)} linkType="COURT_EVENT" linkId={row.id} title="Orders, rulings and attachments" defaultCategory="COURT_ORDER" />;
}

export function MilestonePanel({ row }: ExtensionProps) {
  return <LinkedEvidence caseId={caseIdOf(row)} linkType="CRIMINAL_MILESTONE" linkId={row.id} title="Attachments" />;
}

export function DisciplinaryPanel({ row }: ExtensionProps) {
  return <LinkedEvidence caseId={caseIdOf(row)} linkType="DISCIPLINARY" linkId={row.id} title="Show-cause letter, response, hearing minutes and decision" />;
}

export function PartyPanel({ row }: ExtensionProps) {
  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-info/40 bg-info-soft px-3 py-2 text-xs text-info" role="note">
        Recording a person in this case does not imply guilt. The role describes their relationship to the case only.
      </p>
      <ResourceTable
        resource="party-statements"
        caseId={caseIdOf(row)}
        fixedFilters={{ partyId: row.id }}
        createFixed={{ partyId: row.id }}
        title="Statements"
        allowModeSwitch={false}
        defaultPageSize={10}
      />
      <LinkedEvidence caseId={caseIdOf(row)} linkType="PARTY" linkId={row.id} title="Identification and related documents" defaultCategory="IDENTIFICATION_DOCUMENT" />
    </div>
  );
}

export function StatementFilePanel({ row }: ExtensionProps) {
  return (
    <p className="text-sm">
      <Link className="font-medium text-accent underline" href={`/statements/${row.id}`}>
        Open transaction analysis for this statement →
      </Link>
    </p>
  );
}
