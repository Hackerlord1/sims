"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Lock, LockOpen, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { CaseSummary } from "@/components/cases/types";
import { ResourceForm } from "@/components/resources/resource-form";
import type { Row } from "@/components/resources/hooks";
import { useCan } from "@/components/session-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Drawer } from "@/components/ui/dialog";
import { apiPost, errorMessage } from "@/lib/api-client";
import { allowedNextStatuses, type CaseStatus } from "@/lib/case-status";
import { enumLabel } from "@/lib/enums";
import { getResource } from "@/lib/resources/registry";

export function CaseActions({ summary, onChanged }: { summary: CaseSummary; onChanged: () => void }) {
  const c = summary.case;
  const can = useCan();
  const qc = useQueryClient();
  const [target, setTarget] = useState<CaseStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [hold, setHold] = useState(false);
  const next = allowedNextStatuses(c.status as CaseStatus);
  const closed = c.status === "CLOSED";

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["case-summary", c.id] });
    await qc.invalidateQueries({ queryKey: ["list", "cases"] });
    onChanged();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!closed && can("CASES", "EDIT") && next.length ? (
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button variant="secondary" size="sm">
              Change status <ChevronDown className="h-4 w-4" aria-hidden />
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content align="end" sideOffset={6} className="elevated z-50 max-h-80 min-w-64 overflow-y-auto rounded-lg border border-border bg-surface p-1">
              <Menu.Label className="px-2 py-1 text-xs text-muted">Move case to…</Menu.Label>
              {next.map((s) => (
                <Menu.Item key={s} onSelect={() => setTarget(s)} className="cursor-pointer rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2">
                  {enumLabel(s)}
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
      {can("CASES", "APPROVE") ? (
        <Button variant="secondary" size="sm" onClick={() => setHold(true)}>
          {c.legalHold ? <LockOpen className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
          {c.legalHold ? "Release legal hold" : "Legal hold"}
        </Button>
      ) : null}
      {!closed && can("CASES", "EDIT") ? (
        <Button size="sm" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" aria-hidden /> Edit case
        </Button>
      ) : null}

      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Move case to “${target ? enumLabel(target) : ""}”?`}
        description="The change is recorded in the status history and audit log."
        confirmLabel="Change status"
        requireReason
        reasonLabel="Reason"
        onConfirm={async (reason) => {
          try {
            await apiPost(`/cases/${c.id}/status`, { status: target, reason });
          } catch (e) {
            throw new Error(errorMessage(e));
          }
          toast.success(`Status changed to ${enumLabel(target!)}.`);
          await refresh();
        }}
      />
      <ConfirmDialog
        open={hold}
        onOpenChange={setHold}
        title={c.legalHold ? "Release the legal hold?" : "Place this case under legal hold?"}
        description={c.legalHold ? "Records become eligible for deletion again under the normal rules." : "While on hold, no record in this case can be deleted or permanently removed."}
        confirmLabel={c.legalHold ? "Release hold" : "Place on hold"}
        requireReason
        onConfirm={async (reason) => {
          try {
            await apiPost(`/cases/${c.id}/legal-hold`, { on: !c.legalHold, reason });
          } catch (e) {
            throw new Error(errorMessage(e));
          }
          toast.success(c.legalHold ? "Legal hold released." : "Legal hold placed.");
          await refresh();
        }}
      />
      <Drawer open={editing} onOpenChange={setEditing} title={`Edit ${c.reference}`} width="xl">
        {editing ? (
          <ResourceForm
            resource={getResource("cases")!}
            row={c as unknown as Row}
            onCancel={() => setEditing(false)}
            onSaved={async () => {
              setEditing(false);
              await refresh();
            }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
