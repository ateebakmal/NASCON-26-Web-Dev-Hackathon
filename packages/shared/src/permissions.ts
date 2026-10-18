// Single source of truth for the (resource, action) space. Both the Nest
// PermissionsGuard and the React permission-gating hooks import this so the
// two sides can never drift out of sync.

export const RESOURCES = [
  "workspace",
  "users",
  "permission_sets",
  "employees",
  "leads",
  "assignment_rules",
  "pipelines",
  "audit",
  "integrations",
  // Added in later phases (CRM/integrations), kept here now so permission
  // sets created today remain forward-compatible without a migration.
  "contacts",
  "companies",
  "opportunities",
  "payments",
  "appointments",
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "export",
  "assign",
  "acknowledge",
  "manage_assignment_rules",
  "manage_integrations",
  "view_audit",
] as const;
export type Action = (typeof ACTIONS)[number];

export type PermissionKey = `${Resource}:${Action}`;

export function permissionKey(resource: Resource, action: Action): PermissionKey {
  return `${resource}:${action}`;
}

// The default "Manager" preset seeded at workspace creation. It is a normal,
// fully editable PermissionSet row from day one -- this constant only seeds
// its initial contents, nothing in the guard treats "Manager" specially.
/** Presets become rows with a unique (set, resource, action); a repeated
 *  entry would fail the constraint, so collapse duplicates here. */
function dedupe(
  entries: Array<{ resource: Resource; action: Action }>
): Array<{ resource: Resource; action: Action }> {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.resource}:${e.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const MANAGER_PRESET: Array<{ resource: Resource; action: Action }> = [
  { resource: "leads", action: "view" },
  { resource: "leads", action: "create" },
  { resource: "leads", action: "edit" },
  { resource: "leads", action: "assign" },
  { resource: "leads", action: "acknowledge" },
  { resource: "employees", action: "view" },
  { resource: "employees", action: "edit" },
  { resource: "assignment_rules", action: "view" },
  { resource: "assignment_rules", action: "manage_assignment_rules" },
  { resource: "audit", action: "view_audit" },
];

// Seeded for baseRole=ADMIN users by default (still an ordinary, editable
// PermissionSet -- Admin is not hardcoded to bypass the permission system,
// it is simply handed a broad starting bundle the Owner can narrow later).
export const ADMIN_PRESET: Array<{ resource: Resource; action: Action }> = dedupe([
  ...RESOURCES.flatMap((resource) =>
    (["view", "create", "edit", "delete", "export"] as Action[]).map((action) => ({
      resource,
      action,
    }))
  ),
  { resource: "assignment_rules", action: "manage_assignment_rules" },
  { resource: "pipelines", action: "edit" },
  { resource: "integrations", action: "manage_integrations" },
  { resource: "audit", action: "view_audit" },
  { resource: "leads", action: "assign" },
  { resource: "leads", action: "acknowledge" },
]);

export const SALES_REP_PRESET: Array<{ resource: Resource; action: Action }> = [
  { resource: "leads", action: "view" },
  { resource: "leads", action: "create" },
  { resource: "leads", action: "edit" },
  { resource: "leads", action: "acknowledge" },
  { resource: "employees", action: "view" },
  { resource: "payments", action: "view" },
  { resource: "payments", action: "create" },
];
