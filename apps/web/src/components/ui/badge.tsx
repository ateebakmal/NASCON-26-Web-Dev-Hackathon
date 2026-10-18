import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

// Never color-alone: every badge pairs its color with text (and usually an
// icon from the caller), satisfying the "color is not the only carrier of
// meaning" accessibility rule.
const badgeVariants = cva("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      neutral: "bg-white/10 text-text",
      primary: "bg-primary/20 text-primary",
      success: "bg-success/20 text-success",
      warning: "bg-warning/20 text-warning",
      danger: "bg-danger/20 text-danger",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
