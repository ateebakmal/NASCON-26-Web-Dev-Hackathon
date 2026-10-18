import { Module } from "@nestjs/common";
import { EmployeeStatusService } from "./employee-status.service";
import { EmployeeStatusController } from "./employee-status.controller";
import { AssignmentEngineModule } from "../assignment-engine/assignment-engine.module";

@Module({
  imports: [AssignmentEngineModule],
  controllers: [EmployeeStatusController],
  providers: [EmployeeStatusService],
})
export class EmployeeStatusModule {}
