import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import type { Redis } from "ioredis";
import { PrismaService } from "../../prisma/prisma.service";
import { REDIS_CLIENT } from "../../queue/redis.module";
import { PermissionsService } from "../permissions/permissions.service";
import { AuditService } from "../audit/audit.service";
import { generateSessionToken, hashToken } from "../../common/crypto";
import type { LoginDto, SignupDto } from "@ubp/shared";

const BRUTE_FORCE_MAX_ATTEMPTS = 5;
const BRUTE_FORCE_WINDOW_SECONDS = 15 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /** Creates a new, isolated Workspace and its first user as OWNER. */
  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email } });
    // Email uniqueness is enforced per-workspace in the schema, but a brand
    // new signup always implies a brand new workspace, so a pre-existing
    // account anywhere is surfaced plainly rather than silently creating a
    // same-address duplicate elsewhere.
    if (existing) throw new ConflictException("An account with this email already exists");

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const workspace = await this.prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({ data: { name: dto.workspaceName } });
      const ownerSet = await tx.permissionSet.create({
        data: { workspaceId: ws.id, name: "Owner (full access)", isSystem: true },
      });
      await tx.user.create({
        data: {
          workspaceId: ws.id,
          name: dto.name,
          email: dto.email,
          passwordHash,
          baseRole: "OWNER",
          permissionSetId: ownerSet.id,
          // maxOpenLeads: 0 keeps the Owner out of the general round-robin
          // pool; they remain reachable via the explicit chain-exhaustion
          // fallback to Owner, a separate code path in the assignment engine.
          employeeStatus: { create: { workspaceId: ws.id, availability: "AVAILABLE", maxOpenLeads: 0 } },
        },
      });
      return ws;
    });

    // Seeded as ordinary, editable PermissionSet rows -- "Manager" is a
    // convenience preset, never a hardcoded role (F1.2/F1.3).
    await this.permissions.seedDefaultPermissionSets(workspace.id);

    const owner = await this.prisma.user.findFirstOrThrow({ where: { workspaceId: workspace.id, baseRole: "OWNER" } });
    await this.audit.record({
      workspaceId: workspace.id,
      actorId: owner.id,
      actorLabel: owner.name,
      eventType: "workspace.created",
      targetType: "Workspace",
      targetId: workspace.id,
    });

    return this.createSession(owner.id);
  }

  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }) {
    const bruteForceKey = `login_attempts:${dto.email}:${meta.ip ?? "unknown"}`;
    const attempts = Number((await this.redis.get(bruteForceKey)) ?? 0);
    if (attempts >= BRUTE_FORCE_MAX_ATTEMPTS) {
      throw new UnauthorizedException("Too many failed attempts. Try again later.");
    }

    const user = await this.prisma.user.findFirst({ where: { email: dto.email } });
    const valid = user ? await argon2.verify(user.passwordHash, dto.password) : false;

    if (!user || !valid) {
      await this.redis.multi().incr(bruteForceKey).expire(bruteForceKey, BRUTE_FORCE_WINDOW_SECONDS).exec();
      throw new UnauthorizedException("Invalid email or password");
    }
    if (!user.isActive) throw new UnauthorizedException("Account is deactivated");

    await this.redis.del(bruteForceKey);
    return this.createSession(user.id, meta);
  }

  async logout(rawToken: string) {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(rawToken) },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        baseRole: true,
        workspaceId: true,
        workspace: { select: { name: true } },
        permissionSet: { select: { id: true, name: true } },
      },
    });
    return user;
  }

  private async createSession(userId: string, meta?: { ip?: string; userAgent?: string }) {
    const ttlHours = this.config.get<number>("SESSION_TTL_HOURS", 24);
    const rawToken = generateSessionToken();
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });
    const user = await this.me(userId);
    return { rawToken, ttlHours, user };
  }
}
