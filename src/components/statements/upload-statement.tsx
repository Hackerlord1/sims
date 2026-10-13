"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DropZone, UploadProgress } from "@/components/evidence/upload-evidence";
import { AsyncSelect } from "@/components/resources/async-select";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select } from "@/components/ui/field";
import { ApiClientError, errorMessage, uploadWithProgress } from "@/lib/api-client";
import { enumOptions } from "@/lib/enums";

const EMPTY = {
  ownerName: "",
  relatedPartyId: "",
  institutionType: "MPESA",
  institution: "",
  accountType: "",
  account: "",
  periodStart: "",
  periodEnd: "",
  currency: "KES",
  source: "",
  dateReceived: "",
  processingAuthority: "",
  format: "CSV",
  subFileId: "",
};

export function UploadStatementDialog({
  open,
  onOpenChange,
  caseId: fixedCaseId,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  caseId?: string;
  onUploaded?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [caseId, setCaseId] = useState<string | null>(fixedCaseId ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const set = (k: keyof typeof EMPTY, v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setError(null);
    const errs: Record<string, string> = {};
    if (!caseId) errs.caseId = "Choose the case.";
    if (!file) errs.file = "Choose the statement file.";
    for (const k of ["ownerName", "institution", "account", "processingAuthority"] as const) if (!f[k].trim()) errs[k] = "Required.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const form = new FormData();
    form.set("file", file!);
    form.set("caseId", caseId!);
    for (const [k, v] of Object.entries(f)) if (v) form.set(k, v);
    setPercent(0);
    try {
      const res = await uploadWithProgress<{ id: string; reference: string }>("/financial-statements/upload", form, setPercent);
      toast.success(`Statement ${res.data.reference} uploaded. Parsing runs in the background.`);
      await qc.invalidateQueries({ queryKey: ["list"] });
      setFile(null);
      setF(EMPTY);
      setPercent(null);
      onOpenChange(false);
      onUploaded?.(res.data.id);
    } catch (e) {
      setPercent(null);
      if (e instanceof ApiClientError) setErrors(e.fields);
      setError(errorMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Upload bank or M-Pesa statement"
      description="The original file is preserved unchanged with its SHA-256 hash. Parsing and analysis run in the background on a copy."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={percent !== null}>
            Cancel
          </Button>
          <Button onClick={submit} loading={percent !== null}>
            Upload statement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        {!fixedCaseId ? (
          <Field id="st-case" label="Case" required error={errors.caseId}>
            <AsyncSelect id="st-case" path="/options/records/cases" value={caseId} onChange={setCaseId} />
          </Field>
        ) : null}
        <Field id="st-file" label="Statement file (PDF, CSV or XLSX)" required error={errors.file}>
          <DropZone
            file={file}
            accept=".pdf,.csv,.xlsx"
            onFile={(x) => {
              setFile(x);
              const ext = x?.name.split(".").pop()?.toLowerCase();
              if (ext === "csv") set("format", "CSV");
              else if (ext === "xlsx") set("format", "XLSX");
              else if (ext === "pdf" && !f.format.includes("PDF")) set("format", f.institutionType === "MPESA" ? "MPESA_PDF" : "BANK_PDF");
            }}
          />
        </Field>
        <UploadProgress percent={percent} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="st-owner" label="Statement owner" required error={errors.ownerName}>
            <Input id="st-owner" value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
          </Field>
          <Field id="st-party" label="Related person (party)">
            <AsyncSelect
              id="st-party"
              path="/options/records/parties"
              params={{ caseId: caseId ?? undefined }}
              value={f.relatedPartyId || null}
              onChange={(v) => set("relatedPartyId", v ?? "")}
              disabled={!caseId}
            />
          </Field>
          <Field id="st-itype" label="Institution type" required>
            <Select id="st-itype" value={f.institutionType} onChange={(e) => set("institutionType", e.target.value)}>
              {enumOptions("InstitutionType").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="st-inst" label="Bank, M-Pesa or institution" required error={errors.institution}>
            <Input id="st-inst" value={f.institution} onChange={(e) => set("institution", e.target.value)} />
          </Field>
          <Field id="st-acc" label="Account or telephone number" required error={errors.account} hint="Only a masked form (last four digits) is stored.">
            <Input id="st-acc" className="ref" value={f.account} onChange={(e) => set("account", e.target.value)} autoComplete="off" />
          </Field>
          <Field id="st-atype" label="Account type">
            <Input id="st-atype" value={f.accountType} onChange={(e) => set("accountType", e.target.value)} />
          </Field>
          <Field id="st-format" label="Format" required>
            <Select id="st-format" value={f.format} onChange={(e) => set("format", e.target.value)}>
              {enumOptions("StatementFormat").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="st-cur" label="Currency">
            <Input id="st-cur" maxLength={3} value={f.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
          </Field>
          <Field id="st-from" label="Statement start date">
            <Input id="st-from" type="date" value={f.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
          </Field>
          <Field id="st-to" label="Statement end date">
            <Input id="st-to" type="date" value={f.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} />
          </Field>
          <Field id="st-source" label="Source">
            <Input id="st-source" value={f.source} onChange={(e) => set("source", e.target.value)} />
          </Field>
          <Field id="st-received" label="Date received">
            <Input id="st-received" type="date" value={f.dateReceived} onChange={(e) => set("dateReceived", e.target.value)} />
          </Field>
        </div>
        <Field id="st-auth" label="Authority for processing" required error={errors.processingAuthority} hint="e.g. court order reference, customer consent or management authorisation.">
          <Input id="st-auth" value={f.processingAuthority} onChange={(e) => set("processingAuthority", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
