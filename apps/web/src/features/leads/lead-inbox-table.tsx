import { Loader2 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
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

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Lead</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Escalations</TableHead>
          <TableHead>Timer</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && (
          <TableEmpty colSpan={7}>
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Loading leads…
            </span>
          </TableEmpty>
        )}

        {!isLoading && (!leads || leads.length === 0) && (
          <TableEmpty colSpan={7}>
            No leads yet — add one above to watch the assignment engine run.
          </TableEmpty>
        )}

        {!isLoading &&
          leads?.map((lead) => {
            const activeAssignment = lead.assignments[0];
            const isMine = activeAssignment?.assigneeId === user?.id;
            const canAck = isMine && !activeAssignment?.ackAt && !activeAssignment?.endedAt;

            return (
              <TableRow key={lead.id}>
                <TableCell>
                  <p className="font-medium text-text">{lead.name}</p>
                  <p className="text-sm text-text-muted">{lead.phone ?? lead.email ?? "—"}</p>
                </TableCell>
                <TableCell>
                  <Badge>{lead.source}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[lead.status]}>{lead.status}</Badge>
                </TableCell>
                <TableCell className="text-text-muted">
                  {activeAssignment?.assignee.name ?? "Unassigned"}
                </TableCell>
                <TableCell className="text-text-muted">{lead.escalationCount}×</TableCell>
                <TableCell>
                  <EscalationCountdownBadge job={activeAssignment?.escalationJobs?.[0]} />
                </TableCell>
                <TableCell className="text-right">
                  {canAck && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={acknowledge.isPending}
                      onClick={() => acknowledge.mutate(lead.id)}
                    >
                      Acknowledge
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
}
