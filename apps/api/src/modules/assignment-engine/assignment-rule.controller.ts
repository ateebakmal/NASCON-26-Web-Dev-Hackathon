import { Body, Controller, Get, Post } from "@nestjs/common";
import { AssignmentEngineService } from "./assignment-engine.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { assignmentRuleSchema, type AssignmentRuleDto } from "@ubp/shared";

@Controller("assignment-rules")
export class AssignmentRuleController {
  constructor(private readonly engine: AssignmentEngineService) {}

  @Get("active")
  @RequirePermission("assignment_rules:view")
  async getActive(@CurrentUser() user: { workspaceId: string }) {
    return this.engine.getActiveRule(user.workspaceId);
  }

  @Post()
  @RequirePermission("assignment_rules:manage_assignment_rules")
  async upsert(
    @CurrentUser() user: { workspaceId: string; userId: string; userName: string },
    @Body(new ZodValidationPipe(assignmentRuleSchema)) body: AssignmentRuleDto
  ) {
    return this.engine.upsertRule(user.workspaceId, body, { userId: user.userId, actorLabel: user.userName });
  }
}
