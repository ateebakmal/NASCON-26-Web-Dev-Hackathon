import { Module } from "@nestjs/common";
import { CrmService } from "./crm.service";
import { CrmController } from "./crm.controller";
import { SavedListsService } from "./saved-lists.service";
import { SavedListsController } from "./saved-lists.controller";

@Module({
  controllers: [CrmController, SavedListsController],
  providers: [CrmService, SavedListsService],
  exports: [CrmService, SavedListsService],
})
export class CrmModule {}
