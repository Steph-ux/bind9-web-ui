import { useEffect, useState, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import {
  Globe,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Server,
  Download,
  Cpu,
  Loader2,
  WifiOff
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDashboard, type DashboardData } from "@/lib/api";

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<any>(null);

  const fetchData = async () => {
    try {
      const d = await getDashboard();
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 10000);
    return () => clearInterval(intervalRef.current);
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center" style={{ height: "60vh" }}>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (error && !data) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center gap-3" style={{ height: "60vh" }}>
          <WifiOff className="h-12 w-12 text-destructive" />
          <p className="text-destructive">{error}</p>
          <Button onClick={fetchData}>Retry</Button>
        </div>
      </DashboardLayout>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const typeData = data?.typeDistribution?.length
    ? data.typeDistribution
    : [{ name: "No data", value: 0 }];

  return (
    <DashboardLayout>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            System Overview
            <span className={`inline-block h-2 w-2 rounded-full ${data?.bind9.running ? 'bg-green-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`} />
          </h2>
          <p className="text-muted-foreground">Real-time DNS metrics and server performance.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Export Report
          </Button>
          <Button onClick={fetchData} className="gap-2">
            <Activity className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold">{data?.zones.total || 0}</h3>
                <span className="text-sm text-muted-foreground">Total Zones</span>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Globe className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-sm text-green-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {data?.zones.active || 0}</span>
              <span className="text-sm text-muted-foreground ml-2">active zones</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold">{data?.records || 0}</h3>
                <span className="text-sm text-muted-foreground">Total Records</span>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Activity className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-sm text-muted-foreground">DNS entries across all zones</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold">{data?.uptime || "N/A"}</h3>
                <span className="text-sm text-muted-foreground">Server Uptime</span>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Server className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              {data?.bind9.running ? (
                <span className="text-sm text-green-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> BIND9 Running</span>
              ) : (
                <span className="text-sm text-yellow-600 inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> BIND9 Not Detected</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold">{data?.system.cpu.toFixed(1)}%</h3>
                <span className="text-sm text-muted-foreground">CPU Usage</span>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Cpu className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-sm text-muted-foreground">Memory: {formatBytes(data?.system.memory.used || 0)} / {formatBytes(data?.system.memory.total || 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-8 mb-6">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Record Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: "300px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData} layout="vertical" margin={{ left: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" stroke="#888" fontSize={12} tickLine={false} axisLine={false} width={50} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>BIND9 Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={data?.bind9.running ? "default" : "secondary"}>
                  {data?.bind9.running ? "RUNNING" : "NOT DETECTED"}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Version</span>
                <span className="text-sm font-medium">{data?.bind9.version || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Uptime</span>
                <span className="text-sm font-medium">{data?.uptime || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">PID</span>
                <span className="text-sm font-medium">{data?.bind9.pid || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Threads</span>
                <span className="text-sm font-medium">{data?.bind9.threads || "N/A"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent System Logs</CardTitle>
          <Badge variant="outline">LIVE</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[300px]">
            <div className="bg-zinc-950 dark:bg-zinc-950 text-zinc-100 dark:text-zinc-100 p-4 font-mono text-sm">
              {data?.recentLogs && data.recentLogs.length > 0 ? (
                data.recentLogs.map((log) => (
                  <div key={log.id} className="flex gap-3 mb-2 pb-2 border-b border-zinc-800 dark:border-zinc-800">
                    <span className="text-zinc-500 dark:text-zinc-500 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`shrink-0 text-center font-bold w-12 ${log.level === 'INFO' ? 'text-blue-400' : log.level === 'WARN' ? 'text-yellow-400' : 'text-red-400'}`}>
                      {log.level}
                    </span>
                    <span className="text-cyan-400 dark:text-cyan-400 shrink-0 w-20 truncate">{log.source}</span>
                    <span className="text-zinc-200 dark:text-zinc-200 break-all">{log.message}</span>
                  </div>
                ))
              ) : (
                <div className="text-zinc-500 dark:text-zinc-500 text-center py-8">No log entries yet. Activity will appear here.</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}