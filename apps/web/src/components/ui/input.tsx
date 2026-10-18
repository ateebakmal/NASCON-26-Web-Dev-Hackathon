import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex min-h-[44px] w-full rounded-md border bg-white/5 px-3 py-2 text-sm text-text placeholder:text-text/40",
        "transition-colors motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:cursor-not-allowed disabled:opacity-50",
        error ? "border-danger" : "border-white/10",
        className
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  )
);
Input.displayName = "Input";
