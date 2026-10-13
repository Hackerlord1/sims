"use client";

import { Check } from "lucide-react";
import type { CaseSummary } from "@/components/cases/types";
import { ScrollRegion } from "@/components/ui/display";
import { ENUMS, enumLabel } from "@/lib/enums";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";

const TRACK_STATUS: Record<string, string[]> = {
  Criminal: ["REFERRED_FOR_CRIMINAL_ACTION", "CRIMINAL_AND_CIVIL_ACTION"],
  Civil: ["REFERRED_FOR_CIVIL_ACTION", "CRIMINAL_AND_CIVIL_ACTION"],
  Disciplinary: ["DISCIPLINARY_PROCESS"],
  Recovery: ["RECOVERY_MONITORING"],
  "Write-off": ["WRITE_OFF_APPROVAL"],
};

/** Investigation stage stepper plus the parallel pathways a case can follow at the same time. */
export function InvestigationPathway({ summary }: { summary: CaseSummary }) {
  const c = summary.case;
  const stages = ENUMS.InvestigationStage;
  const current = stages.indexOf(c.stage as (typeof stages)[number]);
  const tracks = [
    {
      name: "Criminal",
      active: summary.counts.criminal > 0 || TRACK_STATUS.Criminal!.includes(c.status),
    },
    {
      name: "Civil",
      active: summary.counts.civil > 0 || TRACK_STATUS.Civil!.includes(c.status),
    },
    {
      name: "Disciplinary",
      active: TRACK_STATUS.Disciplinary!.includes(c.status),
    },
    {
      name: "Recovery",
      active: money(summary.financials.amountRecovered).greaterThan(0) || TRACK_STATUS.Recovery!.includes(c.status),
    },
    {
      name: "Write-off",
      active: money(summary.financials.amountWrittenOff).greaterThan(0) || TRACK_STATUS["Write-off"]!.includes(c.status),
    },
  ];
  return (
    <section aria-label="Investigation pathway" className="depth rounded-xl border border-border bg-surface p-4">
      <h2 className="sr-only">Investigation pathway</h2>
      {/* Scrolls sideways on narrow screens. */}
      <ScrollRegion className="overflow-x-auto pb-1" label={`Investigation stage: ${enumLabel(c.stage)}`}>
        <ol className="flex min-w-max gap-1 lg:min-w-0">
          {stages.map((s, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <li key={s} className="flex min-w-[5.75rem] flex-1 flex-col items-center gap-1 text-center" aria-current={now ? "step" : undefined}>
                <div className="flex w-full items-center">
                  <span
                    className={cn("h-0.5 flex-1 rounded-full transition-colors duration-500", i === 0 ? "bg-transparent" : done || now ? "bg-linear-to-r from-accent to-accent-2" : "bg-border")}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-[background-color,border-color,box-shadow] duration-300",
                      done && "border-accent bg-accent text-accent-contrast shadow-[0_0_12px_-2px_var(--glow-strong)]",
                      now && "step-pulse border-accent bg-accent-soft text-accent",
                      !done && !now && "border-border bg-surface-2 text-muted",
                    )}
                    aria-hidden
                  >
                    {done ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "h-0.5 flex-1 rounded-full transition-colors duration-500",
                      i === stages.length - 1 ? "bg-transparent" : done ? "bg-linear-to-r from-accent to-accent-2" : "bg-border",
                    )}
                    aria-hidden
                  />
                </div>
                <span className={cn("text-[11px] leading-tight", now ? "font-semibold text-text" : "text-muted")}>
                  {enumLabel(s)}
                  <span className="sr-only">{done ? " (completed)" : now ? " (current stage)" : " (not started)"}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </ScrollRegion>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
        <span className="font-medium text-muted">Pathways:</span>
        {tracks.map((t) => (
          <span
            key={t.name}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
              t.active ? "border-accent/40 bg-accent-soft text-accent shadow-[0_0_14px_-6px_var(--glow-strong)]" : "border-border text-muted",
            )}
          >
            {t.active ? <Check className="h-3 w-3" aria-hidden /> : null}
            {t.name}
            <span className="sr-only">{t.active ? " — active" : " — not active"}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
