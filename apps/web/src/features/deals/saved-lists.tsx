import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Plus, X } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input, Select } from "../../components/ui/input";
import { api, ApiError } from "../../lib/api";
import { cn } from "../../lib/utils";
import type { Deal, Stage } from "./types";

export interface ListFilter {
  field: string;
  operator: string;
  value: string | number;
}

export interface SavedList {
  id: string;
  name: string;
  recordType: string;
  filters: ListFilter[];
}

const FIELDS = [
  { value: "stage", label: "Stage" },
  { value: "owner", label: "Owner" },
  { value: "tag", label: "Tag contains" },
  { value: "value", label: "Value" },
  { value: "createdAt", label: "Created in last N days" },
] as const;

function useSavedLists() {
  return useQuery({
    queryKey: ["saved-lists", "DEAL"],
    queryFn: () => api.get<SavedList[]>("/saved-lists?recordType=DEAL"),
  });
}

/**
 * The list stores its FILTER, so re-running it always reflects current
 * records -- a deal that later starts matching appears without anyone
 * editing the list (F2.6).
 */
export function SavedListsBar({
  stages,
  owners,
  onResults,
}: {
  stages: Stage[];
  owners: Array<{ id: string; name: string }>;
  onResults: (deals: Deal[] | null, label: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const { data: lists } = useSavedLists();
  const [open, setOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<ListFilter[]>([]);
  const [name, setName] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const preview = useMutation({
    mutationFn: (f: ListFilter[]) =>
      api.post<Deal[]>("/saved-lists/preview", { recordType: "DEAL", filters: f }),
  });

  const runSaved = useMutation({
    mutationFn: (id: string) => api.get<{ list: SavedList; items: Deal[] }>(`/saved-lists/${id}/run`),
  });

  const save = useMutation({
    mutationFn: (body: { name: string; filters: ListFilter[] }) =>
      api.post("/saved-lists", { ...body, recordType: "DEAL" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-lists"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/saved-lists/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-lists"] }),
  });

  const addFilter = () =>
    setFilters((f) => [...f, { field: "stage", operator: "equals", value: stages[0]?.id ?? "" }]);

  const update = (i: number, patch: Partial<ListFilter>) =>
    setFilters((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const applyPreview = async () => {
    setError(null);
    const results = await preview.mutateAsync(filters);
    setActiveId(null);
    onResults(results, `${filters.length} filter(s) · ${results.length} match`);
  };

  const applySaved = async (list: SavedList) => {
    const res = await runSaved.mutateAsync(list.id);
    setActiveId(list.id);
    setFilters(res.list.filters);
    onResults(res.items, `${list.name} · ${res.items.length} match`);
  };

  const clear = () => {
    setActiveId(null);
    setFilters([]);
    onResults(null, null);
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bookmark className="h-4 w-4 text-text-muted" aria-hidden="true" />
        <span className="text-sm font-medium text-text">Saved lists</span>

        {lists?.length === 0 && <span className="text-sm text-text-muted">none yet</span>}

        {lists?.map((l) => (
          <span key={l.id} className="flex items-center">
            <button
              onClick={() => applySaved(l)}
              className={cn(
                "rounded-l-sm border border-border px-2.5 py-1 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                activeId === l.id ? "bg-primary/10 text-primary" : "text-text hover:bg-muted"
              )}
            >
              {l.name}
            </button>
            <button
              onClick={() => remove.mutate(l.id)}
              aria-label={`Delete ${l.name}`}
              className="rounded-r-sm border border-l-0 border-border px-1.5 py-1 text-text-muted hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {activeId || filters.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} aria-pressed={open}>
            {open ? "Hide filters" : "Filter & save"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          {filters.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select
                value={f.field}
                onChange={(e) => update(i, { field: e.target.value, value: "" })}
                className="max-w-[180px]"
                aria-label="Filter field"
              >
                {FIELDS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </Select>

              {f.field === "stage" ? (
                <Select
                  value={String(f.value)}
                  onChange={(e) => update(i, { value: e.target.value })}
                  className="max-w-[180px]"
                  aria-label="Stage"
                >
                  <option value="">Select…</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              ) : f.field === "owner" ? (
                <Select
                  value={String(f.value)}
                  onChange={(e) => update(i, { value: e.target.value })}
                  className="max-w-[180px]"
                  aria-label="Owner"
                >
                  <option value="">Select…</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              ) : f.field === "value" ? (
                <>
                  <Select
                    value={f.operator}
                    onChange={(e) => update(i, { operator: e.target.value })}
                    className="max-w-[120px]"
                    aria-label="Comparison"
                  >
                    <option value="gt">over</option>
                    <option value="lt">under</option>
                  </Select>
                  <Input
                    type="number"
                    value={String(f.value)}
                    onChange={(e) => update(i, { value: e.target.value })}
                    className="max-w-[140px]"
                    placeholder="1000000"
                  />
                </>
              ) : (
                <Input
                  value={String(f.value)}
                  onChange={(e) => update(i, { value: e.target.value })}
                  className="max-w-[180px]"
                  placeholder={f.field === "createdAt" ? "7" : "Rooftop"}
                />
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters((x) => x.filter((_, idx) => idx !== i))}
                aria-label="Remove filter"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={addFilter} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add criterion
            </Button>
            <Button
              size="sm"
              onClick={applyPreview}
              loading={preview.isPending}
              disabled={filters.length === 0}
            >
              Apply
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this list"
                className="max-w-[200px]"
                aria-label="List name"
              />
              <Button
                variant="secondary"
                size="sm"
                loading={save.isPending}
                disabled={!name.trim() || filters.length === 0}
                onClick={async () => {
                  setError(null);
                  try {
                    await save.mutateAsync({ name: name.trim(), filters });
                    setName("");
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Could not save the list");
                  }
                }}
              >
                Save list
              </Button>
            </div>
          </div>

          {filters.length >= 3 && (
            <Badge variant="success" className="w-fit">
              {filters.length} criteria combined
            </Badge>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
