import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "./socket";

const LEAD_EVENTS = ["lead:created", "lead:acknowledged", "lead:escalated", "lead:reassigned"] as const;

/**
 * Subscribes to the workspace's Socket.IO room (joined server-side during
 * the handshake, see RealtimeGateway) and invalidates the relevant queries
 * on each push -- this is what makes new leads / escalations / acks appear
 * without a manual page refresh (Q11).
 */
export function useRealtimeLeadEvents(enabled: boolean) {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-queue"] });
    };

    for (const event of LEAD_EVENTS) socket.on(event, invalidate);
    return () => {
      for (const event of LEAD_EVENTS) socket.off(event, invalidate);
    };
  }, [enabled, queryClient]);
}
