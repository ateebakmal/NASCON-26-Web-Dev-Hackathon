import { Module } from "@nestjs/common";
import { LeadsService } from "./leads.service";
import { LeadsController } from "./leads.controller";
import { AssignmentEngineModule } from "../assignment-engine/assignment-engine.module";

@Module({
  imports: [AssignmentEngineModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
