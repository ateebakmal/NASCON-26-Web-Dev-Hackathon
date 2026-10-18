import { z } from "zod";

export const createLeadSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateLeadDto = z.infer<typeof createLeadSchema>;

export const employeeStatusSchema = z.object({
  availability: z.enum(["AVAILABLE", "BUSY", "ON_LEAVE", "OFFLINE"]),
});
export type EmployeeStatusDto = z.infer<typeof employeeStatusSchema>;

export const assignmentRuleSchema = z.object({
  ackWindowSeconds: z.number().int().min(1),
  idleThresholdSeconds: z.number().int().min(1),
  escalationLevels: z
    .array(
      z.object({
        type: z.enum(["next_eligible", "backup", "manager"]),
        userId: z.string().cuid().optional(),
        timeoutSeconds: z.number().int().min(1),
      })
    )
    .min(1),
});
export type AssignmentRuleDto = z.infer<typeof assignmentRuleSchema>;
