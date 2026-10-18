import { randomUUID } from "crypto";
import { BadRequestException, Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Queue } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { ESCALATION_QUEUE } from "../../queue/escalation.queue";
import { ESCALATED_REPEATEDLY_THRESHOLD, type RecoveryReason } from "@ubp/shared";
import { ESCALATION_JOB_NAME, type EscalationLevel, type EscalationJobPayload } from "./assignment-engine.types";
import type { Prisma, PrismaClient, Lead } from "@prisma/client";

type Tx = Prisma.TransactionClient;

@Injectable()
export class AssignmentEngineService implements OnModuleInit {
  private readonly logger = new Logger(AssignmentEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    @Inject(ESCALATION_QUEUE) private readonly escalationQueue: Queue
  ) {}

  /**
   * Restart-safety reconciliation (Q5): the database, not the BullMQ queue,
   * is the source of truth for pending timers. On boot, anything overdue
   * fires immediately; anything still in the future is re-enqueued (BullMQ
   * jobId equals the EscalationJob id, so re-adding is idempotent).
   */
  async onModuleInit() {
    await this.reconcilePendingEscalations();
  }

  @Cron("*/60 * * * * *")
  async reconcileCron() {
    await this.reconcilePendingEscalations();
  }

  private async reconcilePendingEscalations() {
    const pending = await this.prisma.escalationJob.findMany({ where: { status: "PENDING" } });
    for (const job of pending) {
      const delayMs = job.fireAt.getTime() - Date.now();
      if (delayMs <= 0) {
        await this.fireEscalation({ leadId: job.leadId, assignmentId: job.assignmentId, escalationJobId: job.id });
      } else {
        await this.escalationQueue.add(
          ESCALATION_JOB_NAME,
          { leadId: job.leadId, assignmentId: job.assignmentId, escalationJobId: job.id },
          { jobId: job.id, delay: delayMs, removeOnComplete: true, removeOnFail: true }
        );
      }
    }
    if (pending.length) this.logger.log(`Reconciled ${pending.length} pending escalation job(s)`);
  }

  // ---------------------------------------------------------------------
  // Assignment rule
  // ---------------------------------------------------------------------

  async getActiveRule(workspaceId: string, tx: Tx | PrismaClient = this.prisma) {
    return tx.assignmentRule.findFirst({ where: { workspaceId, isActive: true }, orderBy: { createdAt: "desc" } });
  }

  async upsertRule(
    workspaceId: string,
    data: { ackWindowSeconds: number; idleThresholdSeconds: number; escalationLevels: EscalationLevel[] },
    actor: { userId: string; actorLabel: string }
  ) {
    await this.prisma.assignmentRule.updateMany({ where: { workspaceId, isActive: true }, data: { isActive: false } });
    const rule = await this.prisma.assignmentRule.create({
      data: {
        workspaceId,
        ackWindowSeconds: data.ackWindowSeconds,
        idleThresholdSeconds: data.idleThresholdSeconds,
        escalationLevels: data.escalationLevels as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "assignment_rule.updated",
      targetType: "AssignmentRule",
      targetId: rule.id,
      after: rule,
    });
    return rule;
  }

  // ---------------------------------------------------------------------
  // Round-robin resolution
  // ---------------------------------------------------------------------

  private async resolveNextAssignee(tx: Tx, workspaceId: string, excludeUserIds: string[]): Promise<string | null> {
    const candidates = await tx.employeeStatus.findMany({
      where: { workspaceId, availability: "AVAILABLE", userId: { notIn: excludeUserIds } },
    });
    if (!candidates.length) return null;

    const withStats = await Promise.all(
      candidates.map(async (c) => {
        const openCount = await tx.lead.count({
          where: { workspaceId, currentOwnerId: c.userId, status: { notIn: ["CONVERTED", "LOST"] } },
        });
        const lastAssignment = await tx.leadAssignment.findFirst({
          where: { assigneeId: c.userId, lead: { workspaceId } },
          orderBy: { assignedAt: "desc" },
        });
        return { userId: c.userId, openCount, maxOpenLeads: c.maxOpenLeads, lastAssignedAt: lastAssignment?.assignedAt ?? new Date(0) };
      })
    );

    const eligible = withStats
      .filter((c) => c.openCount < c.maxOpenLeads)
      .sort((a, b) => a.lastAssignedAt.getTime() - b.lastAssignedAt.getTime());

    return eligible[0]?.userId ?? null;
  }

  private async resolveFallbackOwner(tx: Tx, workspaceId: string): Promise<string> {
    const owner = await tx.user.findFirstOrThrow({ where: { workspaceId, baseRole: "OWNER" } });
    return owner.id;
  }

  // ---------------------------------------------------------------------
  // Lead creation + initial assignment
  // ---------------------------------------------------------------------

  async createLeadAndAssign(
    workspaceId: string,
    data: { source: "MANUAL" | "WEB_FORM" | "WHATSAPP"; name: string; phone?: string; email?: string; notes?: string },
    actor: { userId: string | null; actorLabel: string }
  ): Promise<Lead> {
    const rule = await this.getActiveRule(workspaceId);
    if (!rule) {
      throw new BadRequestException("No active assignment rule configured for this workspace");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          workspaceId,
          source: data.source,
          name: data.name,
          phone: data.phone,
          email: data.email,
          notes: data.notes,
        },
      });

      let assigneeId = await this.resolveNextAssignee(tx, workspaceId, []);
      if (!assigneeId) assigneeId = await this.resolveFallbackOwner(tx, workspaceId);

      const assignment = await tx.leadAssignment.create({
        data: { leadId: lead.id, assigneeId, escalationLevel: 0 },
      });

      const updatedLead = await tx.lead.update({
        where: { id: lead.id },
        data: { status: "ASSIGNED", currentOwnerId: assigneeId, firstAssignedAt: new Date(), lockVersion: { increment: 1 } },
      });

      const escalationJob = await this.createEscalationJobRow(tx, lead.id, assignment.id, rule.ackWindowSeconds);

      await this.audit.record(
        {
          workspaceId,
          actorId: actor.userId,
          actorLabel: actor.actorLabel,
          eventType: "lead.assigned",
          targetType: "Lead",
          targetId: lead.id,
          after: { assigneeId, escalationLevel: 0 },
        },
        tx
      );

      return { lead: updatedLead, escalationJob };
    });

    await this.enqueueEscalationJob(result.escalationJob.id, result.escalationJob.fireAt);
    this.realtime.emitToWorkspace(workspaceId, "lead:created", result.lead);
    return result.lead;
  }

  // ---------------------------------------------------------------------
  // Acknowledgement
  // ---------------------------------------------------------------------

  async acknowledge(workspaceId: string, leadId: string, userId: string, userName: string) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${leadId} FOR UPDATE`;

      const assignment = await tx.leadAssignment.findFirst({
        where: { leadId, endedAt: null },
      });
      if (!assignment) return { status: "already_resolved" as const };
      if (assignment.assigneeId !== userId) return { status: "not_your_lead" as const };

      const now = new Date();
      await tx.leadAssignment.update({
        where: { id: assignment.id },
        data: { ackAt: now, endedAt: now, endReason: "ACKNOWLEDGED" },
      });

      const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
      const updatedLead = await tx.lead.update({
        where: { id: leadId },
        data: {
          status: "ACKNOWLEDGED",
          firstAckAt: lead.firstAckAt ?? now,
          lockVersion: { increment: 1 },
        },
      });

      await tx.escalationJob.updateMany({
        where: { assignmentId: assignment.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });

      await this.audit.record(
        {
          workspaceId,
          actorId: userId,
          actorLabel: userName,
          eventType: "lead.acknowledged",
          targetType: "Lead",
          targetId: leadId,
        },
        tx
      );

      return { status: "ok" as const, lead: updatedLead };
    });

    if (outcome.status === "ok") {
      const pendingJob = await this.prisma.escalationJob.findFirst({ where: { leadId }, orderBy: { createdAt: "desc" } });
      if (pendingJob?.bullJobId) await this.escalationQueue.remove(pendingJob.bullJobId).catch(() => undefined);
      this.realtime.emitToWorkspace(workspaceId, "lead:acknowledged", outcome.lead);
    }
    return outcome;
  }

  // ---------------------------------------------------------------------
  // Escalation (fired by the BullMQ worker, or by the reconciliation sweep)
  // ---------------------------------------------------------------------

  async fireEscalation(payload: EscalationJobPayload) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${payload.leadId} FOR UPDATE`;

      const job = await tx.escalationJob.findUnique({ where: { id: payload.escalationJobId } });
      if (!job || job.status !== "PENDING") return { status: "stale" as const };

      // The assignment this timer was watching may already be closed (by an
      // acknowledgement, or by a different escalation path such as a status
      // change). If so, this firing is redundant -- no-op rather than act.
      const activeAssignment = await tx.leadAssignment.findFirst({ where: { leadId: payload.leadId, endedAt: null } });
      if (!activeAssignment || activeAssignment.id !== payload.assignmentId) {
        await tx.escalationJob.update({ where: { id: job.id }, data: { status: "FIRED" } });
        return { status: "stale" as const };
      }

      const lead = await tx.lead.findUniqueOrThrow({ where: { id: payload.leadId } });
      const rule = await this.getActiveRule(lead.workspaceId, tx);

      const now = new Date();
      await tx.leadAssignment.update({
        where: { id: activeAssignment.id },
        data: { endedAt: now, endReason: "ESCALATED_TIMEOUT" },
      });
      await tx.escalationJob.update({ where: { id: job.id }, data: { status: "FIRED" } });

      const { nextAssigneeId, nextTimeoutSeconds } = await this.resolveNextInChain(
        tx,
        lead.workspaceId,
        rule,
        activeAssignment.escalationLevel,
        [activeAssignment.assigneeId]
      );

      const newAssignment = await tx.leadAssignment.create({
        data: { leadId: lead.id, assigneeId: nextAssigneeId, escalationLevel: activeAssignment.escalationLevel + 1 },
      });

      const updatedLead = await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: "ESCALATED",
          currentOwnerId: nextAssigneeId,
          escalationCount: { increment: 1 },
          lockVersion: { increment: 1 },
        },
      });

      const nextJob = await this.createEscalationJobRow(tx, lead.id, newAssignment.id, nextTimeoutSeconds);

      await this.audit.record(
        {
          workspaceId: lead.workspaceId,
          actorId: null,
          actorLabel: "system:escalation",
          eventType: "lead.escalated",
          targetType: "Lead",
          targetId: lead.id,
          before: { assigneeId: activeAssignment.assigneeId, escalationLevel: activeAssignment.escalationLevel },
          after: { assigneeId: nextAssigneeId, escalationLevel: newAssignment.escalationLevel },
        },
        tx
      );

      return { status: "escalated" as const, lead: updatedLead, nextJob };
    });

    if (result.status === "escalated") {
      await this.enqueueEscalationJob(result.nextJob.id, result.nextJob.fireAt);
      this.realtime.emitToWorkspace(result.lead.workspaceId, "lead:escalated", result.lead);
      // I4 (notify the new owner outside the app) lands in the integrations
      // phase; the escalation path is already wired to call it the moment
      // that module exists -- see NotificationsService.notifyEscalation stub.
    }
    return result;
  }

  private async resolveNextInChain(
    tx: Tx,
    workspaceId: string,
    rule: { ackWindowSeconds: number; escalationLevels: unknown } | null,
    currentLevel: number,
    excludeAssigneeIds: string[]
  ): Promise<{ nextAssigneeId: string; nextTimeoutSeconds: number }> {
    const levels = (rule?.escalationLevels as unknown as EscalationLevel[] | undefined) ?? [];
    const step = levels[currentLevel];

    if (step) {
      if (step.type === "next_eligible") {
        const resolved = await this.resolveNextAssignee(tx, workspaceId, excludeAssigneeIds);
        if (resolved) return { nextAssigneeId: resolved, nextTimeoutSeconds: step.timeoutSeconds };
        // No other eligible employee -- fall through to Owner, same as chain exhaustion.
      } else if (step.userId) {
        return { nextAssigneeId: step.userId, nextTimeoutSeconds: step.timeoutSeconds };
      }
    }

    // Chain exhausted (or a "next_eligible" step found nobody available):
    // confirmed product rule is to auto-escalate once more to the Workspace Owner.
    const ownerId = await this.resolveFallbackOwner(tx, workspaceId);
    const fallbackTimeout = step?.timeoutSeconds ?? rule?.ackWindowSeconds ?? 3600;
    return { nextAssigneeId: ownerId, nextTimeoutSeconds: fallbackTimeout };
  }

  // ---------------------------------------------------------------------
  // Status-change reassignment (F3.6) -- same chain-resolution path as
  // timeout escalation, but does NOT count as an "Escalation" per the
  // glossary (timeout-only), so escalationCount is left untouched.
  // ---------------------------------------------------------------------

  async reassignUnacknowledgedLeadsForUser(workspaceId: string, userId: string) {
    const openAssignments = await this.prisma.leadAssignment.findMany({
      where: { assigneeId: userId, endedAt: null, ackAt: null, lead: { workspaceId } },
    });

    for (const assignment of openAssignments) {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${assignment.leadId} FOR UPDATE`;

        const current = await tx.leadAssignment.findUnique({ where: { id: assignment.id } });
        if (!current || current.endedAt) return null; // already resolved by a concurrent path

        const lead = await tx.lead.findUniqueOrThrow({ where: { id: assignment.leadId } });
        const rule = await this.getActiveRule(workspaceId, tx);

        await tx.leadAssignment.update({
          where: { id: current.id },
          data: { endedAt: new Date(), endReason: "STATUS_CHANGE_REASSIGN" },
        });
        await tx.escalationJob.updateMany({ where: { assignmentId: current.id, status: "PENDING" }, data: { status: "CANCELLED" } });

        const { nextAssigneeId, nextTimeoutSeconds } = await this.resolveNextInChain(
          tx,
          workspaceId,
          rule,
          current.escalationLevel,
          [current.assigneeId]
        );

        const newAssignment = await tx.leadAssignment.create({
          data: { leadId: lead.id, assigneeId: nextAssigneeId, escalationLevel: current.escalationLevel },
        });

        const updatedLead = await tx.lead.update({
          where: { id: lead.id },
          data: { currentOwnerId: nextAssigneeId, lockVersion: { increment: 1 } },
        });

        const nextJob = await this.createEscalationJobRow(tx, lead.id, newAssignment.id, nextTimeoutSeconds);

        await this.audit.record(
          {
            workspaceId,
            actorId: null,
            actorLabel: "system:status_change",
            eventType: "lead.reassigned_status_change",
            targetType: "Lead",
            targetId: lead.id,
            before: { assigneeId: current.assigneeId },
            after: { assigneeId: nextAssigneeId },
          },
          tx
        );

        return { lead: updatedLead, nextJob };
      });

      if (result) {
        await this.enqueueEscalationJob(result.nextJob.id, result.nextJob.fireAt);
        this.realtime.emitToWorkspace(workspaceId, "lead:reassigned", result.lead);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Recovery queue (Section 7 glossary, computed -- not a stored table)
  // ---------------------------------------------------------------------

  async getRecoveryQueue(workspaceId: string) {
    const rule = await this.getActiveRule(workspaceId);
    // Once a lead is acknowledged it has an actively engaged owner again --
    // past escalation count alone shouldn't keep a now-handled lead flagged
    // as needing recovery. Only still-open leads (never yet acknowledged
    // this round, or currently mid-escalation) are candidates.
    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, status: { in: ["NEW", "ASSIGNED", "ESCALATED"] } },
      include: { assignments: { orderBy: { assignedAt: "desc" }, take: 1 } },
    });

    const now = Date.now();
    const items: Array<{ lead: Lead; reason: RecoveryReason }> = [];

    for (const lead of leads) {
      const activeAssignment = lead.assignments[0];
      const windowSeconds = this.windowSecondsForLevel(rule, activeAssignment?.escalationLevel ?? 0);

      if (lead.escalationCount >= ESCALATED_REPEATEDLY_THRESHOLD) {
        items.push({ lead, reason: "ESCALATED_REPEATEDLY" });
        continue;
      }
      if (
        activeAssignment &&
        !activeAssignment.endedAt &&
        !activeAssignment.ackAt &&
        now - activeAssignment.assignedAt.getTime() > windowSeconds * 1000
      ) {
        items.push({ lead, reason: "UNACKED_PAST_WINDOW" });
        continue;
      }
      const lastActivity = activeAssignment?.ackAt ?? activeAssignment?.assignedAt ?? lead.createdAt;
      if (rule && now - lastActivity.getTime() > rule.idleThresholdSeconds * 1000) {
        items.push({ lead, reason: "IDLE" });
      }
    }
    return items;
  }

  private windowSecondsForLevel(
    rule: { ackWindowSeconds: number; escalationLevels: unknown } | null,
    level: number
  ): number {
    if (level === 0) return rule?.ackWindowSeconds ?? 3600;
    const levels = (rule?.escalationLevels as unknown as EscalationLevel[] | undefined) ?? [];
    return levels[level - 1]?.timeoutSeconds ?? rule?.ackWindowSeconds ?? 3600;
  }

  // ---------------------------------------------------------------------
  // Escalation job bookkeeping
  // ---------------------------------------------------------------------

  private async createEscalationJobRow(tx: Tx, leadId: string, assignmentId: string, timeoutSeconds: number) {
    const id = randomUUID();
    const fireAt = new Date(Date.now() + timeoutSeconds * 1000);
    return tx.escalationJob.create({
      data: { id, leadId, assignmentId, fireAt, status: "PENDING", bullJobId: id },
    });
  }

  private async enqueueEscalationJob(escalationJobId: string, fireAt: Date) {
    const job = await this.prisma.escalationJob.findUnique({ where: { id: escalationJobId } });
    if (!job) return;
    const delayMs = Math.max(fireAt.getTime() - Date.now(), 0);
    await this.escalationQueue.add(
      ESCALATION_JOB_NAME,
      { leadId: job.leadId, assignmentId: job.assignmentId, escalationJobId: job.id },
      { jobId: job.id, delay: delayMs, removeOnComplete: true, removeOnFail: true }
    );
  }
}
