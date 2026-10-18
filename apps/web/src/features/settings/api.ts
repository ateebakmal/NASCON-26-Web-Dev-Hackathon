import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export type StageType = "OPEN" | "WON" | "LOST";
export type FieldType = "TEXT" | "NUMBER" | "DATE" | "DROPDOWN" | "CHECKBOX";
export type RecordType = "CONTACT" | "COMPANY" | "DEAL";

export interface SettingsStage {
  id: string;
  name: string;
  position: number;
  type: StageType;
  color: string;
  requiredFieldKeys: string[];
}

export interface SettingsField {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  recordType: RecordType;
  pipelineId: string | null;
  pipeline?: { id: string; name: string } | null;
}

export interface SettingsPipeline {
  id: string;
  name: string;
  isDefault: boolean;
  position: number;
  stages: SettingsStage[];
  customFields: SettingsField[];
}

/** Raised as 409 when deleting a stage that still holds deals. */
export interface StageNotEmptyError {
  error: "STAGE_NOT_EMPTY";
  message: string;
  stageId: string;
  dealCount: number;
  candidates: Array<{ id: string; name: string; type: StageType }>;
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["pipelines"] });
  qc.invalidateQueries({ queryKey: ["settings-pipelines"] });
  qc.invalidateQueries({ queryKey: ["custom-fields"] });
  qc.invalidateQueries({ queryKey: ["board"] });
};

export function usePipelineSettings() {
  return useQuery({
    queryKey: ["settings-pipelines"],
    queryFn: () => api.get<SettingsPipeline[]>("/pipelines"),
  });
}

export function useCustomFields() {
  return useQuery({
    queryKey: ["custom-fields"],
    queryFn: () => api.get<SettingsField[]>("/custom-fields"),
  });
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post("/pipelines", { name }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; isDefault?: boolean }) =>
      api.patch(`/pipelines/${id}`, body),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pipelineId, ...body }: { pipelineId: string; name: string; type?: StageType }) =>
      api.post(`/pipelines/${pipelineId}/stages`, body),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; requiredFieldKeys?: string[] }) =>
      api.patch(`/stages/${id}`, body),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: string; moveTo?: string }) =>
      api.del(`/stages/${id}${moveTo ? `?moveTo=${moveTo}` : ""}`),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useReorderStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pipelineId, orderedIds }: { pipelineId: string; orderedIds: string[] }) =>
      api.post(`/pipelines/${pipelineId}/stages/reorder`, { orderedIds }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCreateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      recordType: RecordType;
      pipelineId?: string | null;
      label: string;
      type: FieldType;
      options?: string[];
    }) => api.post("/custom-fields", body),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useArchiveField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/custom-fields/${id}`),
    onSuccess: () => invalidateAll(qc),
  });
}
