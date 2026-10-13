"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * KPI card: an index card with a tone stripe, serif figures, hover lift and a short staggered entrance (disabled under reduced motion).
 * The entrance runs on an outer wrapper so Framer Motion's inline transform does not cancel the
 * card's CSS hover lift. With `onOpen` the card is a button that opens the records behind the figure.
 */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  index = 0,
  onOpen,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger" | "accent";
  index?: number;
  onOpen?: () => void;
}) {
  const tones = {
    default: "var(--text-muted)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    accent: "var(--accent)",
  };
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow pt-1.5 text-muted">{label}</p>
        {Icon ? (
          <span className="kpi-icon" aria-hidden>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div className="kpi-value mt-2 break-words">{value}</div>
      {hint ? <div className="mt-2 border-t border-dashed border-border pt-2 text-xs text-muted">{hint}</div> : null}
      {onOpen ? (
        <span className="kpi-open eyebrow flex items-center gap-1 text-[0.6rem] text-accent" aria-hidden>
          View records <ArrowUpRight className="h-3 w-3" />
        </span>
      ) : null}
    </>
  );
  const className = cn("depth depth-hover kpi flex w-full flex-col rounded-md border border-border bg-surface p-4 text-left", onOpen && "kpi-button cursor-pointer");
  const style = { "--kpi-tone": tones[tone] } as CSSProperties;
  return (
    <motion.div className="h-full" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] }}>
      {onOpen ? (
        <button type="button" className={className} style={style} onClick={onOpen} aria-haspopup="dialog">
          {body}
          <span className="sr-only">. View the records behind this figure.</span>
        </button>
      ) : (
        <div className={className} style={style}>
          {body}
        </div>
      )}
    </motion.div>
  );
}
