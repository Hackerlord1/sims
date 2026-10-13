"use client";

import { ACTION_LABELS, ACTIONS, denialKey, MODULE_LABELS, MODULES, roleAllows, type Action, type Module, type Role } from "@/lib/permissions";
import { cn } from "@/lib/cn";

/**
 * Per-user restrictions on top of a role. Every permission the role grants is listed and ticked;
 * unticking one restricts it. Nothing here can grant more than the role allows, and removing View
 * removes the whole module.
 */
export function AccessEditor({
  role,
  denials,
  onDenialsChange,
  dataApprover,
  onDataApproverChange,
  disabled,
}: {
  role: Role;
  denials: string[];
  onDenialsChange: (v: string[]) => void;
  dataApprover: boolean;
  onDataApproverChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  if (role === "SYSTEM_ADMIN") {
    return (
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">What they can view and edit</legend>
        <p className="text-xs text-muted">System administrators always have the full administrator permissions and can approve data changes. Restrictions do not apply to them.</p>
      </fieldset>
    );
  }
  const modules = MODULES.filter((m) => roleAllows(role, m, "VIEW"));
  const set = new Set(denials);
  const toggle = (m: Module, a: Action, allowed: boolean) => {
    const next = new Set(set);
    if (allowed) next.delete(denialKey(m, a));
    else next.add(denialKey(m, a));
    onDenialsChange([...next].sort());
  };
  const restricted = denials.length;
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium">What they can view and edit</legend>
      <p className="text-xs text-muted">
        The role sets the most this person can do. Untick anything they should not have.{" "}
        {restricted ? <strong className="text-warning">{restricted} restriction(s) set.</strong> : "No restrictions — the full role applies."}
      </p>
      <div className="max-h-72 overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <caption className="sr-only">Permissions granted by the role, per module</caption>
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              <th scope="col" className="p-2 text-left">
                Module
              </th>
              <th scope="col" className="p-2 text-left">
                Allowed actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {modules.map((m) => {
              const actions = ACTIONS.filter((a) => roleAllows(role, m, a));
              const viewDenied = set.has(denialKey(m, "VIEW"));
              return (
                <tr key={m} className={cn(viewDenied && "bg-danger-soft/40")}>
                  <th scope="row" className="p-2 text-left align-top font-medium">
                    {MODULE_LABELS[m]}
                  </th>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {actions.map((a) => {
                        const allowed = !set.has(denialKey(m, a)) && !(a !== "VIEW" && viewDenied);
                        return (
                          <label key={a} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", a !== "VIEW" && viewDenied && "opacity-40")}>
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-[var(--accent)]"
                              checked={allowed}
                              disabled={a !== "VIEW" && viewDenied}
                              onChange={(e) => toggle(m, a, e.target.checked)}
                            />
                            {ACTION_LABELS[a]}
                          </label>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={dataApprover} onChange={(e) => onDataApproverChange(e.target.checked)} />
        <span>
          Can approve other people&apos;s data changes
          <span className="block text-xs text-muted">For record types that need approval (System settings). They can never approve their own changes, and only on cases they can see.</span>
        </span>
      </label>
    </fieldset>
  );
}
