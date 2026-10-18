import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker } from "bullmq";
import { AssignmentEngineService } from "./assignment-engine.service";
import { ESCALATION_QUEUE_NAME, parseRedisUrl } from "../../queue/escalation.queue";
import { ESCALATION_JOB_NAME, type EscalationJobPayload } from "./assignment-engine.types";

@Injectable()
export class EscalationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EscalationWorker.name);
  private worker?: Worker;

  constructor(
    private readonly assignmentEngine: AssignmentEngineService,
    private readonly config: ConfigService
  ) {}

  onModuleInit() {
    const url = this.config.get<string>("REDIS_URL", "redis://localhost:6380");
    this.worker = new Worker(
      ESCALATION_QUEUE_NAME,
      async (job) => {
        if (job.name !== ESCALATION_JOB_NAME) return;
        const payload = job.data as EscalationJobPayload;
        await this.assignmentEngine.fireEscalation(payload);
      },
      { connection: parseRedisUrl(url) }
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error(`Escalation job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
