import { Controller, Get, Query } from "@nestjs/common";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuditService } from "./audit.service";

// Intentionally no POST/PATCH/DELETE route exists here -- the audit trail is
// append-only at the API surface, not merely permission-gated against writes.
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission("audit:view_audit")
  async list(
    @CurrentUser() user: { workspaceId: string },
    @Query("eventType") eventType?: string,
    @Query("actorId") actorId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "25"
  ) {
    const take = Math.min(Number(pageSize) || 25, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    return this.audit.list(
      user.workspaceId,
      {
        eventType,
        actorId,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
      { skip, take }
    );
  }
}
