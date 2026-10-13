import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatMoney, type MoneyInput } from "@/lib/money";

const dateFmt = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" });
const dateTimeFmt = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });

export function formatDate(v: string | Date | null | undefined, withTime = false): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return (withTime ? dateTimeFmt : dateFmt).format(d);
}

export function DateText({ value, withTime }: { value: string | Date | null | undefined; withTime?: boolean }) {
  if (!value) return <span className="text-muted">—</span>;
  const iso = typeof value === "string" ? value : value.toISOString();
  return <time dateTime={iso}>{formatDate(value, withTime)}</time>;
}

/** Amounts in IBM Plex Mono with tabular figures. Negative values carry a minus sign, not just colour. */
export function Money({ value, currency = "KES", className, emphasise }: { value: MoneyInput; currency?: string | null; className?: string; emphasise?: boolean }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted">—</span>;
  const text = formatMoney(value, currency);
  return <span className={cn("ref tabular whitespace-nowrap", emphasise && "font-semibold", text.includes("-") && "text-danger", className)}>{text}</span>;
}

/** Case references, invoice numbers, OB numbers, court numbers, transaction references. */
export function Ref({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("ref text-[0.92em] whitespace-nowrap", className)}>{children}</span>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1.5 text-muted">{eyebrow}</div> : null}
        <h1 className="text-[1.75rem] leading-tight text-text sm:text-[2.1rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-3xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className, title, actions, id, depth }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; id?: string; depth?: boolean }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={title ? headingId : undefined} className={cn("rounded-md border border-border bg-surface", depth ? "depth" : "panel shadow-card", className)}>
      {title ? (
        <header className="panel-header flex flex-wrap items-center justify-between gap-2 rounded-t-md border-b border-border px-4 py-2.5">
          <h2 id={headingId} className="flex items-center gap-2 text-[1.02rem] font-semibold">
            <span className="title-bar" aria-hidden />
            {title}
          </h2>
          {actions}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function DescriptionList({ items, columns = 2 }: { items: { label: ReactNode; value: ReactNode; wide?: boolean }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3")}>
      {items.map((it, i) => (
        <div key={i} className={cn("min-w-0", it.wide && "sm:col-span-full")}>
          <dt className="eyebrow text-[0.625rem] text-muted">{it.label}</dt>
          <dd className="mt-0.5 break-words whitespace-pre-wrap text-text">{it.value ?? <span className="text-muted">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A scrolling container for wide or tall tables. It is focusable and labelled so keyboard users can
 * scroll it (WCAG 2.1.1), and `relative` so visually hidden content cannot leak outside it.
 */
export function ScrollRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={cn("relative focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none", className)}>
      {children}
    </div>
  );
}
