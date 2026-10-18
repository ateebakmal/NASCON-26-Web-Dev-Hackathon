import { Loader2 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EscalationCountdownBadge } from "./escalation-countdown-badge";
import { useAcknowledgeLead } from "./api";
import { useAuth } from "../../app/auth-context";
import type { Lead } from "./types";

const STATUS_VARIANT: Record<Lead["status"], "neutral" | "primary" | "success" | "warning" | "danger"> = {
  NEW: "neutral",
  ASSIGNED: "primary",
  ACKNOWLEDGED: "success",
  ESCALATED: "danger",
  CONVERTED: "success",
  LOST: "neutral",
};

export function LeadInboxTable({ leads, isLoading }: { leads: Lead[] | undefined; isLoading: boolean }) {
  const { user } = useAuth();
  const acknowledge = useAcknowledgeLead();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading leads…
      </div>
    );
  }

  if (!leads || leads.length === 0) {
    return <p className="py-8 text-sm text-text-muted">No leads yet — add one above to see the assignment engine run.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-muted">
            <th className="py-2 pr-4 font-medium">Lead</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Owner</th>
            <th className="py-2 pr-4 font-medium">Escalation</th>
            <th className="py-2 pr-4 font-medium">Timer</th>
            <th className="py-2 pr-4 font-medium" />
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const activeAssignment = lead.assignments[0];
            const isMine = activeAssignment?.assigneeId === user?.id;
            const canAck = isMine && !activeAssignment?.ackAt && !activeAssignment?.endedAt;

            return (
              <tr key={lead.id} className="border-b border-border">
                <td className="py-3 pr-4">
                  <p className="font-medium text-text">{lead.name}</p>
                  <p className="text-xs text-text-muted">{lead.phone ?? lead.email ?? "—"}</p>
                </td>
                <td className="py-3 pr-4">
                  <Badge variant={STATUS_VARIANT[lead.status]}>{lead.status}</Badge>
                </td>
                <td className="py-3 pr-4 text-text-muted">{activeAssignment?.assignee.name ?? "Unassigned"}</td>
                <td className="py-3 pr-4 text-text-muted">{lead.escalationCount}×</td>
                <td className="py-3 pr-4">
                  <EscalationCountdownBadge job={activeAssignment?.escalationJobs?.[0]} />
                </td>
                <td className="py-3 pr-4 text-right">
                  {canAck && (
                    <Button size="sm" variant="secondary" loading={acknowledge.isPending} onClick={() => acknowledge.mutate(lead.id)}>
                      Acknowledge
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
