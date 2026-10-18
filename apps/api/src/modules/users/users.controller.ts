import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import type { BaseRole } from "@prisma/client";
import { UsersService } from "./users.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission("users:view")
  async list(@CurrentUser() user: { workspaceId: string }) {
    return this.users.list(user.workspaceId);
  }

  @Post()
  @RequirePermission("users:create")
  async invite(
    @CurrentUser() user: { workspaceId: string; userId: string; userName: string; baseRole: BaseRole },
    @Body() body: { name: string; email: string; password: string; baseRole: BaseRole; permissionSetId?: string }
  ) {
    return this.users.invite(user.workspaceId, body, {
      userId: user.userId,
      actorLabel: user.userName,
      actorBaseRole: user.baseRole,
    });
  }

  @Patch(":id")
  @RequirePermission("users:edit")
  async update(
    @CurrentUser() user: { workspaceId: string; userId: string; userName: string; baseRole: BaseRole },
    @Param("id") id: string,
    @Body() body: { baseRole?: BaseRole; permissionSetId?: string }
  ) {
    return this.users.updateRoleAndPermissionSet(user.workspaceId, id, body, {
      userId: user.userId,
      actorLabel: user.userName,
      actorBaseRole: user.baseRole,
    });
  }
}
