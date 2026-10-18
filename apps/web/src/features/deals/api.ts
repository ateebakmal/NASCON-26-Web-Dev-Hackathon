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

export interface CreateDealInput {
  name: string;
  value: number;
  contactId: string;
  pipelineId?: string;
  stageId?: string;
  tag?: string;
}

export function useCreateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDealInput) => api.post("/opportunities", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export interface Payment {
  id: string;
  amount: string;
  currency: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "FAILED" | "REFUNDED";
  providerRef: string | null;
  checkoutUrl: string | null;
  refundedAmount: string;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function usePayments(opportunityId: string | undefined) {
  return useQuery({
    queryKey: ["payments", opportunityId],
    queryFn: () => api.get<Payment[]>(`/opportunities/${opportunityId}/payments`),
    enabled: Boolean(opportunityId),
    // Status is driven by Stripe's webhook, so poll while one is outstanding.
    refetchInterval: 5000,
  });
}

export function useCreatePaymentLink(opportunityId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: number; currency?: string; send?: boolean }) =>
      api.post<{ payment?: Payment; accepted?: boolean; reason?: string } & Payment>(
        `/opportunities/${opportunityId}/payment-link`,
        input
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", opportunityId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useExpirePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => api.post(`/payments/${paymentId}/expire`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payments"] }),
  });
}
