import * as React from "react";
import { UserPlus } from "lucide-react";
import { Button } from "../../components/ui/button";
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
import { useAuth } from "../../app/auth-context";
import { ApiError } from "../../lib/api";
import { useInviteMember, type BaseRole, type PermissionSetRow } from "../permissions/api";

/**
 * Adds a person to the workspace and puts them in a permission group in one
 * step, so a new member is never left with no access and no obvious fix.
 */
export function AddMemberDialog({ roles }: { roles: PermissionSetRow[] }) {
  const { user } = useAuth();
  // Only the Owner may grant the Admin level, so nobody else is offered it.
  const canGrantAdmin = user?.baseRole === "OWNER";
  const invite = useInviteMember();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [baseRole, setBaseRole] = React.useState<BaseRole>("USER");
  const [permissionSetId, setPermissionSetId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Default to the narrowest group on offer rather than "no access", which
  // produces a member who can log in and then see nothing.
  React.useEffect(() => {
    if (!permissionSetId && roles.length) setPermissionSetId(roles[roles.length - 1].id);
  }, [roles, permissionSetId]);

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
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>
            Email invitations need the Resend integration, so for now the account is created
            directly with a password you set and share with them.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          <div className="flex flex-col gap-3 p-5">
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Name
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sana Tariq"
              />
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
                  {canGrantAdmin && <option value="ADMIN">Admin</option>}
                </Select>
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm text-text-muted">
                Permission group
                <Select
                  value={permissionSetId}
                  onChange={(e) => setPermissionSetId(e.target.value)}
                >
                  <option value="">No group (no access)</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <p className="text-sm text-text-muted">
              New members start Offline so round-robin skips them until they are ready. Set them
              Available in the table once they have signed in.
            </p>

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
