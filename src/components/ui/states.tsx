import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center" role="status">
      <div className="mb-1 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-surface-2 text-muted shadow-card" aria-hidden>
        {icon ?? <Inbox className="h-7 w-7" />}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <AlertTriangle className="h-8 w-8 text-danger" aria-hidden />
      <p className="text-sm font-semibold text-danger">Could not load this information</p>
      <p className="max-w-md text-sm text-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw className="h-4 w-4" aria-hidden /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md", className)} aria-hidden />;
}

export function LoadingRows({ rows = 6, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-2 p-4" role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        // Staggered start so the sweep ripples down the list.
        <div key={i} className="shimmer h-8 w-full rounded-md" style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }} aria-hidden />
      ))}
    </div>
  );
}

export function LeadNotice({ className }: { className?: string }) {
  return (
    <span role="note" className={cn("block rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning", className)}>
      <strong>Investigative lead — not proof.</strong> Automated analysis highlights patterns that require human verification before any conclusion is drawn or relied upon.
    </span>
  );
}
