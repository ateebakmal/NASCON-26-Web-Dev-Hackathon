import * as React from "react";
import { AlarmClock, AlertTriangle, Flame } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import type { EscalationJob } from "./types";

/**
 * Purely a display computed from the server-authoritative EscalationJob.fireAt
 * -- never a client-owned timer. The actual race-safe decision of when a lead
 * escalates happens entirely server-side (see assignment-engine.service.ts);
 * this badge just re-renders every second from that fixed timestamp.
 */
export function EscalationCountdownBadge({ job }: { job: EscalationJob | undefined }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!job || job.status !== "PENDING") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [job]);

  if (!job || job.status !== "PENDING") {
    return <Badge variant="neutral">No active timer</Badge>;
  }

  const remainingMs = new Date(job.fireAt).getTime() - now;
  const remainingSeconds = Math.max(Math.ceil(remainingMs / 1000), 0);

  if (remainingSeconds <= 0) {
    return (
      <Badge variant="danger">
        <Flame className="h-3 w-3" aria-hidden="true" />
        Escalating…
      </Badge>
    );
  }

  const variant = remainingSeconds <= 10 ? "warning" : "primary";
  const Icon = remainingSeconds <= 10 ? AlertTriangle : AlarmClock;

  return (
    <Badge variant={variant}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {remainingSeconds}s to escalation
    </Badge>
  );
}
