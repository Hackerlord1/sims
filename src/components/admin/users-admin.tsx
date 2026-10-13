"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { KeyRound, LockOpen, Pencil, ShieldOff, UserPlus } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { useDebounced } from "@/components/resources/hooks";
import { useCan, useSession } from "@/components/session-context";
import { Badge, DemoBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DateText, PageHeader, Ref, ScrollRegion } from "@/components/ui/display";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select } from "@/components/ui/field";
import { EmptyState, LoadingRows } from "@/components/ui/states";
import { apiGet, apiPatch, apiPost, apiPut, ApiClientError, errorMessage } from "@/lib/api-client";
import { AccessEditor } from "@/components/admin/access-editor";
import { AccessRequests } from "@/components/admin/access-requests";
import { enumOptions } from "@/lib/enums";
import { ACTION_LABELS, ACTIONS, MODULE_LABELS, MODULES, ROLE_LABELS, ROLES, type Action, type Module, type Role } from "@/lib/permissions";

interface UserRow {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: Role;
  status: string;
  clearance: string;
  telephone: string | null;
  jobTitle: string | null;
  employeeNumber: string | null;
  
  mfaEnabled: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  isDemo: boolean;
  version: number;
  permissionDenials: string[];
  dataApprover: boolean;
  scopes: { companyId: string; branchId: string | null; company: { name: string }; branch: { name: string } | null }[];
}
export interface AccessRequestRow {
  id: string;
  reference: string;
  fullName: string;
  username: string | null;
  email: string | null;
  telephone: string | null;
  employeeNumber: string | null;
  jobTitle: string | null;
  unit: string | null;
  requestedRole: Role | null;
  justification: string | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decisionComment: string | null;
}

/** Suggested username from the work email, e.g. jane.doe@savemore.co.ke → jane.doe */
const suggestUsername = (email: string) =>
  email
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 40);
interface Option {
  value: string;
  label: string;
}

function ScopeEditor({ value, onChange }: { value: { companyId: string; branchId: string | null }[]; onChange: (v: { companyId: string; branchId: string | null }[]) => void }) {
  const companies = useQuery({ queryKey: ["options", "companies-all"], queryFn: ({ signal }) => apiGet<Option[]>("/options/companies", undefined, signal) });
  const branches = useQuery({ queryKey: ["options", "branches-all"], queryFn: ({ signal }) => apiGet<(Option & { hint?: string })[]>("/options/branches", undefined, signal) });
  const [company, setCompany] = useState("");
  const [branch, setBranch] = useState("");
  const name = (id: string, list?: Option[]) => list?.find((o) => o.value === id)?.label ?? id;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Company and branch scope</legend>
      <ul className="space-y-1 text-sm">
        {value.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
            {name(s.companyId, companies.data?.data)} — {s.branchId ? name(s.branchId, branches.data?.data) : "all branches"}
            <button type="button" className="text-xs text-danger underline" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Remove
            </button>
          </li>
        ))}
        {!value.length ? <li className="text-xs text-muted">No scope — the user sees only cases they are assigned to.</li> : null}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <Select aria-label="Company" className="h-9 w-48" value={company} onChange={(e) => setCompany(e.target.value)}>
          <option value="">Company…</option>
          {companies.data?.data.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Branch" className="h-9 w-48" value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">All branches</option>
          {branches.data?.data.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!company}
          onClick={() => {
            onChange([...value, { companyId: company, branchId: branch || null }]);
            setBranch("");
          }}
        >
          Add scope
        </Button>
      </div>
    </fieldset>
  );
}

function UserDialog({
  user,
  request,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  /** Approving an access request: the form is pre-filled from it and saving creates the account. */
  request?: AccessRequestRow;
  onClose: () => void;
  onSaved: (temp?: string) => void;
}) {
  const me = useSession();
  const [f, setF] = useState({
    username: user?.username ?? request?.username ?? (request?.email ? suggestUsername(request.email) : ""),
    email: user?.email ?? request?.email ?? "",
    fullName: user?.fullName ?? request?.fullName ?? "",
    role: user?.role ?? request?.requestedRole ?? "INVESTIGATOR",
    clearance: user?.clearance ?? "CONFIDENTIAL",
    status: user?.status ?? "ACTIVE",
    telephone: user?.telephone ?? request?.telephone ?? "",
    jobTitle: user?.jobTitle ?? request?.jobTitle ?? "",
    employeeNumber: user?.employeeNumber ?? request?.employeeNumber ?? "",
  });
  const [scopes, setScopes] = useState(user?.scopes.map((s) => ({ companyId: s.companyId, branchId: s.branchId })) ?? []);
  const [denials, setDenials] = useState<string[]>(user?.permissionDenials ?? []);
  const [dataApprover, setDataApprover] = useState(user?.dataApprover ?? false);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const self = user?.id === me.id;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={user ? `Edit ${user.fullName}` : request ? `Approve access for ${request.fullName}` : "New user"}
      description={request ? `${request.reference} · choose the role, units and restrictions for the new account.` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              setErrors({});
              try {
                const optional = { telephone: f.telephone || undefined, jobTitle: f.jobTitle || undefined, employeeNumber: f.employeeNumber || undefined };
                const access = { permissionDenials: denials, dataApprover };
                if (user) {
                  await apiPatch(`/users/${user.id}`, {
                    email: f.email,
                    fullName: f.fullName,
                    role: f.role,
                    clearance: f.clearance,
                    status: f.status,
                    ...optional,
                    ...(self ? {} : access),
                    version: user.version,
                  });
                  await apiPut(`/users/${user.id}/scopes`, { scopes });
                  onSaved();
                } else if (request) {
                  const res = await apiPost<{ temporaryPassword?: string }>(`/access-requests/${request.id}/approve`, {
                    username: f.username,
                    email: f.email,
                    fullName: f.fullName,
                    role: f.role,
                    clearance: f.clearance,
                    ...optional,
                    scopes,
                    ...access,
                    comment: comment || undefined,
                  });
                  onSaved(res.data.temporaryPassword);
                } else {
                  const res = await apiPost<{ temporaryPassword: string }>("/users", {
                    username: f.username,
                    email: f.email,
                    fullName: f.fullName,
                    role: f.role,
                    clearance: f.clearance,
                    ...optional,
                    scopes,
                    ...access,
                  });
                  onSaved(res.data.temporaryPassword);
                }
                onClose();
              } catch (e) {
                if (e instanceof ApiClientError) setErrors(e.fields);
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {user ? "Save changes" : request ? "Approve and create account" : "Create user"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        {request?.username ? <p className="text-sm text-muted">They chose their username and password when they asked for access, so no temporary password is issued.</p> : null}
        {request?.justification ? (
          <div className="rounded-md border border-dashed border-border-strong bg-surface-2 p-3 text-sm">
            <p className="eyebrow text-[0.6rem] text-muted">Their request</p>
            <p className="mt-1 whitespace-pre-wrap">{request.justification}</p>
            <p className="mt-2 text-xs text-muted">
              {request.unit ? `Unit: ${request.unit} · ` : ""}
              {request.requestedRole ? `Asked for: ${ROLE_LABELS[request.requestedRole]}` : "No role suggested"}
            </p>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="u-username" label="Username" required error={errors.username}>
            <Input id="u-username" value={f.username} disabled={Boolean(user || request?.username)} onChange={(e) => set("username", e.target.value)} autoComplete="off" />
          </Field>
          <Field id="u-email" label="Work email" required error={errors.email}>
            <Input id="u-email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
          </Field>
          <Field id="u-name" label="Full name" required error={errors.fullName}>
            <Input id="u-name" value={f.fullName} onChange={(e) => set("fullName", e.target.value)} />
          </Field>
          <Field id="u-role" label="Role" required hint={self ? "You cannot change your own role." : undefined}>
            <Select id="u-role" value={f.role} disabled={self} onChange={(e) => set("role", e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="u-clearance" label="Clearance">
            <Select id="u-clearance" value={f.clearance} onChange={(e) => set("clearance", e.target.value)}>
              {enumOptions("Confidentiality").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          {user ? (
            <Field id="u-status" label="Account status">
              <Select id="u-status" value={f.status} disabled={self} onChange={(e) => set("status", e.target.value)}>
                {enumOptions("UserStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field id="u-phone" label="Telephone">
            <Input id="u-phone" value={f.telephone} onChange={(e) => set("telephone", e.target.value)} />
          </Field>
          <Field id="u-title" label="Job title">
            <Input id="u-title" value={f.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
          </Field>
          <Field id="u-empno" label="Employee number">
            <Input id="u-empno" className="ref" value={f.employeeNumber} onChange={(e) => set("employeeNumber", e.target.value)} />
          </Field>
        </div>
        <ScopeEditor value={scopes} onChange={setScopes} />
        {self ? (
          <p className="text-xs text-muted">You cannot change your own restrictions or approval rights.</p>
        ) : (
          <AccessEditor role={f.role as Role} denials={denials} onDenialsChange={setDenials} dataApprover={dataApprover} onDataApproverChange={setDataApprover} />
        )}
        {request ? (
          <Field id="u-comment" label="Note for the record (optional)">
            <Input id="u-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}

export function UsersAdmin() {
  const can = useCan();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [editing, setEditing] = useState<UserRow | null | "new">(null);
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);
  const [reset, setReset] = useState<UserRow | null>(null);
  const [mfaReset, setMfaReset] = useState<UserRow | null>(null);
  const [reviewing, setReviewing] = useState<AccessRequestRow | null>(null);
  const [requestsVersion, setRequestsVersion] = useState(0);
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "requests" ? "requests" : "people");
  const me = useSession();
  const pending = useQuery({
    queryKey: ["access-requests", "count", requestsVersion],
    queryFn: ({ signal }) => apiGet<AccessRequestRow[]>("/access-requests", { status: "PENDING", pageSize: 1 }, signal),
  });
  const pendingCount = pending.data?.meta?.total ?? 0;
  const list = useQuery({ queryKey: ["users", page, dq], queryFn: ({ signal }) => apiGet<UserRow[]>("/users", { page, pageSize: 25, q: dq || undefined }, signal), placeholderData: keepPreviousData });
  const matrix = useQuery({ queryKey: ["permission-matrix"], queryFn: ({ signal }) => apiGet<Record<Role, Partial<Record<Module, Action[]>>>>("/permissions/matrix", undefined, signal) });
  const manage = can("USERS", "MANAGE_USERS");
  return (
    <>
      <PageHeader
        title="Users and roles"
        description="Create accounts, approve access requests, and set each person's role, clearance, company/branch units and restrictions. Every change is audited."
        actions={
          manage ? (
            <Button onClick={() => setEditing("new")}>
              <UserPlus className="h-4 w-4" aria-hidden /> New user
            </Button>
          ) : null
        }
      />
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List aria-label="Users and access" className="mb-4 flex gap-1 border-b border-border">
          <Tabs.Trigger value="people" className="tab-trigger px-3 py-2 text-sm text-muted hover:text-text data-[state=active]:font-semibold data-[state=active]:text-text">
            People
          </Tabs.Trigger>
          <Tabs.Trigger value="requests" className="tab-trigger flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-text data-[state=active]:font-semibold data-[state=active]:text-text">
            Access requests
            {pendingCount ? (
              <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 font-semibold text-accent-contrast" aria-label={`${pendingCount} waiting`}>
                {pendingCount}
              </span>
            ) : null}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="requests">
          <Card>
            <AccessRequests manage={manage} onReview={setReviewing} refreshKey={requestsVersion} />
          </Card>
        </Tabs.Content>
        <Tabs.Content value="people">
          <Card>
            <Input
              type="search"
              aria-label="Search users"
              placeholder="Search by name, username or email"
              className="mb-3 max-w-sm"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            {!list.data ? (
              <LoadingRows />
            ) : list.data.data.length === 0 ? (
              <EmptyState title="No users match" />
            ) : (
              <ScrollRegion className="overflow-x-auto" label="Users">
                <table className="w-full min-w-[800px] text-sm">
                  <caption className="sr-only">Users</caption>
                  <thead className="text-xs text-muted">
                    <tr>
                      <th scope="col" className="py-1.5 text-left">
                        Name
                      </th>
                      <th scope="col" className="py-1.5 text-left">
                        Role
                      </th>
                      <th scope="col" className="py-1.5 text-left">
                        Clearance
                      </th>
                      <th scope="col" className="py-1.5 text-left">
                        Scope
                      </th>
                      <th scope="col" className="py-1.5 text-left">
                        Status
                      </th>
                      <th scope="col" className="py-1.5 text-left">
                        Last sign-in
                      </th>
                      <th scope="col" className="py-1.5">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.data.data.map((u) => (
                      <tr key={u.id}>
                        <td className="py-1.5">
                          <span className="font-medium">{u.fullName}</span> {u.isDemo ? <DemoBadge /> : null}
                          <span className="block text-xs text-muted">
                            <Ref>{u.username}</Ref> · {u.email}
                          </span>
                        </td>
                        <td className="py-1.5">
                          {ROLE_LABELS[u.role]}
                          {u.permissionDenials.length ? (
                            <Badge tone="warning" className="ml-1" title={u.permissionDenials.join(", ")}>
                              {u.permissionDenials.length} restricted
                            </Badge>
                          ) : null}
                          {u.dataApprover && u.role !== "SYSTEM_ADMIN" ? (
                            <Badge tone="accent" className="ml-1">
                              Data approver
                            </Badge>
                          ) : null}
                        </td>
                        <td className="py-1.5">
                          <StatusBadge value={u.clearance} />
                        </td>
                        <td className="py-1.5 text-xs">{u.scopes.map((s) => `${s.company.name}${s.branch ? ` / ${s.branch.name}` : ""}`).join("; ") || "Assigned cases only"}</td>
                        <td className="py-1.5">
                          <StatusBadge value={u.status} />
                          {u.lockedUntil && new Date(u.lockedUntil) > new Date() ? (
                            <Badge tone="danger" className="ml-1">
                              Locked
                            </Badge>
                          ) : null}
                          
                          {u.mfaEnabled ? (
                            <Badge tone="success" className="ml-1">
                              Two-step on
                            </Badge>
                          ) : null}
                        </td>
                        <td className="py-1.5 text-xs">
                          <DateText value={u.lastLoginAt} withTime />
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          {manage ? (
                            <>
                              <Button size="icon" variant="ghost" aria-label={`Edit ${u.fullName}`} onClick={() => setEditing(u)}>
                                <Pencil className="h-4 w-4" aria-hidden />
                              </Button>
                              <Button size="icon" variant="ghost" aria-label={`Reset password for ${u.fullName}`} onClick={() => setReset(u)}>
                                <KeyRound className="h-4 w-4" aria-hidden />
                              </Button>
                              {u.mfaEnabled && u.id !== me.id ? (
                                <Button size="icon" variant="ghost" aria-label={`Reset two-step verification for ${u.fullName}`} onClick={() => setMfaReset(u)}>
                                  <ShieldOff className="h-4 w-4" aria-hidden />
                                </Button>
                              ) : null}
                              {u.lockedUntil && new Date(u.lockedUntil) > new Date() ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Unlock ${u.fullName}`}
                                  onClick={async () => {
                                    try {
                                      await apiPost(`/users/${u.id}/unlock`);
                                      toast.success("Account unlocked.");
                                      await list.refetch();
                                    } catch (e) {
                                      toast.error(errorMessage(e));
                                    }
                                  }}
                                >
                                  <LockOpen className="h-4 w-4" aria-hidden />
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {list.data.meta && list.data.meta.totalPages > 1 ? (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="secondary" disabled={page >= list.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                ) : null}
              </ScrollRegion>
            )}
          </Card>

          <Card title="Role and permission matrix" className="mt-5">
            {!matrix.data ? (
              <LoadingRows rows={4} />
            ) : (
              <ScrollRegion className="max-h-[36rem] overflow-auto" label="Actions each role may perform in each module">
                <table className="text-xs">
                  <caption className="sr-only">Actions each role may perform in each module</caption>
                  <thead className="sticky top-0 bg-surface">
                    <tr>
                      <th scope="col" className="sticky left-0 bg-surface p-2 text-left">
                        Module
                      </th>
                      {ROLES.map((r) => (
                        <th key={r} scope="col" className="min-w-28 p-2 text-left font-semibold">
                          {ROLE_LABELS[r]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {MODULES.map((m) => (
                      <Fragment key={m}>
                        <tr>
                          <th scope="row" className="sticky left-0 bg-surface p-2 text-left font-medium">
                            {MODULE_LABELS[m]}
                          </th>
                          {ROLES.map((r) => {
                            const actions = matrix.data!.data[r][m] ?? [];
                            return (
                              <td key={r} className="p-2 align-top text-muted">
                                {actions.length ? (
                                  ACTIONS.filter((a) => actions.includes(a))
                                    .map((a) => ACTION_LABELS[a])
                                    .join(", ")
                                ) : (
                                  <span aria-label="No access">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            )}
          </Card>
        </Tabs.Content>
      </Tabs.Root>

      {reviewing ? (
        <UserDialog
          user={null}
          request={reviewing}
          onClose={() => setReviewing(null)}
          onSaved={async (password) => {
            toast.success("Access approved and account created.");
            if (password) setTemp({ name: reviewing.fullName, password });
            setRequestsVersion((v) => v + 1);
            await list.refetch();
          }}
        />
      ) : null}

      {editing ? (
        <UserDialog
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (password) => {
            toast.success(password ? "User created." : "User updated.");
            if (password && editing === "new") setTemp({ name: "the new user", password });
            await list.refetch();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(reset)}
        onOpenChange={(o) => !o && setReset(null)}
        title={`Reset the password for ${reset?.fullName}?`}
        description="A temporary password is issued and every session for this user is signed out."
        confirmLabel="Reset password"
        onConfirm={async () => {
          try {
            const res = await apiPost<{ temporaryPassword: string }>(`/users/${reset!.id}/reset-password`);
            setTemp({ name: reset!.fullName, password: res.data.temporaryPassword });
          } catch (e) {
            throw new Error(errorMessage(e));
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(mfaReset)}
        onOpenChange={(o) => !o && setMfaReset(null)}
        title={`Reset two-step verification for ${mfaReset?.fullName}?`}
        description="Use this when the user has lost their device. They are signed out everywhere and must set up two-step verification again."
        confirmLabel="Reset two-step verification"
        tone="danger"
        requireReason
        reasonLabel="Reason (for the audit log)"
        onConfirm={async (reason) => {
          try {
            await apiPost(`/users/${mfaReset!.id}/mfa/reset`, { reason });
            toast.success("Two-step verification reset.");
            await list.refetch();
          } catch (e) {
            throw new Error(errorMessage(e));
          }
        }}
      />
      <Modal open={Boolean(temp)} onOpenChange={(o) => !o && setTemp(null)} title="Temporary password" description="Shown once. Share it securely; the user must change it at first sign-in." size="sm">
        <p className="text-sm">Temporary password for {temp?.name}:</p>
        <p className="mt-2 rounded border border-border bg-surface-2 p-2 text-center">
          <Ref className="text-base">{temp?.password}</Ref>
        </p>
      </Modal>
    </>
  );
}
