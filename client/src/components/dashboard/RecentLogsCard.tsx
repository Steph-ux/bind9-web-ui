import { Activity, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DashboardData } from "@/lib/api";

export function RecentLogsCard({ logs }: { logs: DashboardData["recentLogs"] }) {
  const getLevelStyle = (level: string) => {
    switch (level.toUpperCase()) {
      case "INFO":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "WARN":
      case "WARNING":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "ERROR":
      case "CRITICAL":
        return "bg-red-500/10 text-red-400 border-red-500/30";
      default:
        return "bg-muted text-muted-foreground border-border/60";
    }
  };

  return (
    <Card className="rounded-2xl border border-border/70 bg-card/85 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-primary">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-bold tracking-tight text-foreground">
              Journal d'Audit & Evenements DNS
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Flux des requetes DNS, transferts de zone et sauvegardes systeme
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Flux en direct
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0 bg-background/40">
        <ScrollArea className="h-[300px]">
          <div className="divide-y divide-border/40 font-mono text-xs">
            {logs && logs.length > 0 ? (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>

                    <Badge
                      variant="outline"
                      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 shrink-0 ${getLevelStyle(
                        log.level
                      )}`}
                    >
                      {log.level}
                    </Badge>

                    <Badge variant="secondary" className="text-[10px] uppercase font-mono shrink-0">
                      {log.source}
                    </Badge>

                    <span className="truncate text-foreground/90 font-mono text-xs" title={log.message}>
                      {log.message}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Aucun evenement recent dans le journal d'audit.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
