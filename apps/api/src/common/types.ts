import type { Request } from "express";
import type { BaseRole } from "@prisma/client";

export interface AuthenticatedRequest extends Request {
  userId: string;
  userName: string;
  workspaceId: string;
  baseRole: BaseRole;
}
