import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { hashToken } from "../crypto";
import type { AuthenticatedRequest } from "../types";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.config.get<string>("SESSION_COOKIE_NAME", "ubp_session");
    const rawToken: string | undefined = req.cookies?.[cookieName];
    if (!rawToken) throw new UnauthorizedException("Not authenticated");

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) {
      throw new UnauthorizedException("Session expired or invalid");
    }

    // workspaceId is derived from the session ONLY -- never from a param or
    // body field, so a client can never direct a request at another tenant.
    req.userId = session.user.id;
    req.userName = session.user.name;
    req.workspaceId = session.user.workspaceId;
    req.baseRole = session.user.baseRole;
    return true;
  }
}
