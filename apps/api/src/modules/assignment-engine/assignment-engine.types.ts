export const ESCALATION_JOB_NAME = "escalate-lead";

export interface EscalationJobPayload {
  leadId: string;
  assignmentId: string;
  escalationJobId: string;
}

export type EscalationLevelType = "next_eligible" | "backup" | "manager";

export interface EscalationLevel {
  type: EscalationLevelType;
  userId?: string;
  timeoutSeconds: number;
}
