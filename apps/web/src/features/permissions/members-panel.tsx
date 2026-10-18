import * as React from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input, Select } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
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
import {
  useInviteMember,
  useUpdateMember,
  useWorkspaceUsers,
  type BaseRole,
  type PermissionSetRow,
} from "./api";

const LEVEL_VARIANT: Record<BaseRole, "primary" | "warning" | "neutral"> = {
  OWNER: "warning",
  ADMIN: "primary",
  USER: "neutral",
};

/**
 * Defining a role is only half of F1.2/F1.3 -- someone has to be put in it.
 * This assigns members to permission sets and sets their base level.
 */
export function MembersPanel({ sets }: { sets: PermissionSetRow[] }) {
  const { data: users, isLoading, isError } = useWorkspaceUsers();
  const updateMember = useUpdateMember();
  const [error, setError] = React.useState<string | null>(null);

  const assignable = sets.filter((s) => !s.isSystem);

  const change = async (id: string, patch: { baseRole?: BaseRole; permissionSetId?: string }) => {
    setError(null);
    try {
      await updateMember.mutateAsync({ id, ...patch });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the member");
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-border">
        <div>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            A member's permissions come from the role assigned here.
          </CardDescription>
        </div>
        <InviteMemberDialog sets={assignable} />
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
            <TableHead>Level</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableEmpty colSpan={3}>
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Loading members…
              </span>
            </TableEmpty>
          )}
          {isError && (
            <TableEmpty colSpan={3}>
              <span role="alert" className="text-danger">
                Could not load members — you may not have permission to view them.
              </span>
            </TableEmpty>
          )}

          {users?.map((u) => {
            const isOwner = u.baseRole === "OWNER";
            return (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium text-text">{u.name}</p>
                  <p className="text-sm text-text-muted">{u.email}</p>
                </TableCell>
                <TableCell>
                  {/* The Owner's level is fixed at workspace creation and
                      cannot be reassigned by anyone, including themselves. */}
                  {isOwner ? (
                    <Badge variant={LEVEL_VARIANT.OWNER}>OWNER</Badge>
                  ) : (
                    <Select
                      value={u.baseRole}
                      onChange={(e) => change(u.id, { baseRole: e.target.value as BaseRole })}
                      className="max-w-[130px]"
                      aria-label={`${u.name} level`}
                    >
                      <option value="USER">User</option>
                      <option value="ADMIN">Admin</option>
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  {isOwner ? (
                    <span className="text-sm text-text-muted">Full access (implicit)</span>
                  ) : (
                    <Select
                      value={u.permissionSet?.id ?? ""}
                      onChange={(e) => change(u.id, { permissionSetId: e.target.value })}
                      className="max-w-[200px]"
                      aria-label={`${u.name} role`}
                    >
                      <option value="">No role (no access)</option>
                      {assignable.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function InviteMemberDialog({ sets }: { sets: PermissionSetRow[] }) {
  const invite = useInviteMember();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [baseRole, setBaseRole] = React.useState<BaseRole>("USER");
  const [permissionSetId, setPermissionSetId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) return setError("Name and email are both required.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");

    try {
      await invite.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        password,
        baseRole,
        permissionSetId: permissionSetId || undefined,
      });
      setName("");
      setEmail("");
      setPassword("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the member");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="dark" size="sm" className="gap-1.5">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Add member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
          <DialogDescription>
            Email invitations need the Resend integration, so for now the account is created
            directly with a password you set.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          <div className="flex flex-col gap-3 p-5">
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Name
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sana Tariq" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Email
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sana@sunpeak.test"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Initial password
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="at least 8 characters"
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm text-text-muted">
                Level
                <Select value={baseRole} onChange={(e) => setBaseRole(e.target.value as BaseRole)}>
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </Select>
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm text-text-muted">
                Role
                <Select
                  value={permissionSetId}
                  onChange={(e) => setPermissionSetId(e.target.value)}
                >
                  <option value="">No role</option>
                  {sets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={invite.isPending}>
              Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
