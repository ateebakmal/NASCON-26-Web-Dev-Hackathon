import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Action, Resource } from "@ubp/shared";
import { api } from "../../lib/api";

export interface PermissionSetItem {
  id: string;
  resource: Resource;
  action: Action;
  fieldMask: string[];
}

export interface PermissionSetRow {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: PermissionSetItem[];
  users: Array<{ id: string; name: string; email: string }>;
}

export function usePermissionSets() {
  return useQuery({
    queryKey: ["permission-sets"],
    queryFn: () => api.get<PermissionSetRow[]>("/permission-sets"),
  });
}

export function useUpdatePermissionSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: Array<{ resource: Resource; action: Action }> }) =>
      api.patch(`/permission-sets/${id}`, { items }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["permission-sets"] }),
  });
}
