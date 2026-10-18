import * as React from "react";
import { Loader2 } from "lucide-react";
import { RESOURCES, ACTIONS, type Action, type Resource } from "@ubp/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";
import { usePermissionSets, useUpdatePermissionSet, type PermissionSetRow } from "./api";

// Proves "Manager is a configurable bundle, not a hardcoded role": every row
// here -- including the seeded "Manager" preset -- is edited through this
// exact same matrix, with no special-cased UI for any particular name.
export function PermissionSetsPage() {
  const { data, isLoading, isError } = usePermissionSets();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Permission Sets</h1>
        <p className="text-sm text-text-muted">
          Every set here, including "Manager", is an ordinary editable bundle of permissions.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Loading…
        </div>
      ) : isError ? (
        <p role="alert" className="py-4 text-sm text-danger">
          Could not load permission sets.
        </p>
      ) : (
        data?.map((set) => <PermissionSetCard key={set.id} set={set} />)
      )}
    </div>
  );
}

function PermissionSetCard({ set }: { set: PermissionSetRow }) {
  const update = useUpdatePermissionSet();
  const [granted, setGranted] = React.useState(() => new Set(set.permissions.map((p) => `${p.resource}:${p.action}`)));

  React.useEffect(() => {
    setGranted(new Set(set.permissions.map((p) => `${p.resource}:${p.action}`)));
  }, [set.permissions]);

  const toggle = (resource: Resource, action: Action) => {
    const key = `${resource}:${action}`;
    const next = new Set(granted);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setGranted(next);

    const items = Array.from(next).map((k) => {
      const [r, a] = k.split(":") as [Resource, Action];
      return { resource: r, action: a };
    });
    update.mutate({ id: set.id, items });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{set.name}</CardTitle>
          {set.isSystem && <Badge variant="primary">System</Badge>}
        </div>
        <CardDescription>{set.users.length} member(s)</CardDescription>
      </CardHeader>
      <CardContent>
        {set.isSystem ? (
          <p className="text-sm text-text-muted">The Owner's full-access set always bypasses permission checks and cannot be edited.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[640px] border-collapse text-xs">
              <thead>
                <tr>
                  <th className="py-1 pr-3 text-left font-medium text-text-muted">Resource</th>
                  {ACTIONS.map((action) => (
                    <th key={action} className="px-2 py-1 text-center font-medium text-text-muted">
                      {action}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map((resource) => (
                  <tr key={resource} className="border-t border-border">
                    <td className="py-1.5 pr-3 text-text-muted">{resource}</td>
                    {ACTIONS.map((action) => {
                      const key = `${resource}:${action}`;
                      const checked = granted.has(key);
                      return (
                        <td key={action} className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            className={cn(
                              "h-4 w-4 cursor-pointer accent-primary",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            )}
                            checked={checked}
                            onChange={() => toggle(resource, action)}
                            aria-label={`${resource}:${action}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
