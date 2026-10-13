"use client";

import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/api-client";
import { formatDate } from "@/components/ui/display";
import { cn } from "@/lib/cn";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsBell() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: ({ signal }) => apiGet<{ items: NotificationRow[]; unread: number }>("/notifications", undefined, signal),
    refetchInterval: 60_000,
  });
  const markAll = useMutation({
    mutationFn: () => apiPost("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => apiPost(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = data?.data.unread ?? 0;
  const items = data?.data.items ?? [];

  return (
    <Popover.Root>
      <Popover.Trigger
        className="relative rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-text data-[state=open]:bg-surface-2"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread ? (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-bold text-white shadow-[0_0_0_2px_var(--surface),0_0_12px_var(--danger)]"
            aria-hidden
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="elevated z-50 w-[min(24rem,calc(100vw-1rem))] rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="text-sm font-semibold">Reminders and alerts</h2>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50"
              onClick={() => markAll.mutate()}
              disabled={!unread || markAll.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
            </button>
          </div>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto" aria-live="polite">
            {items.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">No reminders.</li> : null}
            {items.map((n) => (
              <li key={n.id} className={cn("px-3 py-2.5 transition-colors hover:bg-surface-2", !n.readAt && "bg-accent-soft/40 shadow-[inset_2px_0_0_var(--accent)]")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {!n.readAt ? <span className="sr-only">Unread: </span> : null}
                      {n.link ? (
                        <Link href={n.link} className="hover:underline" onClick={() => !n.readAt && markOne.mutate(n.id)}>
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </p>
                    <p className="text-xs text-muted">{n.body}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{formatDate(n.createdAt, true)}</p>
                  </div>
                  {!n.readAt ? (
                    <button type="button" className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-2" onClick={() => markOne.mutate(n.id)}>
                      Mark read
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
