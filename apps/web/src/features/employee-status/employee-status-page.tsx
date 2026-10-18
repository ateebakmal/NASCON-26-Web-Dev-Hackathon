import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { useAuth } from "../../app/auth-context";
import { useEmployeeStatuses, useSetMyAvailability, type Availability } from "./api";
import { EmployeeStatusToggle } from "./employee-status-toggle";

export function EmployeeStatusPage() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useEmployeeStatuses();
  const setMine = useSetMyAvailability();

  const mine = data?.find((row) => row.userId === user?.id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Employees</h1>
        <p className="text-sm text-text/60">
          Setting your status to On leave or Offline immediately reassigns any unacknowledged leads you're holding.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your status</CardTitle>
        </CardHeader>
        <CardContent>
          {mine ? (
            <EmployeeStatusToggle
              value={mine.availability}
              loading={setMine.isPending}
              onChange={(next: Availability) => setMine.mutate(next)}
            />
          ) : (
            <p className="text-sm text-text/60">—</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team availability</CardTitle>
          <CardDescription>Who can currently receive a round-robin assignment.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-text/60">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Loading…
            </div>
          ) : isError ? (
            <p role="alert" className="py-4 text-sm text-danger">
              Could not load team status.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/5">
              {data?.map((row) => (
                <li key={row.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-text">{row.user.name}</span>
                  <span className="text-text/60">
                    {row.availability} · cap {row.maxOpenLeads}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
