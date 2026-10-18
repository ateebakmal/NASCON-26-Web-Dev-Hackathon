import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AssignmentEngineService } from "../assignment-engine/assignment-engine.service";
import type { CreateLeadDto } from "@ubp/shared";

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignmentEngine: AssignmentEngineService
  ) {}

  async create(workspaceId: string, dto: CreateLeadDto, actor: { userId: string; actorLabel: string }) {
    return this.assignmentEngine.createLeadAndAssign(
      workspaceId,
      { source: "MANUAL", name: dto.name, phone: dto.phone, email: dto.email, notes: dto.notes },
      actor
    );
  }

  async list(workspaceId: string, page: { skip: number; take: number }) {
    const where = { workspaceId };
    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
        include: {
          assignments: {
            where: { endedAt: null },
            include: {
              assignee: { select: { id: true, name: true } },
              escalationJobs: { where: { status: "PENDING" }, take: 1 },
            },
          },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total };
  }

  async getOne(workspaceId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, workspaceId },
      include: {
        assignments: { orderBy: { assignedAt: "desc" }, include: { assignee: { select: { id: true, name: true } } } },
        escalationJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  async acknowledge(workspaceId: string, leadId: string, userId: string, userName: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) throw new NotFoundException("Lead not found");
    return this.assignmentEngine.acknowledge(workspaceId, leadId, userId, userName);
  }

  async recoveryQueue(workspaceId: string) {
    return this.assignmentEngine.getRecoveryQueue(workspaceId);
  }
}
