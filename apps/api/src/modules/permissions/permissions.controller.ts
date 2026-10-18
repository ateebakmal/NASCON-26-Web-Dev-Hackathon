import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PermissionsService } from "./permissions.service";
import type { Action, Resource } from "@ubp/shared";

@Controller("permission-sets")
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  // Owner/Admin manage permission sets; gated by baseRole in the service-level
  // check below rather than a bespoke permission key, since this IS the
  // permission-management surface itself.
  async list(@CurrentUser() user: { workspaceId: string }) {
    return this.permissions.listPermissionSets(user.workspaceId);
  }

  @Patch(":id")
  @RequirePermission("permission_sets:edit")
  async update(
    @CurrentUser() user: { workspaceId: string; userId: string; userName: string },
    @Param("id") id: string,
    @Body() body: { name?: string; items?: Array<{ resource: Resource; action: Action; fieldMask?: string[] }> }
  ) {
    return this.permissions.updatePermissionSet(user.workspaceId, id, body, {
      userId: user.userId,
      actorLabel: user.userName,
    });
  }
}
