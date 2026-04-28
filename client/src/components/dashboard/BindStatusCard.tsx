import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/api";

export function BindStatusCard({ data }: { data: DashboardData }) {
  return (
    <Card className="border-border/70 bg-card/85 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>BIND9 status</CardTitle>
        <Badge variant={data.bind9.running ? "default" : "secondary"}>
          {data.bind9.running ? "RUNNING" : "INACTIVE"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">Version</span>
          <span className="text-right text-sm font-medium">{data.bind9.version || "N/A"}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">Uptime</span>
          <span className="text-right text-sm font-medium">{data.uptime || "N/A"}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">PID</span>
          <span className="text-right text-sm font-medium">{data.bind9.pid ?? "N/A"}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">Threads</span>
          <span className="text-right text-sm font-medium">{data.bind9.threads || "N/A"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
