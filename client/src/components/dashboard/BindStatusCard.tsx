import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/api";

export function BindStatusCard({ data }: { data: DashboardData }) {
  return (
    <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="tracking-[-0.04em]">BIND9 status</CardTitle>
          <p className="text-sm text-muted-foreground">
            Runtime health and service metadata.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            data.bind9.running
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }
        >
          {data.bind9.running ? "RUNNING" : "INACTIVE"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {[
          ["Version", data.bind9.version || "N/A"],
          ["Uptime", data.uptime || "N/A"],
          ["PID", data.bind9.pid ?? "N/A"],
          ["Threads", data.bind9.threads || "N/A"],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/55 px-4 py-3"
          >
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-right text-sm font-medium text-foreground">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
