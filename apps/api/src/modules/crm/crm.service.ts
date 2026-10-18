import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

type Actor = { userId: string; actorLabel: string };

/**
 * Every method takes workspaceId as its first argument, sourced from the
 * session by the controller, and includes it in the `where` of every query --
 * a guessed id from another workspace simply matches zero rows (F1.6).
 */
@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway
  ) {}

  // ----------------------------------------------------------------- pipelines

  async listPipelines(workspaceId: string) {
    return this.prisma.pipeline.findMany({
      where: { workspaceId },
      orderBy: { position: "asc" },
      include: {
        stages: { orderBy: { position: "asc" } },
        customFields: { where: { archivedAt: null }, orderBy: { position: "asc" } },
      },
    });
  }

  async getBoard(workspaceId: string, pipelineId?: string) {
    const pipeline = pipelineId
      ? await this.prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } })
      : await this.prisma.pipeline.findFirst({ where: { workspaceId, isDefault: true } }) ??
        (await this.prisma.pipeline.findFirst({ where: { workspaceId }, orderBy: { position: "asc" } }));

    if (!pipeline) throw new NotFoundException("Pipeline not found");

    const [stages, opportunities, fields] = await Promise.all([
      this.prisma.stage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { position: "asc" } }),
      this.prisma.opportunity.findMany({
        where: { workspaceId, pipelineId: pipeline.id },
        orderBy: { createdAt: "desc" },
        include: {
          contact: { include: { company: true } },
          owner: { select: { id: true, name: true } },
        },
      }),
      this.prisma.customFieldDefinition.findMany({
        where: {
          workspaceId,
          recordType: "DEAL",
          archivedAt: null,
          OR: [{ pipelineId: null }, { pipelineId: pipeline.id }],
        },
        orderBy: { position: "asc" },
      }),
    ]);

    return { pipeline, stages, opportunities, fields };
  }

  // -------------------------------------------------------------- opportunities

  async listOpportunities(workspaceId: string, page: { skip: number; take: number }) {
    const [items, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
        include: {
          contact: { include: { company: true } },
          stage: true,
          owner: { select: { id: true, name: true } },
        },
      }),
      this.prisma.opportunity.count({ where: { workspaceId } }),
    ]);
    return { items, total };
  }

  async createOpportunity(
    workspaceId: string,
    data: {
      name: string;
      value?: number;
      contactId: string;
      pipelineId?: string;
      stageId?: string;
      tag?: string;
      ownerId?: string;
    },
    actor: Actor
  ) {
    const pipeline = data.pipelineId
      ? await this.prisma.pipeline.findFirst({ where: { id: data.pipelineId, workspaceId } })
      : await this.prisma.pipeline.findFirst({ where: { workspaceId, isDefault: true } });
    if (!pipeline) throw new NotFoundException("Pipeline not found");

    const stage = data.stageId
      ? await this.prisma.stage.findFirst({ where: { id: data.stageId, pipelineId: pipeline.id } })
      : await this.prisma.stage.findFirst({ where: { pipelineId: pipeline.id }, orderBy: { position: "asc" } });
    if (!stage) throw new NotFoundException("Stage not found");

    const contact = await this.prisma.contact.findFirst({ where: { id: data.contactId, workspaceId } });
    if (!contact) throw new NotFoundException("Contact not found");

    const opportunity = await this.prisma.$transaction(async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          workspaceId,
          name: data.name,
          value: new Prisma.Decimal(data.value ?? 0),
          contactId: data.contactId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          tag: data.tag,
          ownerId: data.ownerId ?? actor.userId,
        },
      });
      await this.audit.record(
        {
          workspaceId,
          actorId: actor.userId,
          actorLabel: actor.actorLabel,
          eventType: "deal.created",
          targetType: "Opportunity",
          targetId: created.id,
          after: { name: created.name, stage: stage.name },
        },
        tx
      );
      return created;
    });

    this.realtime.emitToWorkspace(workspaceId, "deal:changed", opportunity);
    return opportunity;
  }

  /**
   * Stage moves are the guardrail point (F2.4): a move into a stage with
   * required fields is rejected with 409 and the exact list of what is
   * missing, so the board can ask for only those fields inline (A2.3).
   */
  async moveOpportunityStage(
    workspaceId: string,
    opportunityId: string,
    stageId: string,
    actor: Actor,
    patchFields?: Record<string, unknown>
  ) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, workspaceId },
      include: { stage: true },
    });
    if (!opportunity) throw new NotFoundException("Deal not found");

    const targetStage = await this.prisma.stage.findFirst({
      where: { id: stageId, pipelineId: opportunity.pipelineId },
    });
    if (!targetStage) throw new NotFoundException("Stage not found");

    const merged = {
      ...((opportunity.customFields as Record<string, unknown>) ?? {}),
      ...(patchFields ?? {}),
    };

    const missingKeys = targetStage.requiredFieldKeys.filter((key) => {
      const v = merged[key];
      return v === undefined || v === null || v === "";
    });

    if (missingKeys.length > 0) {
      const definitions = await this.prisma.customFieldDefinition.findMany({
        where: { workspaceId, recordType: "DEAL", key: { in: missingKeys }, archivedAt: null },
      });
      throw new ConflictException({
        error: "REQUIRED_FIELDS_MISSING",
        message: `"${targetStage.name}" requires ${definitions.map((d) => d.label).join(", ")}`,
        stageId: targetStage.id,
        stageName: targetStage.name,
        fields: definitions.map((d) => ({
          key: d.key,
          label: d.label,
          type: d.type,
          options: d.options,
        })),
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.opportunity.update({
        where: { id: opportunityId },
        data: {
          stageId: targetStage.id,
          customFields: merged as Prisma.InputJsonValue,
          version: { increment: 1 },
          closedAt: targetStage.type === "OPEN" ? null : new Date(),
        },
      });
      await this.audit.record(
        {
          workspaceId,
          actorId: actor.userId,
          actorLabel: actor.actorLabel,
          eventType: "deal.stage_changed",
          targetType: "Opportunity",
          targetId: opportunityId,
          before: { stage: opportunity.stage.name },
          after: { stage: targetStage.name },
        },
        tx
      );
      return next;
    });

    this.realtime.emitToWorkspace(workspaceId, "deal:changed", updated);
    return updated;
  }

  // -------------------------------------------------------------------- contacts

  async listContacts(workspaceId: string, page: { skip: number; take: number }, search?: string) {
    const where: Prisma.ContactWhereInput = {
      workspaceId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
        include: { company: true, _count: { select: { opportunities: true } } },
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { items, total };
  }

  /** The complete customer view (F2.8) plus its activity timeline (F2.7). */
  async getContact(workspaceId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, workspaceId },
      include: {
        company: true,
        opportunities: {
          include: { stage: true, pipeline: true, owner: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
        appointments: { orderBy: { startsAt: "asc" } },
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");

    const opportunityIds = contact.opportunities.map((o) => o.id);
    const [payments, timeline, leads] = await Promise.all([
      this.prisma.payment.findMany({
        where: { workspaceId, opportunityId: { in: opportunityIds } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.auditLog.findMany({
        where: {
          workspaceId,
          OR: [
            { targetType: "Contact", targetId: id },
            { targetType: "Opportunity", targetId: { in: opportunityIds } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.lead.findMany({
        where: { workspaceId, OR: [{ phone: contact.phone ?? " " }, { email: contact.email ?? " " }] },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return { ...contact, payments, timeline, leads };
  }

  async createContact(
    workspaceId: string,
    data: { name: string; email?: string; phone?: string; companyId?: string; tags?: string[] },
    actor: Actor
  ) {
    const contact = await this.prisma.$transaction(async (tx) => {
      const created = await tx.contact.create({
        data: {
          workspaceId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          companyId: data.companyId,
          tags: data.tags ?? [],
        },
      });
      await this.audit.record(
        {
          workspaceId,
          actorId: actor.userId,
          actorLabel: actor.actorLabel,
          eventType: "contact.created",
          targetType: "Contact",
          targetId: created.id,
          after: { name: created.name },
        },
        tx
      );
      return created;
    });
    return contact;
  }

  // ------------------------------------------------------------------- companies

  async listCompanies(workspaceId: string) {
    return this.prisma.company.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      include: { _count: { select: { contacts: true } } },
    });
  }

  // ---------------------------------------------------------------- custom fields

  async listCustomFields(workspaceId: string) {
    return this.prisma.customFieldDefinition.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ recordType: "asc" }, { position: "asc" }],
      include: { pipeline: { select: { id: true, name: true } } },
    });
  }

  async createCustomField(
    workspaceId: string,
    data: {
      recordType: "CONTACT" | "COMPANY" | "DEAL";
      pipelineId?: string | null;
      label: string;
      type: "TEXT" | "NUMBER" | "DATE" | "DROPDOWN" | "CHECKBOX";
      options?: string[];
    },
    actor: Actor
  ) {
    const key = data.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    const field = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customFieldDefinition.create({
        data: {
          workspaceId,
          recordType: data.recordType,
          pipelineId: data.pipelineId ?? null,
          key,
          label: data.label,
          type: data.type,
          options: data.options ?? [],
        },
      });
      await this.audit.record(
        {
          workspaceId,
          actorId: actor.userId,
          actorLabel: actor.actorLabel,
          eventType: "custom_field.created",
          targetType: "CustomFieldDefinition",
          targetId: created.id,
          after: { label: created.label, type: created.type, recordType: created.recordType },
        },
        tx
      );
      return created;
    });
    return field;
  }

  /** Deleting a field archives it: hidden, data kept, restorable (A2.5). */
  async archiveCustomField(workspaceId: string, id: string, actor: Actor) {
    const result = await this.prisma.customFieldDefinition.updateMany({
      where: { id, workspaceId },
      data: { archivedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException("Field not found");
    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "custom_field.archived",
      targetType: "CustomFieldDefinition",
      targetId: id,
    });
    return { success: true };
  }

  // -------------------------------------------------------------------- stages

  async updateStage(
    workspaceId: string,
    stageId: string,
    data: { name?: string; position?: number; requiredFieldKeys?: string[] },
    actor: Actor
  ) {
    const stage = await this.prisma.stage.findFirst({
      where: { id: stageId, pipeline: { workspaceId } },
    });
    if (!stage) throw new NotFoundException("Stage not found");

    const updated = await this.prisma.stage.update({ where: { id: stageId }, data });
    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "stage.updated",
      targetType: "Stage",
      targetId: stageId,
      before: { name: stage.name, requiredFieldKeys: stage.requiredFieldKeys },
      after: { name: updated.name, requiredFieldKeys: updated.requiredFieldKeys },
    });
    return updated;
  }
}
