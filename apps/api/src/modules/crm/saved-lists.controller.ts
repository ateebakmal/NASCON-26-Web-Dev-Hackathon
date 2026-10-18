import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { SavedListsService, type ListFilter } from "./saved-lists.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { MaskFields } from "../../common/interceptors/field-mask.interceptor";

type Caller = { workspaceId: string; userId: string; userName: string };

@Controller("saved-lists")
export class SavedListsController {
  constructor(private readonly lists: SavedListsService) {}

  @Get()
  @RequirePermission("opportunities:view")
  list(@CurrentUser() user: Caller, @Query("recordType") recordType?: string) {
    return this.lists.list(user.workspaceId, recordType);
  }

  @Post()
  @RequirePermission("opportunities:create")
  create(
    @CurrentUser() user: Caller,
    @Body()
    body: { name: string; recordType: "DEAL" | "CONTACT"; filters: ListFilter[]; isShared?: boolean }
  ) {
    return this.lists.create(user.workspaceId, body, {
      userId: user.userId,
      actorLabel: user.userName,
    });
  }

  /** Runs an ad-hoc filter set without saving it, for live preview. */
  @Post("preview")
  @RequirePermission("opportunities:view")
  @MaskFields("opportunities")
  preview(
    @CurrentUser() user: Caller,
    @Body() body: { recordType: "DEAL" | "CONTACT"; filters: ListFilter[] }
  ) {
    return this.lists.run(user.workspaceId, body.recordType, body.filters ?? []);
  }

  /** Re-evaluates the stored filter, so the result is always current. */
  @Get(":id/run")
  @RequirePermission("opportunities:view")
  @MaskFields("opportunities")
  run(@CurrentUser() user: Caller, @Param("id") id: string) {
    return this.lists.runSaved(user.workspaceId, id);
  }

  @Delete(":id")
  @RequirePermission("opportunities:delete")
  remove(@CurrentUser() user: Caller, @Param("id") id: string) {
    return this.lists.remove(user.workspaceId, id, {
      userId: user.userId,
      actorLabel: user.userName,
    });
  }
}
