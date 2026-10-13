import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "btn-primary bg-accent text-accent-contrast",
  secondary: "bg-surface-2 text-text border border-border shadow-card hover:bg-surface-3 hover:border-border-strong",
  outline: "bg-transparent text-text border border-border-strong hover:bg-surface-2 hover:border-text",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.2)] hover:opacity-90",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
  icon: "h-9 w-9",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = "primary", size = "md", asChild, loading, disabled, children, ...props }, ref) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-[5px] font-medium whitespace-nowrap select-none",
        "transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-200 ease-out active:translate-y-px active:scale-[0.985]",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
});
