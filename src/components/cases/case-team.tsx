"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AsyncSelect } from "@/components/resources/async-select";
import { useCan } from "@/components/session-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { Field, FormAlert, Select } from "@/components/ui/field";
import { ErrorState, LoadingRows } from "@/components/ui/states";
import { apiGet, apiPost, errorMessage } from "@/lib/api-client";
import { enumLabel, enumOptions } from "@/lib/enums";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

interface Assignment {
  id: string;
  role: string;
  user: { id: string; fullName: string; role: Role };
}

export function CaseTeam({ caseId, closed, onChanged }: { caseId: string; closed: boolean; onChanged: () => void }) {
  const can = useCan();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState("SUPPORTING");
  const [error, setError] = useState<string | null>(null);
  const {
    data,
    isLoading,
    isError,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: ["assignments", caseId],
    queryFn: ({ signal }) => apiGet<Assignment[]>(`/cases/${caseId}/assignments`, undefined, signal),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["assignments", caseId] });
    onChanged();
  };
  const add = useMutation({
    mutationFn: () => apiPost(`/cases/${caseId}/assignments`, { userId, role }),
    onSuccess: () => {
      toast.success("Team member added.");
      setUserId(null);
      setError(null);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const end = useMutation({
    mutationFn: (id: string) => apiPost(`/cases/${caseId}/assignments/${id}/end`),
    onSuccess: () => {
      toast.success("Team member removed.");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const editable = !closed && can("CASES", "EDIT");

  return (
    <Card title="Case team" id="team">
      {isError ? (
        <ErrorState message={errorMessage(loadError)} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingRows rows={3} />
      ) : (
        <ul className="divide-y divide-border text-sm">
          {(data?.data ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{a.user.fullName}</span>
                <span className="block text-xs text-muted">
                  {enumLabel(a.role)} · {ROLE_LABELS[a.user.role]}
                </span>
              </span>
              {editable ? (
                <Button variant="ghost" size="icon" aria-label={`Remove ${a.user.fullName} from the case`} onClick={() => end.mutate(a.id)} disabled={end.isPending}>
                  <UserMinus className="h-4 w-4" aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
          {!data?.data.length ? <li className="py-2 text-muted">No team members assigned.</li> : null}
        </ul>
      )}
      {editable ? (
        <form
          className="mt-3 space-y-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!userId) return setError("Choose a user.");
            add.mutate();
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field id="team-user" label="Add team member">
            <AsyncSelect id="team-user" path="/options/users" value={userId} onChange={setUserId} />
          </Field>
          <Field id="team-role" label="Role on the case">
            <Select id="team-role" value={role} onChange={(e) => setRole(e.target.value)}>
              {enumOptions("CaseAssignmentRole").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" size="sm" loading={add.isPending}>
            <UserPlus className="h-4 w-4" aria-hidden /> Add to case
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
