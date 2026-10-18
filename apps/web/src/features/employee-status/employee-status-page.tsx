import * as React from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Select } from "../../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { ApiError } from "../../lib/api";
import { useAuth, useCan } from "../../app/auth-context";
import {
  useUpdateMember,
  useWorkspaceUsers,
  usePermissionSets,
  type BaseRole,
} from "../permissions/api";
import { AddMemberDialog } from "./add-member-dialog";
import {
  useEmployeeStatuses,
  useSetAvailabilityFor,
  useSetMyAvailability,
  type Availability,
} from "./api";
import { EmployeeStatusToggle } from "./employee-status-toggle";

const LEVEL_VARIANT: Record<BaseRole, "primary" | "warning" | "neutral"> = {
  OWNER: "warning",
  ADMIN: "primary",
  USER: "neutral",
};

const AVAILABILITY_VARIANT: Record<Availability, "success" | "warning" | "neutral" | "danger"> = {
  AVAILABLE: "success",
  BUSY: "warning",
  ON_LEAVE: "neutral",
  OFFLINE: "danger",
};

const AVAILABILITY_LABEL: Record<Availability, string> = {
  AVAILABLE: "Available",
  BUSY: "Busy",
  ON_LEAVE: "On leave",
  OFFLINE: "Offline",
};

/**
 * One screen for people: who they are, what level and permission group they
 * hold, and whether they can currently receive a lead. Membership used to
 * live on the Roles page, which split "the team" across two screens.
 */
export function EmployeeStatusPage() {
  const { user } = useAuth();
  const can = useCan();
  const canSeeMembers = can("users:view");
  const canEditMembers = can("users:edit");
  const canInvite = can("users:create");
  const canEditAvailability = can("employees:edit");
  // The server reserves the Admin level for the Owner; match that here so the
  // dropdown cannot offer a change that will be refused.
  const canGrantAdmin = user?.baseRole === "OWNER";

  const statuses = useEmployeeStatuses();
  // Availability is visible to every employee; membership and roles are not,
  // so those two queries only run for someone allowed to read them.
  const users = useWorkspaceUsers({ enabled: canSeeMembers });
  const sets = usePermissionSets({ enabled: canSeeMembers });
  const setMine = useSetMyAvailability();
  const setFor = useSetAvailabilityFor();
  const updateMember = useUpdateMember();
  const [error, setError] = React.useState<string | null>(null);

  const mine = statuses.data?.find((row) => row.userId === user?.id);
  const assignableRoles = (sets.data ?? []).filter((s) => !s.isSystem);
  // Availability and membership live in different tables; join them so the
  // page reads as one list of people rather than two partial ones.
  const memberById = new Map((users.data ?? []).map((u) => [u.id, u]));

  const change = async (id: string, patch: { baseRole?: BaseRole; permissionSetId?: string }) => {
    setError(null);
    try {
      await updateMember.mutateAsync({ id, ...patch });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update that member");
    }
  };

  const changeAvailability = async (userId: string, availability: Availability) => {
    setError(null);
    try {
      await setFor.mutateAsync({ userId, availability });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update availability");
    }
  };

  const columnCount = canSeeMembers ? 5 : 3;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Your status</CardTitle>
          <CardDescription>
            Going On leave or Offline immediately reassigns any unacknowledged leads you hold.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mine ? (
            <EmployeeStatusToggle
              value={mine.availability}
              loading={setMine.isPending}
              onChange={(next: Availability) => setMine.mutate(next)}
            />
          ) : (
            <p className="text-base text-text-muted">—</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-start justify-between gap-4 border-b border-border">
          <div>
            <CardTitle>Team members</CardTitle>
            <CardDescription>
              A member's permissions come from their group. Only Available people under their
              lead limit receive round-robin assignments.
            </CardDescription>
          </div>
          {canInvite && <AddMemberDialog roles={assignableRoles} />}
        </CardHeader>

        {error && (
          <p role="alert" className="px-5 pt-4 text-sm text-danger">
            {error}
          </p>
        )}

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Member</TableHead>
              {canSeeMembers && <TableHead>Level</TableHead>}
              {canSeeMembers && <TableHead>Permission group</TableHead>}
              <TableHead>Availability</TableHead>
              <TableHead>Lead cap</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statuses.isLoading && (
              <TableEmpty colSpan={columnCount}>
                <span className="inline-flex items-center gap-2">
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Loading team…
                </span>
              </TableEmpty>
            )}

            {statuses.isError && (
              <TableEmpty colSpan={columnCount}>
                <span role="alert" className="text-danger">
                  Could not load the team.
                </span>
              </TableEmpty>
            )}

            {statuses.data?.map((row) => {
              const member = memberById.get(row.userId);
              const isOwner = member?.baseRole === "OWNER";
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium text-text">
                      {row.user.name}
                      {row.userId === user?.id && (
                        <span className="ml-2 text-sm font-normal text-text-muted">(you)</span>
                      )}
                    </p>
                    <p className="text-sm text-text-muted">{row.user.email}</p>
                  </TableCell>

                  {canSeeMembers && (
                    <TableCell>
                      {/* Ownership is fixed at workspace creation and cannot be
                          reassigned by anyone, including the Owner. */}
                      {!member ? (
                        <span className="text-sm text-text-muted">—</span>
                      ) : isOwner || !canEditMembers ? (
                        <Badge variant={LEVEL_VARIANT[member.baseRole]}>{member.baseRole}</Badge>
                      ) : (
                        <Select
                          value={member.baseRole}
                          onChange={(e) =>
                            change(member.id, { baseRole: e.target.value as BaseRole })
                          }
                          className="max-w-[120px]"
                          aria-label={`${member.name} level`}
                        >
                          <option value="USER">User</option>
                          {(canGrantAdmin || member.baseRole === "ADMIN") && (
                            <option value="ADMIN">Admin</option>
                          )}
                        </Select>
                      )}
                    </TableCell>
                  )}

                  {canSeeMembers && (
                    <TableCell>
                      {!member ? (
                        <span className="text-sm text-text-muted">—</span>
                      ) : isOwner ? (
                        <span className="text-sm text-text-muted">Full access (implicit)</span>
                      ) : !canEditMembers ? (
                        <span className="text-base text-text">
                          {member.permissionSet?.name ?? "No group"}
                        </span>
                      ) : (
                        <Select
                          value={member.permissionSet?.id ?? ""}
                          onChange={(e) => change(member.id, { permissionSetId: e.target.value })}
                          className="max-w-[190px]"
                          aria-label={`${member.name} permission group`}
                        >
                          <option value="">No group (no access)</option>
                          {assignableRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </TableCell>
                  )}

                  <TableCell>
                    {canEditAvailability ? (
                      <Select
                        value={row.availability}
                        onChange={(e) =>
                          changeAvailability(row.userId, e.target.value as Availability)
                        }
                        className="max-w-[150px]"
                        aria-label={`${row.user.name} availability`}
                      >
                        {(Object.keys(AVAILABILITY_LABEL) as Availability[]).map((a) => (
                          <option key={a} value={a}>
                            {AVAILABILITY_LABEL[a]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge variant={AVAILABILITY_VARIANT[row.availability]}>
                        {AVAILABILITY_LABEL[row.availability]}
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-text-muted">{row.maxOpenLeads}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
