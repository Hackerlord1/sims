"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useDebounced } from "@/components/resources/hooks";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Ref } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { apiGet, errorMessage } from "@/lib/api-client";

const TYPES = [
  ["cases", "Cases"],
  ["parties", "People and organisations"],
  ["invoices", "Invoices and customers"],
  ["cheques", "Cheques"],
  ["criminal", "OB numbers, stations and officers"],
  ["civil", "Court cases and advocates"],
  ["transactions", "Transactions, phones and accounts"],
  ["accounts", "Known accounts"],
] as const;

interface Hit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  reference: string | null;
  href: string;
}

export function SearchPage({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initialQuery);
  const [types, setTypes] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const dq = useDebounced(q.trim(), 350);
  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["search", dq, types, from, to],
    queryFn: ({ signal }) => apiGet<Hit[]>("/search", { q: dq, types: types.join(",") || undefined, from: from || undefined, to: to || undefined }, signal),
    enabled: dq.length >= 2,
  });
  const hits = data?.data ?? [];
  return (
    <>
      <PageHeader
        title="Search"
        description="Search case numbers, titles, people, customers, invoices, cheques, OB numbers, police stations, officers, court case numbers, advocates, transaction references, telephone numbers, accounts, locations and amounts."
      />
      <div className="panel space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            aria-label="Search terms"
            className="h-11 pl-9 text-base"
            value={q}
            autoFocus
            placeholder="e.g. SIMS/2026/0001, INV-1001, 0712345678, 25000, Busia"
            onChange={(e) => {
              setQ(e.target.value);
              router.replace(e.target.value ? `${pathname}?q=${encodeURIComponent(e.target.value)}` : pathname, { scroll: false });
            }}
          />
        </div>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Record types</legend>
          {TYPES.map(([t, label]) => (
            <label key={t} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs">
              <input type="checkbox" className="accent-[var(--accent)]" checked={types.includes(t)} onChange={(e) => setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t))} />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <Field id="s-from" label="From date">
            <Input id="s-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field id="s-to" label="To date">
            <Input id="s-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </div>
      <section className="mt-5" aria-live="polite" aria-busy={isFetching} aria-label="Search results">
        {dq.length < 2 ? (
          <EmptyState title="Type at least two characters" />
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : isFetching && !data ? (
          <LoadingRows />
        ) : hits.length === 0 ? (
          <EmptyState title="No matches" description="Only records in cases you can access are searched." />
        ) : (
          <ul className="panel divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-card">
            <li className="px-4 py-2 text-xs text-muted">{hits.length} result(s)</li>
            {hits.map((h) => (
              <li key={`${h.type}-${h.id}`}>
                <Link href={h.href} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{h.title}</span>
                    <span className="block text-sm text-muted">{h.subtitle}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {h.reference ? <Ref className="text-xs">{h.reference}</Ref> : null}
                    <Badge>{TYPES.find(([t]) => t === h.type)?.[1] ?? h.type}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
