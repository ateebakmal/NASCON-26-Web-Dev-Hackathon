import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
    const [pipelines, dealFields] = await Promise.all([
      this.prisma.pipeline.findMany({
        where: { workspaceId },
        orderBy: { position: "asc" },
        include: { stages: { orderBy: { position: "asc" } } },
      }),
      this.prisma.customFieldDefinition.findMany({
        where: { workspaceId, recordType: "DEAL", archivedAt: null },
        orderBy: { position: "asc" },
      }),
    ]);

    // A field with pipelineId null applies to EVERY pipeline, so it cannot
    // come from the Prisma relation (which only matches an exact id) -- it
    // has to be merged in, or workspace-wide fields would be invisible in
    // settings and could never be marked required on a stage.
    return pipelines.map((pipeline) => ({
      ...pipeline,
      customFields: dealFields.filter(
        (f) => f.pipelineId === null || f.pipelineId === pipeline.id
      ),
    }));
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
        where: {
          workspaceId,
          OR: [
            ...(contact.phone ? [{ phone: contact.phone }] : []),
            ...(contact.email ? [{ email: contact.email }] : []),
            // Guarantees an empty result rather than matching everything when
            // the contact has neither a phone nor an email.
            ...(!contact.phone && !contact.email ? [{ id: "__none__" }] : []),
          ],
        },
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

  // ----------------------------------------------------------------- pipelines

  async createPipeline(workspaceId: string, name: string, actor: Actor) {
    const count = await this.prisma.pipeline.count({ where: { workspaceId } });
    const pipeline = await this.prisma.pipeline.create({
      data: {
        workspaceId,
        name,
        position: count,
        isDefault: count === 0,
        // Every pipeline starts usable: the spec requires at least one Open,
        // one Won and one Lost stage, so seed them rather than leaving an
        // empty board an admin has to repair.
        stages: {
          create: [
            { name: "New", position: 0, type: "OPEN", color: "slate" },
            { name: "In progress", position: 1, type: "OPEN", color: "blue" },
            { name: "Won", position: 2, type: "WON", color: "emerald" },
            { name: "Lost", position: 3, type: "LOST", color: "rose" },
          ],
        },
      },
      include: { stages: true },
    });

    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "pipeline.created",
      targetType: "Pipeline",
      targetId: pipeline.id,
      after: { name: pipeline.name },
    });
    return pipeline;
  }

  async updatePipeline(
    workspaceId: string,
    id: string,
    data: { name?: string; isDefault?: boolean },
    actor: Actor
  ) {
    const existing = await this.prisma.pipeline.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException("Pipeline not found");

    const updated = await this.prisma.$transaction(async (tx) => {
      // Exactly one default at a time.
      if (data.isDefault) {
        await tx.pipeline.updateMany({ where: { workspaceId }, data: { isDefault: false } });
      }
      return tx.pipeline.update({ where: { id }, data });
    });

    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "pipeline.updated",
      targetType: "Pipeline",
      targetId: id,
      before: { name: existing.name, isDefault: existing.isDefault },
      after: { name: updated.name, isDefault: updated.isDefault },
    });
    return updated;
  }

  // -------------------------------------------------------------------- stages

  async createStage(
    workspaceId: string,
    pipelineId: string,
    data: { name: string; type?: "OPEN" | "WON" | "LOST"; color?: string },
    actor: Actor
  ) {
    const pipeline = await this.prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } });
    if (!pipeline) throw new NotFoundException("Pipeline not found");

    const last = await this.prisma.stage.findFirst({
      where: { pipelineId },
      orderBy: { position: "desc" },
    });

    const stage = await this.prisma.stage.create({
      data: {
        pipelineId,
        name: data.name,
        type: data.type ?? "OPEN",
        color: data.color ?? "slate",
        position: (last?.position ?? -1) + 1,
      },
    });

    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "stage.created",
      targetType: "Stage",
      targetId: stage.id,
      after: { name: stage.name, type: stage.type },
    });
    return stage;
  }

  /** Persists a drag-reorder as one transaction so positions never interleave. */
  async reorderStages(workspaceId: string, pipelineId: string, orderedIds: string[], actor: Actor) {
    const stages = await this.prisma.stage.findMany({
      where: { pipelineId, pipeline: { workspaceId } },
    });
    if (stages.length !== orderedIds.length) {
      throw new BadRequestException("The reorder must list every stage exactly once.");
    }

    await this.prisma.$transaction(
      orderedIds.map((id, position) =>
        this.prisma.stage.update({ where: { id }, data: { position } })
      )
    );

    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "stage.reordered",
      targetType: "Pipeline",
      targetId: pipelineId,
      after: { order: orderedIds },
    });
    return { success: true };
  }

  /**
   * Deleting a stage that holds deals is only allowed with somewhere to put
   * them: the deals move and the stage is removed in one transaction, so a
   * failure can never strand them (F2.5, A2.4, Q4).
   */
  async deleteStage(
    workspaceId: string,
    stageId: string,
    moveToStageId: string | undefined,
    actor: Actor
  ) {
    const stage = await this.prisma.stage.findFirst({
      where: { id: stageId, pipeline: { workspaceId } },
      include: { _count: { select: { opportunities: true } }, pipeline: true },
    });
    if (!stage) throw new NotFoundException("Stage not found");

    const siblings = await this.prisma.stage.findMany({
      where: { pipelineId: stage.pipelineId, id: { not: stageId } },
    });
    if (siblings.length === 0) {
      throw new BadRequestException("A pipeline must keep at least one stage.");
    }
    // Every pipeline must retain an Open, a Won and a Lost stage (A2.2).
    if (!siblings.some((s) => s.type === stage.type)) {
      throw new BadRequestException(
        `This is the only ${stage.type} stage. Add another ${stage.type} stage before deleting it.`
      );
    }

    const dealCount = stage._count.opportunities;
    if (dealCount > 0 && !moveToStageId) {
      throw new ConflictException({
        error: "STAGE_NOT_EMPTY",
        message: `"${stage.name}" holds ${dealCount} deal(s). Choose where to move them.`,
        stageId,
        dealCount,
        candidates: siblings.map((s) => ({ id: s.id, name: s.name, type: s.type })),
      });
    }

    if (moveToStageId && !siblings.some((s) => s.id === moveToStageId)) {
      throw new BadRequestException("The destination stage must be in the same pipeline.");
    }

    await this.prisma.$transaction(async (tx) => {
      if (dealCount > 0 && moveToStageId) {
        await tx.opportunity.updateMany({
          where: { stageId, workspaceId },
          data: { stageId: moveToStageId },
        });
      }
      await tx.stage.delete({ where: { id: stageId } });
      await this.audit.record(
        {
          workspaceId,
          actorId: actor.userId,
          actorLabel: actor.actorLabel,
          eventType: "stage.deleted",
          targetType: "Stage",
          targetId: stageId,
          before: { name: stage.name, type: stage.type, dealCount },
          after: { movedTo: moveToStageId ?? null },
        },
        tx
      );
    });

    return { success: true, movedDeals: dealCount };
  }

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
