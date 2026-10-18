import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@ubp/shared";

export const PERMISSION_KEY = "required_permission";

/** Marks a route as requiring the given permission, checked server-side by PermissionsGuard. */
export const RequirePermission = (perm: PermissionKey) => SetMetadata(PERMISSION_KEY, perm);
