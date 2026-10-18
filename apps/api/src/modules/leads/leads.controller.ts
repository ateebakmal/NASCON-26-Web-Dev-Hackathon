import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { LeadsService } from "./leads.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { createLeadSchema, type CreateLeadDto } from "@ubp/shared";

@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  @RequirePermission("leads:create")
  async create(
    @CurrentUser() user: { workspaceId: string; userId: string; userName: string },
    @Body(new ZodValidationPipe(createLeadSchema)) body: CreateLeadDto
  ) {
    return this.leads.create(user.workspaceId, body, { userId: user.userId, actorLabel: user.userName });
  }

  @Get()
  @RequirePermission("leads:view")
  async list(
    @CurrentUser() user: { workspaceId: string },
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "25"
  ) {
    const take = Math.min(Number(pageSize) || 25, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    return this.leads.list(user.workspaceId, { skip, take });
  }

  @Get("recovery-queue")
  @RequirePermission("leads:view")
  async recoveryQueue(@CurrentUser() user: { workspaceId: string }) {
    return this.leads.recoveryQueue(user.workspaceId);
  }

  @Get(":id")
  @RequirePermission("leads:view")
  async getOne(@CurrentUser() user: { workspaceId: string }, @Param("id") id: string) {
    return this.leads.getOne(user.workspaceId, id);
  }

  @Post(":id/acknowledge")
  @RequirePermission("leads:acknowledge")
  async acknowledge(
    @CurrentUser() user: { workspaceId: string; userId: string; userName: string },
    @Param("id") id: string
  ) {
    const result = await this.leads.acknowledge(user.workspaceId, id, user.userId, user.userName);
    if (result.status === "not_your_lead") {
      throw new BadRequestException("This lead is not currently assigned to you");
    }
    if (result.status === "already_resolved") {
      throw new BadRequestException("This lead has already been acknowledged or escalated");
    }
    return result.lead;
  }
}
