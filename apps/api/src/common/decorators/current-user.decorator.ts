import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "../types";

/** Reads the session-derived user/workspace context attached by SessionAuthGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return { userId: req.userId, userName: req.userName, workspaceId: req.workspaceId, baseRole: req.baseRole };
});
