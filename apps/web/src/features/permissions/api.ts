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

export type BaseRole = "OWNER" | "ADMIN" | "USER";

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  baseRole: BaseRole;
  isActive: boolean;
  permissionSet: { id: string; name: string } | null;
}

export function useWorkspaceUsers() {
  return useQuery({
    queryKey: ["workspace-users"],
    queryFn: () => api.get<WorkspaceUser[]>("/users"),
  });
}

function invalidateMembers(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["workspace-users"] });
  qc.invalidateQueries({ queryKey: ["permission-sets"] });
}

/** Assigns a member to a role, or changes their base level. */
export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; baseRole?: BaseRole; permissionSetId?: string }) =>
      api.patch(`/users/${id}`, body),
    onSuccess: () => invalidateMembers(qc),
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      email: string;
      password: string;
      baseRole: BaseRole;
      permissionSetId?: string;
    }) => api.post("/users", body),
    onSuccess: () => invalidateMembers(qc),
  });
}
