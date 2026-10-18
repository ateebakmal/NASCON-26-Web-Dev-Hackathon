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
        "flex min-h-[40px] w-full rounded-md border bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted/70",
        "transition-colors motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:cursor-not-allowed disabled:opacity-50",
        error ? "border-danger" : "border-border",
        className
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }
>(({ className, error, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex min-h-[40px] w-full rounded-md border bg-surface px-3 py-2 text-base text-text",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
      "disabled:cursor-not-allowed disabled:opacity-50",
      error ? "border-danger" : "border-border",
      className
    )}
    aria-invalid={error || undefined}
    {...props}
  />
));
Select.displayName = "Select";
