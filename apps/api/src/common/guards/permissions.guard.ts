import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsService } from "../../modules/permissions/permissions.service";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { PermissionKey } from "@ubp/shared";
import type { AuthenticatedRequest } from "../types";

/**
 * Runs after SessionAuthGuard (see provider order in app.module.ts). Routes
 * fail closed by default: a controller must carry @RequirePermission(...) to
 * be reachable at all beyond authentication, or @Public() to skip both guards.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<PermissionKey>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const allowed = await this.permissionsService.hasPermission(req.userId, required);
    if (!allowed) throw new ForbiddenException(`Missing permission: ${required}`);
    return true;
  }
}
