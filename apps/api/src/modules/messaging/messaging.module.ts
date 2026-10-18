import { Module } from "@nestjs/common";
import { MessagingService } from "./messaging.service";
import { MessagingController } from "./messaging.controller";
import { WebhooksController } from "./webhooks.controller";
import { WhatsAppCloudAdapter } from "./adapters/whatsapp-cloud.adapter";
import { AssignmentEngineModule } from "../assignment-engine/assignment-engine.module";

@Module({
  imports: [AssignmentEngineModule],
  controllers: [MessagingController, WebhooksController],
  providers: [MessagingService, WhatsAppCloudAdapter],
  exports: [MessagingService],
})
export class MessagingModule {}
