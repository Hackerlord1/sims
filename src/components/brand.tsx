import { cn } from "@/lib/cn";

/** The SIMS seal: a serif initial on an ink block with a folded corner, like a marked case file. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("brand-mark inline-flex h-9 w-9 items-center justify-center rounded-[5px] bg-accent pb-0.5 text-[1.35rem] text-accent-contrast", className)} aria-hidden>
      S
    </span>
  );
}

export const AUTHORIZED_USE_NOTICE =
  "This system is for authorized Savemore personnel only. All activity is monitored and recorded. " +
  "Unauthorized access, use or disclosure of investigation information is prohibited and may result in " +
  "disciplinary action and criminal prosecution.";
