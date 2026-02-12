import { useEffect, useState, useRef } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar
} from "recharts";
import {
  Globe,
  Activity,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Server,
  Download,
  Upload,
  Loader2,
  WifiOff
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    intervalRef.current = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(intervalRef.current);
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (error && !data) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <WifiOff className="w-12 h-12 text-destructive" />
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            System Overview
            <span className={`flex h-2 w-2 rounded-full ${data?.bind9.running ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />
          </h1>
          <p className="text-muted-foreground mt-1">Real-time DNS metrics and server performance.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/10 hover:text-primary">
            <Download className="w-4 h-4" /> Export Report
          </Button>
          <Button onClick={fetchData} className="gap-2 shadow-[0_0_15px_rgba(0,240,255,0.3)] hover:shadow-[0_0_25px_rgba(0,240,255,0.5)] transition-shadow">
            <Activity className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="glass-panel bg-card/40 border-primary/10 hover:border-primary/30 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Zones</CardTitle>
            <Globe className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{data?.zones.total || 0}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span className="text-green-500 flex items-center"><CheckCircle2 className="w-3 h-3" /> {data?.zones.active || 0}</span>
              active zones
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel bg-card/40 border-primary/10 hover:border-primary/30 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Records</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{data?.records || 0}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              DNS entries across all zones
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel bg-card/40 border-primary/10 hover:border-primary/30 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Server Uptime</CardTitle>
            <Server className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{data?.uptime || "N/A"}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {data?.bind9.running ? (
                <><CheckCircle2 className="w-3 h-3 text-green-500" /> BIND9 Running</>
              ) : (
                <><AlertTriangle className="w-3 h-3 text-yellow-500" /> BIND9 Not Detected</>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel bg-card/40 border-primary/10 hover:border-primary/30 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CPU / Memory</CardTitle>
            <Upload className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{data?.system.cpu.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              RAM: {formatBytes(data?.system.memory.used || 0)} / {formatBytes(data?.system.memory.total || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-7 mb-8">
        {/* Record Distribution */}
        <Card className="col-span-4 glass-panel border-primary/10">
          <CardHeader>
            <CardTitle>Record Distribution</CardTitle>
            <CardDescription>DNS record types across all zones</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData} layout="vertical" margin={{ left: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--accent)/0.1)' }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                    barSize={32}
                    className="hover:opacity-80 transition-opacity"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* BIND9 Info */}
        <Card className="col-span-3 glass-panel border-primary/10">
          <CardHeader>
            <CardTitle>BIND9 Status</CardTitle>
            <CardDescription>DNS Server Information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-card/30 border border-border/40">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge className={data?.bind9.running
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                }>
                  {data?.bind9.running ? "RUNNING" : "NOT DETECTED"}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-card/30 border border-border/40">
                <span className="text-sm text-muted-foreground">Version</span>
                <span className="text-sm font-mono">{data?.bind9.version || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-card/30 border border-border/40">
                <span className="text-sm text-muted-foreground">Uptime</span>
                <span className="text-sm font-mono">{data?.uptime || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-card/30 border border-border/40">
                <span className="text-sm text-muted-foreground">PID</span>
                <span className="text-sm font-mono">{data?.bind9.pid || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-card/30 border border-border/40">
                <span className="text-sm text-muted-foreground">Threads</span>
                <span className="text-sm font-mono">{data?.bind9.threads || "N/A"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Logs Panel */}
      <Card className="glass-panel border-primary/10 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent System Logs</CardTitle>
            <CardDescription>Latest events from the admin panel</CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs">LIVE</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="bg-black/40 font-mono text-sm p-4 max-h-[300px] overflow-y-auto border-t border-border/40 space-y-2">
            {data?.recentLogs && data.recentLogs.length > 0 ? (
              data.recentLogs.map((log) => (
                <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded transition-colors group">
                  <span className="text-muted-foreground shrink-0 select-none">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`shrink-0 uppercase w-16 text-center text-[10px] font-bold border rounded px-1 py-0.5 h-fit
                    ${log.level === 'INFO' ? 'border-blue-900/50 text-blue-400 bg-blue-900/10' : ''}
                    ${log.level === 'WARN' ? 'border-yellow-900/50 text-yellow-400 bg-yellow-900/10' : ''}
                    ${log.level === 'ERROR' ? 'border-red-900/50 text-red-400 bg-red-900/10' : ''}
                  `}>
                    {log.level}
                  </span>
                  <span className="text-primary/70 shrink-0 w-20">{log.source}</span>
                  <span className="text-gray-300 break-all group-hover:text-white transition-colors">
                    {log.message}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground text-center py-4">No log entries yet. Activity will appear here.</div>
            )}
            <div className="animate-pulse text-primary/50 text-xs mt-2">_ awaiting new events...</div>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}