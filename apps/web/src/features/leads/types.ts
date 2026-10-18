export type LeadStatus = "NEW" | "ASSIGNED" | "ACKNOWLEDGED" | "ESCALATED" | "CONVERTED" | "LOST";

export interface EscalationJob {
  id: string;
  fireAt: string;
  status: "PENDING" | "FIRED" | "CANCELLED";
}

export interface LeadAssignment {
  id: string;
  assigneeId: string;
  assignedAt: string;
  ackAt: string | null;
  endedAt: string | null;
  escalationLevel: number;
  assignee: { id: string; name: string };
  escalationJobs?: EscalationJob[];
}

export type LeadSource = "WEB_FORM" | "WHATSAPP" | "MANUAL";

export interface Lead {
  id: string;
  name: string;
  source: LeadSource;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: LeadStatus;
  currentOwnerId: string | null;
  escalationCount: number;
  createdAt: string;
  assignments: LeadAssignment[];
  escalationJobs?: EscalationJob[];
}

export type RecoveryReason = "UNACKED_PAST_WINDOW" | "ESCALATED_REPEATEDLY" | "IDLE";

export interface RecoveryQueueItem {
  lead: Lead;
  reason: RecoveryReason;
}
