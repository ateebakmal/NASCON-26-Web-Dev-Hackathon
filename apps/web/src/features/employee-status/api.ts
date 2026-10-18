import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export type Availability = "AVAILABLE" | "BUSY" | "ON_LEAVE" | "OFFLINE";

export interface EmployeeStatusRow {
  id: string;
  userId: string;
  availability: Availability;
  maxOpenLeads: number;
  user: { id: string; name: string; email: string };
}

export function useEmployeeStatuses() {
  return useQuery({
    queryKey: ["employee-status"],
    queryFn: () => api.get<EmployeeStatusRow[]>("/employee-status"),
    refetchInterval: 10000,
  });
}

export function useSetMyAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (availability: Availability) => api.patch("/employee-status/me", { availability }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employee-status"] }),
  });
}

/** Lets an Admin set someone else's availability, not just their own (F3.2). */
export function useSetAvailabilityFor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, availability }: { userId: string; availability: Availability }) =>
      api.patch(`/employee-status/${userId}`, { availability }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-status"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
