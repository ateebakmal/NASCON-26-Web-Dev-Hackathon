import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { Prisma, PrismaClient } from "@prisma/client";

export interface AuditEntry {
  workspaceId: string;
  actorId?: string | null;
  actorLabel: string;
  eventType: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append-only writer. There is no corresponding update/delete method and no
   * controller route exposes one -- tamper resistance (F4.3) is structural,
   * not just permission-gated.
   */
  async record(entry: AuditEntry, tx?: Prisma.TransactionClient) {
    const client = (tx ?? this.prisma) as PrismaClient;
    return client.auditLog.create({
      data: {
        workspaceId: entry.workspaceId,
        actorId: entry.actorId ?? null,
        actorLabel: entry.actorLabel,
        eventType: entry.eventType,
        targetType: entry.targetType,
        targetId: entry.targetId,
        before: toJson(entry.before),
        after: toJson(entry.after),
      },
    });
  }

  async list(
    workspaceId: string,
    filters: { eventType?: string; actorId?: string; from?: Date; to?: Date },
    page: { skip: number; take: number }
  ) {
    const where = {
      workspaceId,
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}

function toJson(value: unknown) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
