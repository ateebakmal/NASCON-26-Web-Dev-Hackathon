import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CrmService } from "./crm.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { MaskFields } from "../../common/interceptors/field-mask.interceptor";

type Caller = { workspaceId: string; userId: string; userName: string };

@Controller()
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  // ------------------------------------------------------------------ pipelines

  @Get("pipelines")
  @RequirePermission("opportunities:view")
  listPipelines(@CurrentUser() user: Caller) {
    return this.crm.listPipelines(user.workspaceId);
  }

  @Get("pipelines/board")
  @RequirePermission("opportunities:view")
  @MaskFields("opportunities")
  board(@CurrentUser() user: Caller, @Query("pipelineId") pipelineId?: string) {
    return this.crm.getBoard(user.workspaceId, pipelineId);
  }

  @Patch("stages/:id")
  @RequirePermission("opportunities:edit")
  updateStage(
    @CurrentUser() user: Caller,
    @Param("id") id: string,
    @Body() body: { name?: string; position?: number; requiredFieldKeys?: string[] }
  ) {
    return this.crm.updateStage(user.workspaceId, id, body, {
      userId: user.userId,
      actorLabel: user.userName,
    });
  }

  // -------------------------------------------------------------- opportunities

  @Get("opportunities")
  @RequirePermission("opportunities:view")
  @MaskFields("opportunities")
  listOpportunities(
    @CurrentUser() user: Caller,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "50"
  ) {
    const take = Math.min(Number(pageSize) || 50, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    return this.crm.listOpportunities(user.workspaceId, { skip, take });
  }

  @Post("opportunities")
  @RequirePermission("opportunities:create")
  createOpportunity(
    @CurrentUser() user: Caller,
    @Body()
    body: {
      name: string;
      value?: number;
      contactId: string;
      pipelineId?: string;
      stageId?: string;
      tag?: string;
    }
  ) {
    return this.crm.createOpportunity(user.workspaceId, body, {
      userId: user.userId,
      actorLabel: user.userName,
    });
  }

  @Patch("opportunities/:id/stage")
  @RequirePermission("opportunities:edit")
  moveStage(
    @CurrentUser() user: Caller,
    @Param("id") id: string,
    @Body() body: { stageId: string; fields?: Record<string, unknown> }
  ) {
    return this.crm.moveOpportunityStage(
      user.workspaceId,
      id,
      body.stageId,
      { userId: user.userId, actorLabel: user.userName },
      body.fields
    );
  }

  // ------------------------------------------------------------------- contacts

  @Get("contacts")
  @RequirePermission("contacts:view")
  listContacts(
    @CurrentUser() user: Caller,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "25",
    @Query("search") search?: string
  ) {
    const take = Math.min(Number(pageSize) || 25, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    return this.crm.listContacts(user.workspaceId, { skip, take }, search);
  }

  @Get("contacts/:id")
  @RequirePermission("contacts:view")
  @MaskFields("opportunities")
  getContact(@CurrentUser() user: Caller, @Param("id") id: string) {
    return this.crm.getContact(user.workspaceId, id);
  }

  @Post("contacts")
  @RequirePermission("contacts:create")
  createContact(
    @CurrentUser() user: Caller,
    @Body() body: { name: string; email?: string; phone?: string; companyId?: string; tags?: string[] }
  ) {
    return this.crm.createContact(user.workspaceId, body, {
      userId: user.userId,
      actorLabel: user.userName,
    });
  }

  // ------------------------------------------------------------------ companies

  @Get("companies")
  @RequirePermission("companies:view")
  listCompanies(@CurrentUser() user: Caller) {
    return this.crm.listCompanies(user.workspaceId);
  }

  // --------------------------------------------------------------- custom fields

  @Get("custom-fields")
  @RequirePermission("opportunities:view")
  listCustomFields(@CurrentUser() user: Caller) {
    return this.crm.listCustomFields(user.workspaceId);
  }

  @Post("custom-fields")
  @RequirePermission("opportunities:edit")
  createCustomField(
    @CurrentUser() user: Caller,
    @Body()
    body: {
      recordType: "CONTACT" | "COMPANY" | "DEAL";
      pipelineId?: string | null;
      label: string;
      type: "TEXT" | "NUMBER" | "DATE" | "DROPDOWN" | "CHECKBOX";
      options?: string[];
    }
  ) {
    return this.crm.createCustomField(user.workspaceId, body, {
      userId: user.userId,
      actorLabel: user.userName,
    });
  }

  @Delete("custom-fields/:id")
  @RequirePermission("opportunities:edit")
  archiveCustomField(@CurrentUser() user: Caller, @Param("id") id: string) {
    return this.crm.archiveCustomField(user.workspaceId, id, {
      userId: user.userId,
      actorLabel: user.userName,
    });
  }
}
