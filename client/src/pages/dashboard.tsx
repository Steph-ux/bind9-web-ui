import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Download,
  Globe,
  RefreshCw,
  Server,
  WifiOff,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader, PageState } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDashboard, type DashboardData } from "@/lib/api";

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function exportReport(data: DashboardData) {
  const lines = [
    `BIND9 Admin Report - ${new Date().toLocaleString()}`,
    "==========================================",
    "",
    `Zones: ${data.zones.total} total, ${data.zones.active} active`,
    `Records: ${data.records}`,
    `BIND9: ${data.bind9.running ? "Running" : "Not detected"}${data.bind9.running ? ` (v${data.bind9.version}, PID ${data.bind9.pid}, ${data.bind9.threads} threads)` : ""}`,
    `Uptime: ${data.uptime}`,
    `CPU: ${data.system.cpu.toFixed(1)}%`,
    `Memory: ${formatBytes(data.system.memory.used)} / ${formatBytes(data.system.memory.total)}`,
    "",
    "Record Distribution:",
    ...data.typeDistribution.map((entry) => `  ${entry.name}: ${entry.value}`),
    "",
    "Recent Logs:",
    ...data.recentLogs.map(
      (log) =>
        `  [${new Date(log.timestamp).toLocaleString()}] ${log.level} ${log.source}: ${log.message}`,
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bind9-report-${new Date().toISOString().slice(0, 10)}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const {
    data,
    error,
    isPending,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    refetchInterval: 10_000,
  });

  if (isPending) {
    return (
      <DashboardLayout>
        <PageState
          loading
          title="Loading dashboard"
          description="Fetching DNS metrics and recent activity."
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <PageState
          icon={WifiOff}
          tone="danger"
          title="Dashboard unavailable"
          description={error instanceof Error ? error.message : "Unable to load dashboard data."}
          action={<Button onClick={() => refetch()}>Retry</Button>}
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  const chartData = data.typeDistribution.length
    ? data.typeDistribution
    : [{ name: "No data", value: 0 }];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="System Overview"
          description="Real-time DNS metrics, service health and recent server activity."
          icon={Server}
          badge={
            <Badge variant="outline" className="gap-2">
              <span
                className={[
                  "h-2 w-2 rounded-full",
                  data.bind9.running ? "bg-emerald-500" : "bg-amber-500",
                ].join(" ")}
              />
              {data.bind9.running ? "BIND9 online" : "BIND9 not detected"}
            </Badge>
          }
          actions={
            <>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => exportReport(data)}
              >
                <Download className="h-4 w-4" />
                Export report
              </Button>
              <Button className="gap-2" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={["h-4 w-4", isFetching ? "animate-spin" : ""].join(" ")} />
                {isFetching ? "Refreshing" : "Refresh"}
              </Button>
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Zones"
            value={data.zones.total}
            icon={Globe}
            tone="success"
            description={
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {data.zones.active} active
              </span>
            }
          />
          <MetricCard
            label="Records"
            value={data.records}
            icon={Activity}
            description="DNS records across all managed zones."
          />
          <MetricCard
            label="Uptime"
            value={data.uptime}
            icon={Server}
            tone={data.bind9.running ? "success" : "warning"}
            description={data.bind9.running ? "Service responding normally." : "Service not detected."}
          />
          <MetricCard
            label="CPU Usage"
            value={`${data.system.cpu.toFixed(1)}%`}
            icon={Cpu}
            tone="warning"
            description={`Memory ${formatBytes(data.system.memory.used)} / ${formatBytes(data.system.memory.total)}`}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <Card className="border-border/70 bg-card/85 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Record distribution</CardTitle>
              <Badge variant="secondary">{chartData.length} types</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="#94a3b8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      width={72}
                    />
                    <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
                    <Bar
                      dataKey="value"
                      fill="hsl(var(--primary))"
                      radius={[0, 8, 8, 0]}
                      barSize={26}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

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
                <span className="text-right text-sm font-medium">
                  {data.bind9.version || "N/A"}
                </span>
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
                <span className="text-right text-sm font-medium">
                  {data.bind9.threads || "N/A"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 bg-card/85 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent system logs</CardTitle>
            <Badge variant="outline">Live feed</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[320px]">
              <div className="bg-zinc-950 p-4 font-mono text-sm text-zinc-100">
                {data.recentLogs.length > 0 ? (
                  data.recentLogs.map((log) => (
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
                      <span className="w-20 shrink-0 truncate text-cyan-400">
                        {log.source}
                      </span>
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
      </div>
    </DashboardLayout>
  );
}

