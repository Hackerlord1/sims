"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/field";
import { apiPost, errorMessage } from "@/lib/api-client";

/** Calls a workflow endpoint and refreshes the record; failures are shown as toasts. */
export function ActionButton({
  path,
  body,
  success,
  onDone,
  children,
  ...props
}: { path: string; body?: unknown; success: string; onDone: () => Promise<void> | void; children: ReactNode } & Omit<ButtonProps, "onClick">) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      {...props}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await apiPost(path, body ?? {});
          toast.success(success);
          await onDone();
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </Button>
  );
}

/** A workflow action that collects input in a dialog first. */
export function ActionDialog({
  label,
  title,
  description,
  children,
  submitLabel = "Confirm",
  onSubmit,
  variant = "primary",
  icon,
}: {
  label: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  submitLabel?: string;
  onSubmit: () => Promise<void>;
  variant?: ButtonProps["variant"];
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        {icon}
        {label}
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError(null);
        }}
        title={title}
        description={description}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              variant={variant === "danger" ? "danger" : "primary"}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onSubmit();
                  setOpen(false);
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {submitLabel}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          {children}
        </div>
      </Modal>
    </>
  );
}

export function PanelSection({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {actions ? <div className="flex flex-wrap gap-1.5">{actions}</div> : null}
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </section>
  );
}

export const post = async (path: string, body: unknown, success: string) => {
  await apiPost(path, body);
  toast.success(success);
};
