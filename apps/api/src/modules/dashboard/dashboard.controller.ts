import { Controller, Get } from "@nestjs/common";
import type { BaseRole } from "@prisma/client";
import { DashboardService } from "./dashboard.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { MaskFields } from "../../common/interceptors/field-mask.interceptor";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermission("leads:view")
  @MaskFields("opportunities")
  overview(@CurrentUser() user: { workspaceId: string; userId: string; baseRole: BaseRole }) {
    // Owner/Admin see company-wide figures; a plain User sees their own (F5.4).
    const companyWide = user.baseRole === "OWNER" || user.baseRole === "ADMIN";
    return this.dashboard.overview(user.workspaceId, companyWide ? undefined : user.userId);
  }
}
