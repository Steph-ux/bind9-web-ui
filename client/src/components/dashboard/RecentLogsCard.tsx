import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DashboardData } from "@/lib/api";

export function RecentLogsCard({ logs }: { logs: DashboardData["recentLogs"] }) {
  return (
    <Card className="border-border/70 bg-card/85 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent system logs</CardTitle>
        <Badge variant="outline">Live feed</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[320px]">
          <div className="bg-zinc-950 p-4 font-mono text-sm text-zinc-100">
            {logs.length > 0 ? (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="mb-2 flex gap-3 border-b border-zinc-800 pb-2"
                >
                  <span className="shrink-0 text-zinc-500">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={[
                      "w-12 shrink-0 text-center font-bold",
                      log.level === "INFO"
                        ? "text-blue-400"
                        : log.level === "WARN"
                          ? "text-yellow-400"
                          : "text-red-400",
                    ].join(" ")}
                  >
                    {log.level}
                  </span>
                  <span className="w-20 shrink-0 truncate text-cyan-400">{log.source}</span>
                  <span className="break-all text-zinc-200">{log.message}</span>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-zinc-500">
                No log entries yet. Activity will appear here.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
