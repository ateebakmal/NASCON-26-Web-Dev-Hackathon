import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  optedOut: boolean;
  company: { id: string; name: string } | null;
  _count: { opportunities: number };
}

export interface ContactDetail extends ContactRow {
  customFields: Record<string, unknown>;
  opportunities: Array<{
    id: string;
    name: string;
    value: string | number | null;
    currency: string;
    stage: { id: string; name: string; type: string };
    pipeline: { id: string; name: string };
    owner: { id: string; name: string } | null;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    currency: string;
    status: string;
    providerRef: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
  appointments: Array<{ id: string; title: string; startsAt: string; endsAt: string }>;
  timeline: Array<{
    id: string;
    eventType: string;
    actorLabel: string;
    targetType: string;
    before: unknown;
    after: unknown;
    createdAt: string;
  }>;
  leads: Array<{ id: string; name: string; source: string; status: string; createdAt: string }>;
}

export function useContacts(search: string) {
  return useQuery({
    queryKey: ["contacts", search],
    queryFn: () =>
      api.get<{ items: ContactRow[]; total: number }>(
        `/contacts?pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ""}`
      ),
  });
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: ["contact", id],
    queryFn: () => api.get<ContactDetail>(`/contacts/${id}`),
    enabled: Boolean(id),
  });
}
