import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Redis } from "ioredis";
import { PrismaService } from "../../prisma/prisma.service";
import { REDIS_CLIENT } from "../../queue/redis.module";
import { AuditService } from "../audit/audit.service";
import {
  ADMIN_PRESET,
  MANAGER_PRESET,
  SALES_REP_PRESET,
  permissionKey,
  type Action,
  type PermissionKey,
  type Resource,
} from "@ubp/shared";

const CACHE_TTL_SECONDS = 60;

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  private cacheKey(userId: string, perm: PermissionKey) {
    return `perm:${userId}:${perm}`;
  }

  /**
   * Resolution order: per-user override (revoke beats grant) -> the user's
   * PermissionSet -> OWNER base role always short-circuits true. This is the
   * single place "has permission X" is decided anywhere in the app.
   */
  async hasPermission(userId: string, perm: PermissionKey): Promise<boolean> {
    const cached = await this.redis.get(this.cacheKey(userId, perm));
    if (cached !== null) return cached === "1";

    const result = await this.computePermission(userId, perm);
    await this.redis.set(this.cacheKey(userId, perm), result ? "1" : "0", "EX", CACHE_TTL_SECONDS);
    return result;
  }

  private async computePermission(userId: string, perm: PermissionKey): Promise<boolean> {
    const [resource, action] = perm.split(":") as [Resource, Action];

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { permissionSet: { include: { permissions: true } }, permissionOverrides: true },
    });
    if (!user) return false;
    if (user.baseRole === "OWNER") return true;

    const override = user.permissionOverrides.find((o) => o.resource === resource && o.action === action);
    if (override) return override.effect === "grant";

    return (
      user.permissionSet?.permissions.some((p) => p.resource === resource && p.action === action) ?? false
    );
  }

  /** Fields to strip from a resource's response for this user, per their PermissionSetItem.fieldMask. */
  async getFieldMask(userId: string, resource: Resource, action: Action): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { permissionSet: { include: { permissions: true } } },
    });
    if (!user || user.baseRole === "OWNER") return [];
    const item = user.permissionSet?.permissions.find((p) => p.resource === resource && p.action === action);
    return item?.fieldMask ?? [];
  }

  async invalidateUserCache(userId: string, resource?: Resource) {
    // Simplest-correct approach for hackathon scale: drop every cached
    // permission for the user rather than tracking exact keys touched.
    const pattern = resource ? `perm:${userId}:${resource}:*` : `perm:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length) await this.redis.del(...keys);
  }

  async invalidateSetCache(permissionSetId: string) {
    const users = await this.prisma.user.findMany({ where: { permissionSetId }, select: { id: true } });
    await Promise.all(users.map((u) => this.invalidateUserCache(u.id)));
  }

  /** Seeds the editable "Administrator", "Manager" and "Sales Rep" presets at workspace creation. Plain data, no special-casing in the guard. */
  async seedDefaultPermissionSets(workspaceId: string) {
    const administrator = await this.prisma.permissionSet.create({
      data: {
        workspaceId,
        name: "Administrator",
        permissions: { create: ADMIN_PRESET.map((p) => ({ resource: p.resource, action: p.action })) },
      },
    });
    const manager = await this.prisma.permissionSet.create({
      data: {
        workspaceId,
        name: "Manager",
        permissions: { create: MANAGER_PRESET.map((p) => ({ resource: p.resource, action: p.action })) },
      },
    });
    const salesRep = await this.prisma.permissionSet.create({
      data: {
        workspaceId,
        name: "Sales Rep",
        permissions: { create: SALES_REP_PRESET.map((p) => ({ resource: p.resource, action: p.action })) },
      },
    });
    return { administrator, manager, salesRep };
  }

  async listPermissionSets(workspaceId: string) {
    return this.prisma.permissionSet.findMany({
      where: { workspaceId },
      include: { permissions: true, users: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async updatePermissionSet(
    workspaceId: string,
    id: string,
    data: { name?: string; items?: Array<{ resource: Resource; action: Action; fieldMask?: string[] }> },
    actor: { userId: string; actorLabel: string }
  ) {
    const existing = await this.prisma.permissionSet.findFirst({ where: { id, workspaceId }, include: { permissions: true } });
    if (!existing) throw new NotFoundException("Permission set not found");

    // The Owner's implicit full-access set is what the short-circuit in
    // hasPermission relies on; editing it would be meaningless at best.
    if (existing.isSystem) {
      throw new ForbiddenException("The Owner's full-access set cannot be edited.");
    }

    // No privilege escalation (A1.3): nobody may grant a permission they do
    // not themselves hold. The Owner holds everything, so this only ever
    // constrains Admins and custom roles.
    if (data.items) {
      const actorUser = await this.prisma.user.findUnique({ where: { id: actor.userId } });
      if (actorUser && actorUser.baseRole !== "OWNER") {
        const currentlyGranted = new Set(
          existing.permissions.map((p) => `${p.resource}:${p.action}`)
        );
        const beingAdded = data.items.filter(
          (i) => !currentlyGranted.has(`${i.resource}:${i.action}`)
        );
        for (const item of beingAdded) {
          const held = await this.hasPermission(
            actor.userId,
            `${item.resource}:${item.action}` as PermissionKey
          );
          if (!held) {
            throw new ForbiddenException(
              `You cannot grant "${item.resource}:${item.action}" because you do not hold it yourself.`
            );
          }
        }
      }
    }

    const before = existing;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (data.name) await tx.permissionSet.update({ where: { id }, data: { name: data.name } });
      if (data.items) {
        await tx.permissionSetItem.deleteMany({ where: { permissionSetId: id } });
        await tx.permissionSetItem.createMany({
          data: data.items.map((i) => ({
            permissionSetId: id,
            resource: i.resource,
            action: i.action,
            fieldMask: i.fieldMask ?? [],
          })),
        });
      }
      return tx.permissionSet.findUniqueOrThrow({ where: { id }, include: { permissions: true } });
    });

    await this.invalidateSetCache(id);
    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "permission_set.updated",
      targetType: "PermissionSet",
      targetId: id,
      before,
      after: updated,
    });
    return updated;
  }
}

export { permissionKey };
