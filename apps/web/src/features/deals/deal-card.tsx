import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BarChart3, ChevronRight, DollarSign, Lock } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Deal } from "./types";

const LOGO_TINTS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-cyan-100 text-cyan-700",
];

function tintFor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n + seed.charCodeAt(i)) % LOGO_TINTS.length;
  return LOGO_TINTS[n];
}

export function formatValue(value: Deal["value"]) {
  const n = Number(value ?? 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function DealCard({
  deal,
  dragging,
  onOpen,
}: {
  deal: Deal;
  dragging?: boolean;
  onOpen?: (deal: Deal) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  });

  const companyName = deal.contact.company?.name ?? deal.contact.name;
  // A masked value comes back as null for users without "see deal values",
  // so the card shows a lock instead of inventing a number (F1.4).
  const masked = deal.value === null || deal.value === undefined;

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      // dnd-kit only starts a drag after 5px of movement, so a plain click
      // still reaches this handler.
      onClick={() => onOpen?.(deal)}
      className={cn(
        "cursor-grab rounded-lg border border-border bg-surface p-3 shadow-card transition-shadow active:cursor-grabbing",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        (isDragging || dragging) && "opacity-60 shadow-pop"
      )}
    >
      <header className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold",
            tintFor(companyName)
          )}
          aria-hidden="true"
        >
          {companyName[0]?.toUpperCase()}
        </span>
        <span className="truncate text-base font-semibold text-text">{companyName}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        <span className="shrink-0 text-sm text-text-muted">
          {new Date(deal.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </header>

      <p className="mt-2 text-base text-text">{deal.name}</p>

      <footer className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border"
          title="Priority"
        >
          <BarChart3 className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
        </span>
        <span className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-sm font-medium text-text">
          {masked ? (
            <>
              <Lock className="h-3 w-3 text-text-muted" aria-hidden="true" />
              <span className="text-text-muted">Hidden</span>
            </>
          ) : (
            <>
              <DollarSign className="h-3 w-3 text-text-muted" aria-hidden="true" />
              {formatValue(deal.value)}
            </>
          )}
        </span>
        {deal.tag && (
          <span className="flex h-7 items-center rounded-md border border-border px-2 text-sm text-text-muted">
            {deal.tag}
          </span>
        )}
      </footer>
    </article>
  );
}
