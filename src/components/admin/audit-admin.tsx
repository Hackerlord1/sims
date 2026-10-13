"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AuditTrail } from "@/components/admin/audit-trail";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DateText, PageHeader } from "@/components/ui/display";
import { apiGet, apiPost, errorMessage } from "@/lib/api-client";
import { enumLabel } from "@/lib/enums";

interface Alert {
  id: string;
  type: string;
  severity: string;
  message: string;
  createdAt: string;
}

export function AuditAdmin() {
  const alerts = useQuery({ queryKey: ["security-alerts"], queryFn: ({ signal }) => apiGet<Alert[]>("/security-alerts", undefined, signal) });
  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Immutable record of sign-ins, changes, approvals, uploads, downloads, exports, imports, analysis, match confirmations, permission and legal-hold changes. Entries cannot be edited or deleted."
      />
      {alerts.data?.data.length ? (
        <Card title="Unacknowledged security alerts" className="mb-5">
          <ul className="divide-y divide-border text-sm">
            {alerts.data.data.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                  <span>
                    <StatusBadge value={a.severity} /> <strong>{enumLabel(a.type)}</strong> — {a.message}
                    <span className="block text-xs text-muted">
                      <DateText value={a.createdAt} withTime />
                    </span>
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await apiPost(`/security-alerts/${a.id}/acknowledge`);
                      await alerts.refetch();
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                >
                  Acknowledge
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <AuditTrail />
    </>
  );
}
