import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { useRecoveryQueue } from "../leads/api";
import type { RecoveryReason } from "../leads/types";

const REASON_LABEL: Record<RecoveryReason, string> = {
  UNACKED_PAST_WINDOW: "Unacknowledged past window",
  ESCALATED_REPEATEDLY: "Escalated 2+ times",
  IDLE: "Idle past threshold",
};

const REASON_VARIANT: Record<RecoveryReason, "warning" | "danger"> = {
  UNACKED_PAST_WINDOW: "warning",
  ESCALATED_REPEATEDLY: "danger",
  IDLE: "warning",
};

export function RecoveryQueuePage() {
  const { data, isLoading, isError } = useRecoveryQueue();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Recovery Queue</h1>
        <p className="text-sm text-text-muted">
          Leads unacknowledged past their window, escalated twice or more, or idle past the configured period.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Needs attention</CardTitle>
          <CardDescription>Clears automatically once a lead is acknowledged.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Loading…
            </div>
          ) : isError ? (
            <p role="alert" className="py-4 text-sm text-danger">
              Could not load the recovery queue.
            </p>
          ) : !data || data.length === 0 ? (
            <p className="py-8 text-sm text-text-muted">Recovery queue is clear.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.map(({ lead, reason }) => (
                <li
                  key={lead.id}
                  className="flex flex-col gap-2 rounded-sm border border-border bg-muted p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-text">{lead.name}</p>
                    <p className="text-xs text-text-muted">{lead.phone ?? lead.email ?? "—"}</p>
                  </div>
                  <Badge variant={REASON_VARIANT[reason]}>{REASON_LABEL[reason]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
