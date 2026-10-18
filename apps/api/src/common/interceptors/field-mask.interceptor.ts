import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, map } from "rxjs";
import { PermissionsService } from "../../modules/permissions/permissions.service";
import type { Resource } from "@ubp/shared";
import type { AuthenticatedRequest } from "../types";

export const MASK_RESOURCE_KEY = "mask_resource";
/** Marks a route's response as subject to field-level masking for the given resource (F1.4). */
export const MaskFields = (resource: Resource) => SetMetadata(MASK_RESOURCE_KEY, resource);

// Applied once, globally, rather than ad hoc per endpoint -- any controller
// response for a resource that declares @MaskFields(...) gets its configured
// fields stripped for callers lacking the matching permission's fieldMask
// allowance. Not yet wired to any route in the MVP-core slice (Lead has no
// maskable field yet); ready for Opportunity.value once F2 lands.
@Injectable()
export class FieldMaskInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const resource = this.reflector.get<Resource | undefined>(MASK_RESOURCE_KEY, ctx.getHandler());
    if (!resource) return next.handle();

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return next.handle().pipe(
      map(async (body) => {
        const fieldMask = await this.permissions.getFieldMask(req.userId, resource, "view");
        if (!fieldMask.length) return body;
        return stripFields(body, fieldMask);
      })
    );
  }
}

function stripFields(value: unknown, fields: string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => stripFields(v, fields));
  if (value && typeof value === "object") {
    const clone: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const f of fields) delete clone[f];
    return clone;
  }
  return value;
}
