import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { BoardResponse } from "./types";

export function useBoard(pipelineId?: string) {
  return useQuery({
    queryKey: ["board", pipelineId ?? "default"],
    queryFn: () =>
      api.get<BoardResponse>(`/pipelines/board${pipelineId ? `?pipelineId=${pipelineId}` : ""}`),
  });
}

export function usePipelines() {
  return useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.get<Array<{ id: string; name: string; isDefault: boolean }>>("/pipelines"),
  });
}

export function useMoveStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealId,
      stageId,
      fields,
    }: {
      dealId: string;
      stageId: string;
      fields?: Record<string, unknown>;
    }) => api.patch(`/opportunities/${dealId}/stage`, { stageId, fields }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
