import * as LabelPrimitive from "@radix-ui/react-label";
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted " +
  "transition-[border-color,box-shadow,background-color] duration-150 hover:border-border-strong " +
  "focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 aria-[invalid=true]:border-danger " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const inputClass = cn(control, "h-10");

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputClass, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(inputClass, "pr-8", className)} {...props}>
      {children}
    </select>
  );
});

export function Field({
  id,
  label,
  error,
  hint,
  required,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <LabelPrimitive.Root htmlFor={id} className="block text-sm font-medium text-text">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </LabelPrimitive.Root>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          <span aria-hidden>⚠ </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormAlert({ tone = "danger", children }: { tone?: "danger" | "success" | "warning" | "info"; children: ReactNode }) {
  const tones = {
    danger: "border-danger/40 bg-danger-soft text-danger",
    success: "border-success/40 bg-success-soft text-success",
    warning: "border-warning/40 bg-warning-soft text-warning",
    info: "border-info/40 bg-info-soft text-info",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-md border px-3 py-2 text-sm", tones[tone])}>
      {children}
    </div>
  );
}
