import { Module } from "@nestjs/common";
import { AssignmentEngineService } from "./assignment-engine.service";
import { AssignmentRuleController } from "./assignment-rule.controller";
import { EscalationWorker } from "./escalation.worker";

@Module({
  controllers: [AssignmentRuleController],
  providers: [AssignmentEngineService, EscalationWorker],
  exports: [AssignmentEngineService],
})
export class AssignmentEngineModule {}
