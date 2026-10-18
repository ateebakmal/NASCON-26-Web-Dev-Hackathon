import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateLeadDto } from "@ubp/shared";
import { api } from "../../lib/api";
import type { Lead, RecoveryQueueItem } from "./types";

export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: () => api.get<{ items: Lead[]; total: number }>("/leads?pageSize=100"),
    refetchInterval: 5000, // belt-and-suspenders alongside the socket push
  });
}

export function useRecoveryQueue() {
  return useQuery({
    queryKey: ["recovery-queue"],
    queryFn: () => api.get<RecoveryQueueItem[]>("/leads/recovery-queue"),
    refetchInterval: 5000,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateLeadDto) => api.post<Lead>("/leads", dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-queue"] });
    },
  });
}

export function useAcknowledgeLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => api.post<Lead>(`/leads/${leadId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-queue"] });
    },
  });
}
