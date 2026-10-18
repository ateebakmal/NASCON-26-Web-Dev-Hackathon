import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface DashboardOverview {
  newLeadsToday: number;
  openLeads: number;
  escalations24h: number;
  recoveryCount: number;
  avgResponseSeconds: number;
  // null when the caller lacks "see deal values" -- masked server-side (F1.4).
  openPipelineValue: number | null;
  collectedThisMonth: number | null;
  conversionRate: number;
  leadsManagement: { open: number; inProgress: number; lost: number; won: number };
  byStage: Array<{ stageId: string; name: string; type: string; color: string; count: number; value: number }>;
  availability: Array<{ availability: string; count: number }>;
  upcomingAppointments: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    contact: { name: string } | null;
  }>;
  revenueSeries: Array<{ month: string; value: number }>;
  escalationSeries: Array<{ day: string; count: number }>;
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardOverview>("/dashboard"),
    refetchInterval: 10000,
  });
}
