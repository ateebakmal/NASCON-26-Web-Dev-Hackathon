import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

// Shared interaction-state baseline (focus-visible ring, 40px min tap target,
// reduced-motion) applied once so every variant inherits it.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary/90 shadow-sm",
        dark: "bg-text text-white hover:bg-text/90 shadow-sm",
        secondary: "bg-surface text-text border border-border hover:bg-muted",
        ghost: "text-text-muted hover:bg-muted hover:text-text",
        danger: "bg-danger text-white hover:bg-danger/90",
      },
      size: {
        default: "min-h-[40px] px-4 text-base",
        sm: "min-h-[34px] px-3 text-sm",
        icon: "h-10 w-10",
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
