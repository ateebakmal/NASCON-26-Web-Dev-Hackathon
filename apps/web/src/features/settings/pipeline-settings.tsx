import * as React from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input, Select } from "../../components/ui/input";
import { ApiError } from "../../lib/api";
import { cn } from "../../lib/utils";
import {
  useCreatePipeline,
  useCreateStage,
  useDeleteStage,
  usePipelineSettings,
  useReorderStages,
  useUpdatePipeline,
  useUpdateStage,
  type SettingsPipeline,
  type SettingsStage,
  type StageNotEmptyError,
} from "./api";

const TYPE_VARIANT = { OPEN: "primary", WON: "success", LOST: "danger" } as const;

/**
 * The "settings, not code" surface for pipelines (F2.5, A2.1, A2.2, A2.4):
 * an Admin adds, renames, reorders and deletes stages, marks which fields a
 * stage requires, and the board reflects it immediately.
 */
export function PipelineSettings() {
  const { data, isLoading, isError } = usePipelineSettings();
  const createPipeline = useCreatePipeline();
  const [newPipeline, setNewPipeline] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading pipelines…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p role="alert" className="py-6 text-base text-danger">
        Could not load pipelines.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-2 p-4">
        <label className="flex flex-1 min-w-[200px] flex-col gap-1 text-sm text-text-muted">
          New pipeline
          <Input
            value={newPipeline}
            onChange={(e) => setNewPipeline(e.target.value)}
            placeholder="Commercial Solar"
          />
        </label>
        <Button
          loading={createPipeline.isPending}
          disabled={!newPipeline.trim()}
          onClick={async () => {
            setCreateError(null);
            try {
              await createPipeline.mutateAsync(newPipeline.trim());
              setNewPipeline("");
            } catch (err) {
              setCreateError(
                err instanceof ApiError ? err.message : "Could not create the pipeline"
              );
            }
          }}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create
        </Button>
        <p className="w-full text-xs text-text-muted">
          A new pipeline starts with New / In progress / Won / Lost, so it is usable immediately.
        </p>
        {createError && (
          <p role="alert" className="w-full text-sm text-danger">
            {createError}
          </p>
        )}
      </Card>

      {data.map((pipeline) => (
        <PipelineCard key={pipeline.id} pipeline={pipeline} />
      ))}
    </div>
  );
}

function PipelineCard({ pipeline }: { pipeline: SettingsPipeline }) {
  const updatePipeline = useUpdatePipeline();
  const createStage = useCreateStage();
  const reorder = useReorderStages();
  const [stageName, setStageName] = React.useState("");
  const [stageType, setStageType] = React.useState<"OPEN" | "WON" | "LOST">("OPEN");
  const [stageError, setStageError] = React.useState<string | null>(null);

  const move = (index: number, direction: -1 | 1) => {
    const ids = pipeline.stages.map((s) => s.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate({ pipelineId: pipeline.id, orderedIds: ids });
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-md font-semibold text-text">{pipeline.name}</h3>
        {pipeline.isDefault ? (
          <Badge variant="primary">
            <Star className="h-3 w-3" aria-hidden="true" />
            Default
          </Badge>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updatePipeline.mutate({ id: pipeline.id, isDefault: true })}
          >
            Make default
          </Button>
        )}
        <span className="ml-auto text-sm text-text-muted">
          {pipeline.customFields.length} field(s) specific to this pipeline
        </span>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {pipeline.stages.map((stage, i) => (
          <StageRow
            key={stage.id}
            stage={stage}
            pipeline={pipeline}
            isFirst={i === 0}
            isLast={i === pipeline.stages.length - 1}
            onMove={(d) => move(i, d)}
          />
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <label className="flex flex-1 min-w-[160px] flex-col gap-1 text-sm text-text-muted">
          Add stage
          <Input
            value={stageName}
            onChange={(e) => setStageName(e.target.value)}
            placeholder="Site survey"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-muted">
          Type
          <Select
            value={stageType}
            onChange={(e) => setStageType(e.target.value as "OPEN" | "WON" | "LOST")}
          >
            <option value="OPEN">Open</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
          </Select>
        </label>
        <Button
          variant="secondary"
          loading={createStage.isPending}
          disabled={!stageName.trim()}
          onClick={async () => {
            setStageError(null);
            try {
              await createStage.mutateAsync({
                pipelineId: pipeline.id,
                name: stageName.trim(),
                type: stageType,
              });
              setStageName("");
            } catch (err) {
              setStageError(err instanceof ApiError ? err.message : "Could not add the stage");
            }
          }}
        >
          Add
        </Button>
        {stageError && (
          <p role="alert" className="w-full text-sm text-danger">
            {stageError}
          </p>
        )}
      </div>
    </Card>
  );
}

function StageRow({
  stage,
  pipeline,
  isFirst,
  isLast,
  onMove,
}: {
  stage: SettingsStage;
  pipeline: SettingsPipeline;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const [name, setName] = React.useState(stage.name);
  const [blocked, setBlocked] = React.useState<StageNotEmptyError | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setName(stage.name), [stage.name]);

  // Deal fields usable as "required to enter this stage": the ones shared by
  // every pipeline plus the ones belonging to this one (F2.3).
  const dealFields = pipeline.customFields.filter((f) => f.recordType === "DEAL");

  const remove = async (moveTo?: string) => {
    setError(null);
    try {
      await deleteStage.mutateAsync({ id: stage.id, moveTo });
      setBlocked(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { message?: StageNotEmptyError } & StageNotEmptyError;
        const payload = (body?.message ?? body) as StageNotEmptyError;
        if (payload?.error === "STAGE_NOT_EMPTY") return setBlocked(payload);
      }
      setError(err instanceof ApiError ? err.message : "Could not delete the stage");
    }
  };

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col">
          <button
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label={`Move ${stage.name} earlier`}
            className="rounded p-0.5 text-text-muted hover:bg-muted disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label={`Move ${stage.name} later`}
            className="rounded p-0.5 text-text-muted hover:bg-muted disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== stage.name && updateStage.mutate({ id: stage.id, name: name.trim() })}
          className="max-w-[200px]"
          aria-label={`${stage.name} name`}
        />
        <Badge variant={TYPE_VARIANT[stage.type]}>{stage.type}</Badge>

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5 text-danger"
          loading={deleteStage.isPending}
          onClick={() => remove()}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete
        </Button>
      </div>

      {dealFields.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <span className="text-sm text-text-muted">Required to enter:</span>
          {dealFields.map((f) => {
            const checked = stage.requiredFieldKeys.includes(f.key);
            return (
              <label key={f.id} className="flex items-center gap-1.5 text-sm text-text">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={checked}
                  onChange={() =>
                    updateStage.mutate({
                      id: stage.id,
                      requiredFieldKeys: checked
                        ? stage.requiredFieldKeys.filter((k) => k !== f.key)
                        : [...stage.requiredFieldKeys, f.key],
                    })
                  }
                />
                {f.label}
              </label>
            );
          })}
        </div>
      )}

      {blocked && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3">
          <p className="text-sm text-text">{blocked.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select
              defaultValue=""
              onChange={(e) => e.target.value && remove(e.target.value)}
              aria-label="Move deals to"
              className="max-w-[220px]"
            >
              <option value="">Move the deals to…</option>
              {blocked.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setBlocked(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className={cn("mt-2 text-sm text-danger")}>
          {error}
        </p>
      )}
    </li>
  );
}
