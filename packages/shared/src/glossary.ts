// Typed constants mirroring the problem statement's Section 7 glossary.
// Centralized so the backend's recovery-queue/dashboard computations and the
// frontend's display logic use the identical definitions (Q12: same figure,
// same value everywhere).

export const EMPLOYEE_AVAILABILITY = ["AVAILABLE", "BUSY", "ON_LEAVE", "OFFLINE"] as const;
export type EmployeeAvailability = (typeof EMPLOYEE_AVAILABILITY)[number];

export const LEAD_SOURCE = ["WEB_FORM", "WHATSAPP", "MANUAL"] as const;
export type LeadSource = (typeof LEAD_SOURCE)[number];

export const LEAD_STATUS = [
  "NEW",
  "ASSIGNED",
  "ACKNOWLEDGED",
  "ESCALATED",
  "CONVERTED",
  "LOST",
] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];

export const ASSIGNMENT_END_REASON = [
  "ACKNOWLEDGED",
  "ESCALATED_TIMEOUT",
  "MANUAL_REASSIGN",
  "STATUS_CHANGE_REASSIGN",
] as const;
export type AssignmentEndReason = (typeof ASSIGNMENT_END_REASON)[number];

/** A lead qualifies for the recovery queue when any of these hold. */
export type RecoveryReason = "UNACKED_PAST_WINDOW" | "ESCALATED_REPEATEDLY" | "IDLE";

export const ESCALATED_REPEATEDLY_THRESHOLD = 2;
