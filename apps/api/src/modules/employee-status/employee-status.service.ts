import { Injectable, NotFoundException } from "@nestjs/common";
import type { EmployeeAvailability } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AssignmentEngineService } from "../assignment-engine/assignment-engine.service";

@Injectable()
export class EmployeeStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assignmentEngine: AssignmentEngineService
  ) {}

  async list(workspaceId: string) {
    return this.prisma.employeeStatus.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    });
  }

  async setAvailability(
    workspaceId: string,
    userId: string,
    availability: EmployeeAvailability,
    actor: { userId: string; actorLabel: string }
  ) {
    const existing = await this.prisma.employeeStatus.findFirst({ where: { workspaceId, userId } });
    if (!existing) throw new NotFoundException("Employee status not found");

    const updated = await this.prisma.employeeStatus.update({
      where: { id: existing.id },
      data: { availability },
    });

    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "employee_status.changed",
      targetType: "EmployeeStatus",
      targetId: existing.id,
      before: { availability: existing.availability },
      after: { availability: updated.availability },
    });

    // Going On Leave/Offline immediately reassigns unacknowledged leads
    // (F3.6). Already-acknowledged leads are left untouched, since the
    // employee is actively engaged with those regardless of status.
    if (availability === "ON_LEAVE" || availability === "OFFLINE") {
      await this.assignmentEngine.reassignUnacknowledgedLeadsForUser(workspaceId, userId);
    }

    return updated;
  }
}
