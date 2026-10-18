import { CheckCircle2, Clock, PlaneTakeoff, PowerOff } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Availability } from "./api";

// Icon + text together (never color alone) for each state, so meaning
// survives for colour-blind users (Q8).
const OPTIONS: Array<{ value: Availability; label: string; icon: typeof CheckCircle2; activeClass: string }> = [
  { value: "AVAILABLE", label: "Available", icon: CheckCircle2, activeClass: "bg-success/20 text-success border-success/40" },
  { value: "BUSY", label: "Busy", icon: Clock, activeClass: "bg-warning/20 text-warning border-warning/40" },
  { value: "ON_LEAVE", label: "On leave", icon: PlaneTakeoff, activeClass: "bg-muted text-text border-border" },
  { value: "OFFLINE", label: "Offline", icon: PowerOff, activeClass: "bg-danger/20 text-danger border-danger/40" },
];

export function EmployeeStatusToggle({
  value,
  onChange,
  loading,
}: {
  value: Availability;
  onChange: (next: Availability) => void;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Availability">
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={loading}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex min-h-[44px] items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors motion-reduce:transition-none disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              active ? opt.activeClass : "border-border text-text-muted hover:bg-muted"
            )}
          >
            <opt.icon className="h-4 w-4" aria-hidden="true" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
