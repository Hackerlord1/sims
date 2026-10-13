"use client";

import * as D from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";

const overlay = (
  <D.Overlay asChild forceMount>
    <motion.div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
  </D.Overlay>
);

/**
 * Returns focus to whatever was focused when the dialog opened. Radix only does this for a
 * `Dialog.Trigger`; our dialogs are opened programmatically, so without this focus falls to <body>.
 */
export function useReturnFocus() {
  const returnTo = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      const active = document.activeElement;
      returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
    },
    onCloseAutoFocus: (event: Event) => {
      const el = returnTo.current;
      if (el?.isConnected) {
        event.preventDefault();
        el.focus();
      }
    },
  };
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const returnFocus = useReturnFocus();
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <D.Portal forceMount>
            {overlay}
            <D.Content asChild forceMount {...returnFocus}>
              <motion.div
                className={cn(
                  "elevated fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface",
                  widths[size],
                )}
                initial={{ opacity: 0, scale: 0.97, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div className="panel-header flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                  <div className="min-w-0">
                    <D.Title className="text-base font-semibold">{title}</D.Title>
                    {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">Dialog</D.Description>}
                  </div>
                  <D.Close className="rounded-md p-1 text-muted transition-[color,background-color,transform] duration-200 hover:rotate-90 hover:bg-surface-2 hover:text-text" aria-label="Close">
                    <X className="h-5 w-5" aria-hidden />
                  </D.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
              </motion.div>
            </D.Content>
          </D.Portal>
        ) : null}
      </AnimatePresence>
    </D.Root>
  );
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "lg",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg" | "xl";
}) {
  const returnFocus = useReturnFocus();
  const widths = { md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <D.Portal forceMount>
            {overlay}
            <D.Content asChild forceMount {...returnFocus}>
              <motion.div
                className={cn("elevated fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface", widths[width])}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <div className="panel-header flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                  <div className="min-w-0">
                    <D.Title className="text-base font-semibold break-words">{title}</D.Title>
                    {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">Details panel</D.Description>}
                  </div>
                  <D.Close className="rounded-md p-1 text-muted transition-[color,background-color,transform] duration-200 hover:rotate-90 hover:bg-surface-2 hover:text-text" aria-label="Close panel">
                    <X className="h-5 w-5" aria-hidden />
                  </D.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
              </motion.div>
            </D.Content>
          </D.Portal>
        ) : null}
      </AnimatePresence>
    </D.Root>
  );
}

/** Confirmation with an optional mandatory reason (deletions, restorations, rejections). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  requireReason,
  reasonLabel = "Reason",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  requireReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (requireReason && reason.trim().length < 3) {
      setReasonError("Enter a reason of at least 3 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    setReasonError(null);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          setReasonError(null);
          setReason("");
        }
        onOpenChange(o);
      }}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <FormAlert>{error}</FormAlert> : null}
        {requireReason ? (
          <Field id={`${id}-reason`} label={reasonLabel} required error={reasonError ?? undefined}>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              autoFocus
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? `${id}-reason-error` : undefined}
            />
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}
