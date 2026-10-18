import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";

export const ESCALATION_QUEUE = "ESCALATION_QUEUE";
export const ESCALATION_QUEUE_NAME = "escalation";

@Global()
@Module({
  providers: [
    {
      provide: ESCALATION_QUEUE,
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("REDIS_URL", "redis://localhost:6380");
        return new Queue(ESCALATION_QUEUE_NAME, { connection: { ...parseRedisUrl(url) } });
      },
      inject: [ConfigService],
    },
  ],
  exports: [ESCALATION_QUEUE],
})
export class EscalationQueueModule {}

// BullMQ wants a connection options object, not a URL string, when sharing
// across Queue/Worker instances reliably.
export function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  };
}
