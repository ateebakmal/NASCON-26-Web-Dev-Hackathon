import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

// Shared interaction-state baseline (focus-visible ring, 44px min tap
// target, reduced-motion) applied once here so every button variant
// inherits it, per the Enterprise design skill's component-state rules.
const buttonVariants = cva(
  "inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-secondary",
        secondary: "bg-white/10 text-text hover:bg-white/15 border border-white/10",
        ghost: "text-text hover:bg-white/10",
        danger: "bg-danger text-white hover:bg-danger/90",
      },
      size: {
        default: "px-4 py-2",
        sm: "px-3 py-1.5 text-xs min-h-[36px]",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
