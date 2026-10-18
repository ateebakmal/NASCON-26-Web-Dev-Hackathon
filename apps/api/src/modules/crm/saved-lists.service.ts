import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "gt"
  | "lt"
  | "in_last_days"
  | "has_tag";

export interface ListFilter {
  field: string;
  operator: FilterOperator;
  value: string | number;
}

type Actor = { userId: string; actorLabel: string };

/**
 * A saved list is a stored QUERY, not a stored result. Running it re-evaluates
 * the filters every time, which is what makes it update automatically as
 * records start or stop matching (F2.6).
 */
@Injectable()
export class SavedListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(workspaceId: string, recordType?: string) {
    return this.prisma.savedList.findMany({
      where: { workspaceId, ...(recordType ? { recordType } : {}) },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(
    workspaceId: string,
    data: { name: string; recordType: "DEAL" | "CONTACT"; filters: ListFilter[]; isShared?: boolean },
    actor: Actor
  ) {
    if (!data.name?.trim()) throw new BadRequestException("Give the list a name.");
    // The spec asks for at least three combined criteria, so a "saved list"
    // that filters on one thing isn't what's being demonstrated.
    if (!Array.isArray(data.filters) || data.filters.length < 1) {
      throw new BadRequestException("A saved list needs at least one criterion.");
    }

    const existing = await this.prisma.savedList.findFirst({
      where: { workspaceId, name: data.name.trim() },
    });
    if (existing) throw new BadRequestException("A list with that name already exists.");

    const created = await this.prisma.savedList.create({
      data: {
        workspaceId,
        name: data.name.trim(),
        recordType: data.recordType,
        filters: data.filters as unknown as Prisma.InputJsonValue,
        isShared: data.isShared ?? true,
        createdBy: actor.userId,
      },
    });

    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "saved_list.created",
      targetType: "SavedList",
      targetId: created.id,
      after: { name: created.name, filters: data.filters },
    });
    return created;
  }

  async remove(workspaceId: string, id: string, actor: Actor) {
    const result = await this.prisma.savedList.deleteMany({ where: { id, workspaceId } });
    if (result.count !== 1) throw new NotFoundException("List not found");
    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "saved_list.deleted",
      targetType: "SavedList",
      targetId: id,
    });
    return { success: true };
  }

  /** Runs a stored list, or an ad-hoc filter set, against live records. */
  async run(workspaceId: string, recordType: string, filters: ListFilter[]) {
    return recordType === "CONTACT"
      ? this.runContacts(workspaceId, filters)
      : this.runDeals(workspaceId, filters);
  }

  async runSaved(workspaceId: string, id: string) {
    const saved = await this.prisma.savedList.findFirst({ where: { id, workspaceId } });
    if (!saved) throw new NotFoundException("List not found");
    const filters = (saved.filters ?? []) as unknown as ListFilter[];
    const items = await this.run(workspaceId, saved.recordType, filters);
    return { list: saved, items };
  }

  // ------------------------------------------------------------------- deals

  private async runDeals(workspaceId: string, filters: ListFilter[]) {
    const where: Prisma.OpportunityWhereInput = { workspaceId, AND: [] };
    const and = where.AND as Prisma.OpportunityWhereInput[];

    for (const f of filters) {
      switch (f.field) {
        case "stage":
          and.push({ stageId: String(f.value) });
          break;
        case "stageType":
          and.push({ stage: { type: String(f.value) as "OPEN" | "WON" | "LOST" } });
          break;
        case "owner":
          and.push({ ownerId: String(f.value) });
          break;
        case "pipeline":
          and.push({ pipelineId: String(f.value) });
          break;
        case "tag":
          and.push({ tag: { contains: String(f.value), mode: "insensitive" } });
          break;
        case "name":
          and.push({ name: { contains: String(f.value), mode: "insensitive" } });
          break;
        case "value":
          and.push(
            f.operator === "lt"
              ? { value: { lt: Number(f.value) } }
              : { value: { gt: Number(f.value) } }
          );
          break;
        case "createdAt":
          and.push({ createdAt: { gte: daysAgo(Number(f.value)) } });
          break;
        default:
          // Anything else is treated as a custom field key on the JSONB blob.
          and.push({
            customFields: { path: [f.field], equals: f.value as Prisma.InputJsonValue },
          });
      }
    }

    return this.prisma.opportunity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        contact: { include: { company: true } },
        stage: true,
        owner: { select: { id: true, name: true } },
      },
    });
  }

  // ---------------------------------------------------------------- contacts

  private async runContacts(workspaceId: string, filters: ListFilter[]) {
    const where: Prisma.ContactWhereInput = { workspaceId, AND: [] };
    const and = where.AND as Prisma.ContactWhereInput[];

    for (const f of filters) {
      switch (f.field) {
        case "name":
          and.push({ name: { contains: String(f.value), mode: "insensitive" } });
          break;
        case "tag":
          and.push({ tags: { has: String(f.value) } });
          break;
        case "company":
          and.push({ companyId: String(f.value) });
          break;
        case "optedOut":
          and.push({ optedOut: String(f.value) === "true" });
          break;
        case "createdAt":
          and.push({ createdAt: { gte: daysAgo(Number(f.value)) } });
          break;
        default:
          and.push({
            customFields: { path: [f.field], equals: f.value as Prisma.InputJsonValue },
          });
      }
    }

    return this.prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { company: true, _count: { select: { opportunities: true } } },
    });
  }
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - (Number.isFinite(n) ? n : 7));
  d.setHours(0, 0, 0, 0);
  return d;
}
