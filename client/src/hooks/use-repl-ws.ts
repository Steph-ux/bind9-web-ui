import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface ReplWsMessage {
  type: "health-snapshot" | "health-update";
  data: any;
}

export function useReplicationWs() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/replication`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg: ReplWsMessage = JSON.parse(event.data);
        if (msg.type === "health-snapshot" || msg.type === "health-update") {
          // Invalidate health-checks query to trigger refetch
          queryClient.invalidateQueries({ queryKey: ["health-checks"] });
        }
      } catch {}
    };

    ws.onclose = () => {
      // Reconnect after 5s
      setTimeout(() => connect(), 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [queryClient]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);
}

