import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import type { BaseRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PermissionsService } from "../permissions/permissions.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService
  ) {}

  async list(workspaceId: string) {
    return this.prisma.user.findMany({
      where: { workspaceId },
      select: { id: true, name: true, email: true, baseRole: true, isActive: true, permissionSet: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Owner/Admin-only creation flow (F1.2: "the Owner can invite users and
   * assign levels"). A hackathon-scoped simplification: the account is
   * created with a server-set initial password rather than an email invite
   * link, since I4 email delivery is a later-phase integration.
   */
  async invite(
    workspaceId: string,
    data: { name: string; email: string; password: string; baseRole: BaseRole; permissionSetId?: string },
    actor: { userId: string; actorLabel: string; actorBaseRole: BaseRole }
  ) {
    if (data.baseRole === "OWNER") {
      throw new ConflictException("Cannot create a second Owner -- ownership is fixed at workspace creation");
    }
    // An Admin cannot grant a role above itself; only the Owner can create another Admin (F1.2).
    if (data.baseRole === "ADMIN" && actor.actorBaseRole !== "OWNER") {
      throw new ConflictException("Only the Owner can grant the Admin level");
    }

    const existing = await this.prisma.user.findFirst({ where: { workspaceId, email: data.email } });
    if (existing) throw new ConflictException("A user with this email already exists in this workspace");

    // Admin created without an explicit permission set is handed the
    // editable "Administrator" preset rather than bypassing the permission
    // system -- Admin is not a hardcoded always-allow level.
    let permissionSetId = data.permissionSetId;
    if (!permissionSetId && data.baseRole === "ADMIN") {
      const adminPreset = await this.prisma.permissionSet.findFirst({ where: { workspaceId, name: "Administrator" } });
      permissionSetId = adminPreset?.id;
    }

    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: {
        workspaceId,
        name: data.name,
        email: data.email,
        passwordHash,
        baseRole: data.baseRole,
        permissionSetId,
        employeeStatus: { create: { workspaceId, availability: "OFFLINE" } },
      },
      select: { id: true, name: true, email: true, baseRole: true },
    });

    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "user.invited",
      targetType: "User",
      targetId: user.id,
      after: { email: user.email, baseRole: user.baseRole },
    });
    return user;
  }

  async updateRoleAndPermissionSet(
    workspaceId: string,
    targetUserId: string,
    data: { baseRole?: BaseRole; permissionSetId?: string },
    actor: { userId: string; actorLabel: string; actorBaseRole: BaseRole }
  ) {
    const target = await this.prisma.user.findFirst({ where: { id: targetUserId, workspaceId } });
    if (!target) throw new NotFoundException("User not found");
    if (target.baseRole === "OWNER") throw new ConflictException("The Owner's role cannot be modified");
    if (data.baseRole === "ADMIN" && actor.actorBaseRole !== "OWNER") {
      throw new ConflictException("Only the Owner can grant the Admin level");
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { baseRole: data.baseRole, permissionSetId: data.permissionSetId },
    });

    await this.permissions.invalidateUserCache(targetUserId);
    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "user.role_changed",
      targetType: "User",
      targetId: targetUserId,
      before: { baseRole: target.baseRole, permissionSetId: target.permissionSetId },
      after: { baseRole: updated.baseRole, permissionSetId: updated.permissionSetId },
    });
    return updated;
  }
}
