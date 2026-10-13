"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/components/session-context";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/display";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { LoadingRows } from "@/components/ui/states";
import { apiGet, apiPut, ApiClientError, errorMessage } from "@/lib/api-client";
import { APPROVABLE_RESOURCE_KEYS, RESOURCE_MAP } from "@/lib/resources/registry";

interface Setting {
  key: string;
  label: string;
  value: string | number | string[];
  default: string | number | string[];
}

/** Record types that can be put behind data-change approval, grouped as in the navigation. */
function RecordTypePicker({ id, value, onChange, disabled }: { id: string; value: string[]; onChange: (v: string[]) => void; disabled: boolean }) {
  const set = new Set(value);
  return (
    <fieldset id={id} className="rounded-md border border-border p-3" disabled={disabled}>
      <legend className="sr-only">Record types that need approval</legend>
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {APPROVABLE_RESOURCE_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={set.has(k)}
              onChange={(e) => {
                const next = new Set(set);
                if (e.target.checked) next.add(k);
                else next.delete(k);
                onChange(APPROVABLE_RESOURCE_KEYS.filter((x) => next.has(x)));
              }}
            />
            {RESOURCE_MAP[k]!.plural}
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {set.size ? `${set.size} type(s) need approval.` : "Nothing needs approval — changes take effect immediately."} Workflow steps that already have their own approval (expense approval, recovery
        verification, decisions, write-offs) are unaffected.
      </p>
    </fieldset>
  );
}

export function SettingsAdmin() {
  const can = useCan();
  const { data, refetch } = useQuery({ queryKey: ["settings"], queryFn: ({ signal }) => apiGet<Setting[]>("/settings", undefined, signal) });
  const [draft, setDraft] = useState<Record<string, string | string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = can("SETTINGS", "MANAGE_SETTINGS");
  return (
    <>
      <PageHeader title="System settings" description="Currency, reminder thresholds, retention periods, approval thresholds and upload limits. Every change is audited." />
      <Card className="max-w-3xl">
        {!data ? (
          <LoadingRows />
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              setErrors({});
              try {
                await apiPut("/settings", draft);
                toast.success("Settings saved.");
                setDraft({});
                await refetch();
              } catch (err) {
                if (err instanceof ApiClientError) setErrors(err.fields);
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {error ? <FormAlert>{error}</FormAlert> : null}
            {data.data.map((s) =>
              Array.isArray(s.value) ? (
                <Field key={s.key} id={`set-${s.key}`} label={s.label} error={errors[s.key]}>
                  <RecordTypePicker id={`set-${s.key}`} value={(draft[s.key] as string[] | undefined) ?? s.value} disabled={!editable} onChange={(v) => setDraft({ ...draft, [s.key]: v })} />
                </Field>
              ) : (
                <Field key={s.key} id={`set-${s.key}`} label={s.label} hint={`Default: ${s.default}`} error={errors[s.key]}>
                  <Input
                    id={`set-${s.key}`}
                    className="ref max-w-xs"
                    value={(draft[s.key] as string | undefined) ?? String(s.value)}
                    disabled={!editable}
                    onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}
                  />
                </Field>
              ),
            )}
            {editable ? (
              <Button type="submit" loading={busy} disabled={!Object.keys(draft).length}>
                Save settings
              </Button>
            ) : (
              <p className="text-sm text-muted">You can view settings but not change them.</p>
            )}
          </form>
        )}
      </Card>
    </>
  );
}
