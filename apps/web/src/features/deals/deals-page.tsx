import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ArrowUpDown,
  Filter,
  Group,
  Kanban,
  List,
  Loader2,
  MoreHorizontal,
  Table2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { ApiError } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useToolbar } from "../../app/layout";
import { useBoard, useMoveStage } from "./api";
import { DealCard, formatValue } from "./deal-card";
import { RequiredFieldsDialog } from "./required-fields-dialog";
import { AddDealDialog } from "./add-deal-dialog";
import { DealDrawer } from "./deal-drawer";
import { SavedListsBar } from "./saved-lists";
import type { Deal, RequiredFieldsError, Stage } from "./types";

const STAGE_PILL: Record<string, string> = {
  slate: "bg-muted text-text-muted",
  blue: "bg-primary/10 text-primary",
  amber: "bg-warning/15 text-warning",
  emerald: "bg-success/10 text-success",
  rose: "bg-danger/10 text-danger",
};

export function DealsPage() {
  const { data, isLoading, isError } = useBoard();
  const moveStage = useMoveStage();
  const [activeDeal, setActiveDeal] = React.useState<Deal | null>(null);
  const [blocked, setBlocked] = React.useState<
    (RequiredFieldsError & { dealId: string }) | null
  >(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [openDeal, setOpenDeal] = React.useState<Deal | null>(null);
  // When a saved list is applied the board shows its results instead of the
  // full pipeline; null means "no filter, show everything".
  const [filtered, setFiltered] = React.useState<Deal[] | null>(null);
  const [filterLabel, setFilterLabel] = React.useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useToolbar(
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" className="gap-1.5">
        <Filter className="h-4 w-4" aria-hidden="true" />
        Filter
      </Button>
      <Button variant="secondary" size="sm" className="gap-1.5">
        <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
        Sort
      </Button>
      <Button variant="secondary" size="sm" className="gap-1.5">
        <Group className="h-4 w-4" aria-hidden="true" />
        Group
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center rounded-md border border-border p-0.5 sm:flex">
          <ViewTab icon={List} label="List" />
          <ViewTab icon={Kanban} label="Kanban" active />
          <ViewTab icon={Table2} label="Timeline" />
        </div>
        <AddDealDialog pipelineId={data?.pipeline.id} stages={data?.stages ?? []} />
      </div>
    </div>,
    // Rebuilt once the board resolves so the dialog gets the real pipeline
    // and stage list. Keyed on the pipeline only, so a routine board refetch
    // does not remount the dialog while someone is typing in it.
    [data?.pipeline.id]
  );

  const visibleDeals = filtered ?? data?.opportunities ?? [];

  const dealsByStage = React.useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of data?.stages ?? []) map.set(stage.id, []);
    for (const deal of visibleDeals) map.get(deal.stageId)?.push(deal);
    return map;
  }, [data, visibleDeals]);

  // Owners available as a filter criterion, derived from the board itself.
  const owners = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const d of data?.opportunities ?? []) {
      if (d.owner) seen.set(d.owner.id, d.owner);
    }
    return Array.from(seen.values());
  }, [data]);

  const onDragStart = (e: DragStartEvent) => {
    const deal = data?.opportunities.find((d) => d.id === e.active.id);
    setActiveDeal(deal ?? null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveDeal(null);
    const dealId = String(e.active.id);
    const targetStageId = e.over?.id ? String(e.over.id) : null;
    if (!targetStageId) return;

    const deal = data?.opportunities.find((d) => d.id === dealId);
    if (!deal || deal.stageId === targetStageId) return;

    try {
      await moveStage.mutateAsync({ dealId, stageId: targetStageId });
    } catch (err) {
      // 409 means the target stage has required fields that aren't filled --
      // ask for exactly those, then retry the same move.
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { message?: RequiredFieldsError } & RequiredFieldsError;
        const payload = (body?.message ?? body) as RequiredFieldsError;
        if (payload?.error === "REQUIRED_FIELDS_MISSING") {
          setBlocked({ ...payload, dealId });
          return;
        }
      }
      setToast(err instanceof Error ? err.message : "Could not move the deal");
    }
  };

  const submitBlocked = async (values: Record<string, unknown>) => {
    if (!blocked) return;
    try {
      await moveStage.mutateAsync({
        dealId: blocked.dealId,
        stageId: blocked.stageId,
        fields: values,
      });
      setBlocked(null);
      setToast("Deal moved");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not move the deal");
    }
  };

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading board…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p role="alert" className="py-8 text-base text-danger">
        Could not load the pipeline board.
      </p>
    );
  }

  return (
    <>
      <div className="mb-4">
        <SavedListsBar
          stages={data.stages}
          owners={owners}
          onResults={(deals, label) => {
            setFiltered(deals);
            setFilterLabel(label);
          }}
        />
        {filterLabel && (
          <p className="mt-2 text-sm text-text-muted">
            Showing <span className="font-medium text-text">{filterLabel}</span> — the list
            re-runs its filter each time, so it stays current.
          </p>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-slim">
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {data.stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage.get(stage.id) ?? []}
              onOpenDeal={setOpenDeal}
            />
          ))}
          <DragOverlay>{activeDeal && <DealCard deal={activeDeal} dragging />}</DragOverlay>
        </DndContext>
      </div>

      <DealDrawer deal={openDeal} onClose={() => setOpenDeal(null)} />

      {blocked && (
        <RequiredFieldsDialog
          request={blocked}
          submitting={moveStage.isPending}
          onCancel={() => setBlocked(null)}
          onSubmit={submitBlocked}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-text px-4 py-2 text-base text-white shadow-pop"
        >
          {toast}
        </div>
      )}
    </>
  );
}

function StageColumn({
  stage,
  deals,
  onOpenDeal,
}: {
  stage: Stage;
  deals: Deal[];
  onOpenDeal: (deal: Deal) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((sum, d) => sum + Number(d.value ?? 0), 0);

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-[300px] shrink-0 flex-col rounded-lg bg-muted/70 p-2.5 transition-colors",
        isOver && "bg-primary/5 ring-2 ring-primary/30"
      )}
    >
      <header className="flex items-center gap-2 px-1 pb-2.5">
        <span
          className={cn(
            "rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
            STAGE_PILL[stage.color] ?? STAGE_PILL.slate
          )}
        >
          {stage.name}
        </span>
        <span className="text-sm font-medium text-text-muted">{deals.length}</span>
        {total > 0 && (
          <span className="text-xs text-text-muted">· {formatValue(total)}</span>
        )}
        {stage.requiredFieldKeys.length > 0 && (
          <span
            className="text-xs text-warning"
            title={`Requires: ${stage.requiredFieldKeys.join(", ")}`}
          >
            ⚑
          </span>
        )}
        <button
          className="ml-auto rounded p-1 text-text-muted hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`${stage.name} options`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[120px] flex-col gap-2">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onOpen={onOpenDeal} />
          ))}
          {deals.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-text-muted">
              Drop a deal here
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function ViewTab({
  icon: Icon,
  label,
  active,
}: {
  icon: typeof List;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active ? "bg-muted text-text" : "text-text-muted hover:text-text"
      )}
      aria-pressed={active}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
