"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { AsyncSelect } from "@/components/resources/async-select";
import type { Row } from "@/components/resources/hooks";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/field";
import { apiPatch, apiPost, ApiClientError, errorMessage } from "@/lib/api-client";
import { enumOptions } from "@/lib/enums";
import { createSchema, updateSchema } from "@/lib/resources/schema";
import { editableFields, type FieldDef, type ResourceDef } from "@/lib/resources/types";
import { cn } from "@/lib/cn";

type Values = Record<string, unknown>;

const nairobiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" });
const nairobiTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit", hour12: false });

function toInputValue(f: FieldDef, v: unknown): unknown {
  if (v === null || v === undefined) return f.type === "boolean" ? false : "";
  if (f.type === "date" && typeof v === "string") return nairobiDate.format(new Date(v));
  if (f.type === "datetime" && typeof v === "string") {
    const d = new Date(v);
    return `${nairobiDate.format(d)}T${nairobiTime.format(d)}`;
  }
  if (f.type === "boolean") return Boolean(v);
  return String(v);
}

export function defaultValuesFor(r: ResourceDef, row?: Row | null, extra: Values = {}): Values {
  const values: Values = {};
  for (const f of editableFields(r)) {
    values[f.name] = row ? toInputValue(f, row[f.name]) : (f.defaultValue ?? (f.type === "boolean" ? false : ""));
  }
  return { ...values, ...extra };
}

export function ResourceForm({
  resource,
  row,
  caseId,
  fixed = {},
  onSaved,
  onCancel,
  submitLabel,
  hideFields = [],
}: {
  resource: ResourceDef;
  row?: Row | null;
  caseId?: string;
  /** Values set by context (e.g. matterId, linkType) and not shown as inputs. */
  fixed?: Values;
  onSaved?: (row: Row) => void;
  onCancel?: () => void;
  submitLabel?: string;
  hideFields?: string[];
}) {
  const qc = useQueryClient();
  const editing = Boolean(row);
  const [formError, setFormError] = useState<string | null>(null);
  const fields = useMemo(() => editableFields(resource).filter((f) => !hideFields.includes(f.name) && !(f.name in fixed)), [resource, hideFields, fixed]);
  const schema = useMemo(() => (editing ? updateSchema(resource) : createSchema(resource, { requireCase: resource.scope === "case" && resource.key !== "cases" })), [editing, resource]);

  const form = useForm<Values>({
    defaultValues: defaultValuesFor(resource, row, { ...(caseId && !editing ? { caseId } : {}), ...fixed }),
    // Validate with the shared schema but submit the user's raw values; the server parses them again.
    resolver: zodResolver(schema as never, undefined, { raw: true }) as unknown as Resolver<Values>,
    mode: "onTouched",
  });
  const { register, handleSubmit, control, formState, setError } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      let saved: Row & { pendingApproval?: boolean; message?: string };
      if (editing) {
        const dirty = Object.keys(formState.dirtyFields);
        const patch: Values = Object.fromEntries(dirty.map((k) => [k, values[k]]));
        if (!dirty.length) {
          onCancel?.();
          return;
        }
        patch.version = row!.version;
        saved = (await apiPatch<Row>(`/${resource.key}/${row!.id}`, patch)).data;
      } else {
        saved = (await apiPost<Row>(`/${resource.key}`, values)).data;
      }
      if (saved.pendingApproval) {
        // Held for data-change approval: nothing changed yet, so the form closes without a new row.
        toast.success("Submitted for approval", { description: saved.message });
        await qc.invalidateQueries({ queryKey: ["change-requests"] });
        onCancel?.();
        return;
      }
      toast.success(`${resource.label} ${editing ? "updated" : "created"}.`);
      await qc.invalidateQueries({ queryKey: ["list", resource.key] });
      await qc.invalidateQueries({ queryKey: ["row", resource.key] });
      await qc.invalidateQueries({ queryKey: ["case-summary"] });
      onSaved?.(saved);
    } catch (e) {
      if (e instanceof ApiClientError && Object.keys(e.fields).length) {
        for (const [k, msg] of Object.entries(e.fields)) setError(k, { message: msg });
      }
      setFormError(errorMessage(e));
    }
  });

  const sections = useMemo(() => {
    const out = new Map<string, FieldDef[]>();
    for (const f of fields) {
      const s = f.section ?? "";
      out.set(s, [...(out.get(s) ?? []), f]);
    }
    return [...out.entries()];
  }, [fields]);

  const inputFor = (f: FieldDef) => {
    const id = `f-${resource.key}-${f.name}`;
    const err = errors[f.name]?.message;
    const aria = { "aria-invalid": err ? true : undefined, "aria-describedby": err ? `${id}-error` : f.help ? `${id}-hint` : undefined } as const;
    let control_: React.ReactNode;
    switch (f.type) {
      case "textarea":
        control_ = <Textarea id={id} {...register(f.name)} {...aria} rows={f.max && f.max > 2000 ? 4 : 3} />;
        break;
      case "money":
        control_ = (
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted" aria-hidden>
              {String(row?.currency ?? (row?.case as Row | undefined)?.currency ?? "KES")}
            </span>
            <Input id={id} inputMode="decimal" className="ref tabular pl-12" autoComplete="off" {...register(f.name)} {...aria} />
          </div>
        );
        break;
      case "number":
        control_ = <Input id={id} type="number" min={0} {...register(f.name)} {...aria} />;
        break;
      case "date":
        control_ = <Input id={id} type="date" {...register(f.name)} {...aria} />;
        break;
      case "datetime":
        control_ = <Input id={id} type="datetime-local" {...register(f.name)} {...aria} />;
        break;
      case "email":
        control_ = <Input id={id} type="email" autoComplete="off" {...register(f.name)} {...aria} />;
        break;
      case "enum":
        control_ = (
          <Select id={id} {...register(f.name)} {...aria}>
            {!f.required ? <option value="">— Not set —</option> : <option value="">Select…</option>}
            {enumOptions(f.enum!).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        );
        break;
      case "boolean":
        control_ = (
          <label className="flex h-10 items-center gap-2 text-sm">
            <input id={id} type="checkbox" className="h-4 w-4 accent-[var(--accent)]" {...register(f.name)} {...aria} />
            Yes
          </label>
        );
        break;
      case "user":
      case "relation":
      case "company":
      case "branch": {
        const path = f.type === "user" ? "/options/users" : f.type === "company" ? "/options/companies" : f.type === "branch" ? "/options/branches" : `/options/records/${f.relation}`;
        control_ = (
          <Controller
            control={control}
            name={f.name}
            render={({ field }) => (
              <AsyncSelect
                id={id}
                path={path}
                params={
                  f.type === "relation" ? { caseId: caseId ?? (row?.caseId as string | undefined) } : f.type === "branch" ? { companyId: (form.getValues("companyId") as string) || undefined } : {}
                }
                value={(field.value as string) || null}
                valueLabel={row?._labels?.[f.name]}
                onChange={(v) => field.onChange(v ?? "")}
                invalid={Boolean(err)}
                describedBy={aria["aria-describedby"]}
              />
            )}
          />
        );
        break;
      }
      default:
        control_ = <Input id={id} className={cn(f.mono && "ref")} maxLength={f.max} autoComplete="off" {...register(f.name)} {...aria} />;
    }
    return (
      <Field key={f.name} id={id} label={f.label} required={f.required} error={err} hint={f.help} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
        {control_}
      </Field>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label={`${editing ? "Edit" : "New"} ${resource.label.toLowerCase()}`}>
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      {resource.description ? <FormAlert tone="info">{resource.description}</FormAlert> : null}
      {sections.map(([section, fs]) => (
        <fieldset key={section || "main"} className="space-y-3">
          {section ? <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{section}</legend> : null}
          <div className="grid gap-4 sm:grid-cols-2">{fs.map(inputFor)}</div>
        </fieldset>
      ))}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={formState.isSubmitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={formState.isSubmitting}>
          {submitLabel ?? (editing ? "Save changes" : `Create ${resource.label.toLowerCase()}`)}
        </Button>
      </div>
    </form>
  );
}
