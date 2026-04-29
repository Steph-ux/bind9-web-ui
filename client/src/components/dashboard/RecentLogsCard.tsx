import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DashboardData } from "@/lib/api";

export function RecentLogsCard({ logs }: { logs: DashboardData["recentLogs"] }) {
  return (
    <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="tracking-[-0.04em]">Recent system logs</CardTitle>
          <p className="text-sm text-muted-foreground">
            Live service activity and recent platform events.
          </p>
        </div>
        <Badge variant="outline" className="border-border/70 bg-background/70">
          Live feed
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[320px]">
          <div className="space-y-2 p-4 font-mono text-[13px]">
            {logs.length > 0 ? (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="grid grid-cols-[84px_68px_minmax(0,120px)_1fr] gap-3 rounded-2xl border border-border/60 bg-background/50 px-3 py-3 text-foreground"
                >
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={[
                      "inline-flex h-6 items-center justify-center rounded-full px-2 text-[11px] font-semibold",
                      log.level === "INFO"
                        ? "bg-primary/12 text-primary"
                        : log.level === "WARN"
                          ? "bg-amber-500/12 text-amber-400"
                          : "bg-destructive/12 text-destructive",
                    ].join(" ")}
                  >
                    {log.level}
                  </span>
                  <span className="truncate text-foreground/80">{log.source}</span>
                  <span className="break-all text-foreground/92">{log.message}</span>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/45 py-10 text-center text-muted-foreground">
                No log entries yet. Activity will appear here.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
