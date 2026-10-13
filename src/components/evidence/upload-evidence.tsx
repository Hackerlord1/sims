"use client";

import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FileUp, UploadCloud } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { AsyncSelect } from "@/components/resources/async-select";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/field";
import { ApiClientError, errorMessage, uploadWithProgress } from "@/lib/api-client";
import { enumOptions } from "@/lib/enums";
import { cn } from "@/lib/cn";

export const EVIDENCE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff,.txt,.csv,.xlsx,.docx,.zip,.eml,.msg,.mp3,.m4a,.wav,.mp4";

export function DropZone({ file, onFile, accept, label = "Drop a file here or choose one" }: { file: File | null; onFile: (f: File | null) => void; accept: string; label?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
        over ? "border-accent bg-accent-soft" : "border-border-strong bg-surface-2",
      )}
    >
      <UploadCloud className="h-8 w-8 text-muted" aria-hidden />
      {file ? (
        <p className="text-sm">
          <span className="font-medium">{file.name}</span> <span className="text-muted">({(file.size / 1024).toFixed(0)} KB)</span>
        </p>
      ) : (
        <p className="text-sm text-muted">{label}</p>
      )}
      <input id={id} ref={input} type="file" className="sr-only" accept={accept} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()}>
        <FileUp className="h-4 w-4" aria-hidden /> {file ? "Choose a different file" : "Choose file"}
      </Button>
      <label htmlFor={id} className="sr-only">
        File to upload
      </label>
    </div>
  );
}

export function UploadProgress({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  return (
    <div className="space-y-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Upload progress">
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <motion.div className="h-full bg-accent" initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.2 }} />
      </div>
      <p className="text-xs text-muted">{percent < 100 ? `Uploading… ${percent}%` : "Processing and hashing…"}</p>
    </div>
  );
}

export function UploadEvidenceDialog({
  open,
  onOpenChange,
  caseId,
  linkType,
  linkId,
  defaultCategory = "DOCUMENT",
  title: dialogTitle = "Upload evidence",
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  caseId: string;
  linkType?: string;
  linkId?: string;
  defaultCategory?: string;
  title?: string;
  onUploaded?: (e: { id: string; reference: string }) => void;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState({ title: "", category: defaultCategory, subFileId: "", source: "", provider: "", dateReceived: "", confidentiality: "CONFIDENTIAL", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const set = (k: keyof typeof fields, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setFile(null);
    setFields({ title: "", category: defaultCategory, subFileId: "", source: "", provider: "", dateReceived: "", confidentiality: "CONFIDENTIAL", notes: "" });
    setErrors({});
    setError(null);
    setPercent(null);
  };

  const submit = async () => {
    setError(null);
    const errs: Record<string, string> = {};
    if (!file) errs.file = "Choose a file.";
    if (!fields.title.trim()) errs.title = "Enter a title.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const form = new FormData();
    form.set("file", file!);
    form.set("caseId", caseId);
    for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);
    if (linkType && linkId) {
      form.set("linkType", linkType);
      form.set("linkId", linkId);
    }
    setPercent(0);
    try {
      const res = await uploadWithProgress<{ id: string; reference: string; sha256: string }>("/evidence/upload", form, setPercent);
      toast.success(`Evidence ${res.data.reference} uploaded. SHA-256 recorded.`);
      await qc.invalidateQueries({ queryKey: ["list"] });
      await qc.invalidateQueries({ queryKey: ["linked-evidence"] });
      await qc.invalidateQueries({ queryKey: ["case-summary"] });
      onUploaded?.(res.data);
      reset();
      onOpenChange(false);
    } catch (e) {
      setPercent(null);
      if (e instanceof ApiClientError) setErrors(e.fields);
      setError(errorMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title={dialogTitle}
      description="The original file is preserved unchanged with its SHA-256 hash. A separate working copy is created for review."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={percent !== null}>
            Cancel
          </Button>
          <Button onClick={submit} loading={percent !== null}>
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field id="ev-file" label="File" required error={errors.file}>
          <DropZone
            file={file}
            onFile={(f) => {
              setFile(f);
              if (f && !fields.title) set("title", f.name.replace(/\.[^.]+$/, ""));
            }}
            accept={EVIDENCE_ACCEPT}
          />
        </Field>
        <UploadProgress percent={percent} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ev-title" label="Title" required error={errors.title}>
            <Input id="ev-title" value={fields.title} onChange={(e) => set("title", e.target.value)} maxLength={300} />
          </Field>
          <Field id="ev-category" label="Category" required error={errors.category}>
            <Select id="ev-category" value={fields.category} onChange={(e) => set("category", e.target.value)}>
              {enumOptions("EvidenceCategory").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="ev-subfile" label="Sub-file">
            <AsyncSelect id="ev-subfile" path="/options/records/subfiles" params={{ caseId }} value={fields.subFileId || null} onChange={(v) => set("subFileId", v ?? "")} />
          </Field>
          <Field id="ev-conf" label="Confidentiality">
            <Select id="ev-conf" value={fields.confidentiality} onChange={(e) => set("confidentiality", e.target.value)}>
              {enumOptions("Confidentiality").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="ev-source" label="Source">
            <Input id="ev-source" value={fields.source} onChange={(e) => set("source", e.target.value)} maxLength={300} />
          </Field>
          <Field id="ev-provider" label="Provider">
            <Input id="ev-provider" value={fields.provider} onChange={(e) => set("provider", e.target.value)} maxLength={300} />
          </Field>
          <Field id="ev-date" label="Date received">
            <Input id="ev-date" type="date" value={fields.dateReceived} onChange={(e) => set("dateReceived", e.target.value)} />
          </Field>
        </div>
        <Field id="ev-notes" label="Notes">
          <Textarea id="ev-notes" value={fields.notes} onChange={(e) => set("notes", e.target.value)} maxLength={20000} />
        </Field>
      </div>
    </Modal>
  );
}
