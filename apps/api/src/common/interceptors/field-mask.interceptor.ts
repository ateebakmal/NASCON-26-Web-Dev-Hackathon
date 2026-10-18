import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { from, switchMap, type Observable } from "rxjs";
import { PermissionsService } from "../../modules/permissions/permissions.service";
import type { Resource } from "@ubp/shared";
import type { AuthenticatedRequest } from "../types";

export const MASK_RESOURCE_KEY = "mask_resource";

/** Marks a route's response as subject to field-level masking (F1.4). */
export const MaskFields = (resource: Resource) => SetMetadata(MASK_RESOURCE_KEY, resource);

/**
 * Applied once, globally, rather than ad hoc per endpoint: any route that
 * declares @MaskFields(resource) has the fields listed in the caller's
 * PermissionSetItem.fieldMask stripped from its response, in lists, detail
 * pages and exports alike. Stripping is recursive so a nested collection
 * (e.g. the board's `opportunities`) is covered without per-shape handling.
 */
@Injectable()
export class FieldMaskInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const resource = this.reflector.getAllAndOverride<Resource | undefined>(MASK_RESOURCE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!resource) return next.handle();

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.userId) return next.handle();

    return next.handle().pipe(
      switchMap((body) =>
        from(
          this.permissions
            .getFieldMask(req.userId, resource, "view")
            .then((mask) => (mask.length ? maskDeep(body, new Set(mask)) : body))
        )
      )
    );
  }
}

/**
 * Masked fields are set to null rather than deleted, so the client can tell
 * "you may not see this" apart from "this has no value" and render a lock.
 */
function maskDeep(value: unknown, fields: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, fields));
  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    const clone: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      clone[k] = fields.has(k) ? null : maskDeep(v, fields);
    }
    return clone;
  }
  return value;
}
