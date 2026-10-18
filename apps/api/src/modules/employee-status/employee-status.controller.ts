import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { EmployeeStatusService } from "./employee-status.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { employeeStatusSchema, type EmployeeStatusDto } from "@ubp/shared";

@Controller("employee-status")
export class EmployeeStatusController {
  constructor(private readonly service: EmployeeStatusService) {}

  @Get()
  @RequirePermission("employees:view")
  async list(@CurrentUser() user: { workspaceId: string }) {
    return this.service.list(user.workspaceId);
  }

  // A user may always set their OWN availability (self-service), independent
  // of the "employees:edit" permission used for an Admin overriding someone
  // else's status.
  @Patch("me")
  async setMine(
    @CurrentUser() user: { workspaceId: string; userId: string; userName: string },
    @Body(new ZodValidationPipe(employeeStatusSchema)) body: EmployeeStatusDto
  ) {
    return this.service.setAvailability(user.workspaceId, user.userId, body.availability, {
      userId: user.userId,
      actorLabel: user.userName,
    });
  }

  @Patch(":userId")
  @RequirePermission("employees:edit")
  async setForUser(
    @CurrentUser() user: { workspaceId: string; userId: string; userName: string },
    @Param("userId") targetUserId: string,
    @Body(new ZodValidationPipe(employeeStatusSchema)) body: EmployeeStatusDto
  ) {
    return this.service.setAvailability(user.workspaceId, targetUserId, body.availability, {
      userId: user.userId,
      actorLabel: user.userName,
    });
  }
}
