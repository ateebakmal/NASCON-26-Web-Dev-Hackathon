import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectSocket, disconnectSocket, getSocket } from "./socket";

const LIVE_EVENTS = [
  "lead:created",
  "lead:acknowledged",
  "lead:escalated",
  "lead:reassigned",
  "deal:changed",
  "payment:changed",
  "message:received",
  "message:sent",
  "message:status",
] as const;

/**
 * Subscribes to the workspace's Socket.IO room (joined server-side during the
 * handshake) and invalidates the relevant queries on each push, so new leads,
 * escalations, messages and payment updates appear without a manual refresh
 * (Q11).
 *
 * Returns whether the live connection is currently up, so the UI can say so
 * rather than silently going stale.
 */
export function useRealtimeLeadEvents(enabled: boolean): { connected: boolean } {
  const queryClient = useQueryClient();
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) {
      disconnectSocket();
      setConnected(false);
      return;
    }

    const socket = connectSocket();

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["recovery-queue"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    };

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    // Swallow the handshake error rather than letting it surface as an
    // unhandled console error on every retry while the API is restarting.
    const onError = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);
    for (const event of LIVE_EVENTS) socket.on(event, invalidate);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
      for (const event of LIVE_EVENTS) socket.off(event, invalidate);
    };
  }, [enabled, queryClient]);

  return { connected };
}

export function isSocketConnected(): boolean {
  return getSocket().connected;
}
