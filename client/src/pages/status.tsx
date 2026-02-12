import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Server, Cpu, Database, Network, Activity, Clock, Loader2 } from "lucide-react";
import { getStatus, type StatusData } from "@/lib/api";

export default function Status() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<any>(null);

  const fetchStatus = async () => {
    try {
      const status = await getStatus();
      setData(status);
    } catch (e) {
      console.error("Status fetch failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000); // Refresh every 5s
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

  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const memUsedPct = data ? (data.system.memory.used / data.system.memory.total) * 100 : 0;

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Server Status</h1>
          <p className="text-muted-foreground mt-1">Hardware utilization and daemon health.</p>
        </div>
        <Badge className={`px-3 py-1 text-sm font-mono tracking-wider ${data?.bind9.running
          ? "bg-green-500/10 text-green-500 border-green-500/20"
          : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
          }`}>
          {data?.bind9.running ? "RUNNING" : "BIND9 NOT DETECTED"}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card className="glass-panel border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" /> CPU Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-4 font-mono">{data?.system.cpu.total.toFixed(1)}%</div>
            <Progress value={data?.system.cpu.total || 0} className="h-2 bg-primary/10" />
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>User: {data?.system.cpu.user.toFixed(1)}%</div>
              <div>System: {data?.system.cpu.system.toFixed(1)}%</div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" /> Memory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-4 font-mono">
              {formatBytes(data?.system.memory.used || 0)}
              <span className="text-sm font-normal text-muted-foreground"> / {formatBytes(data?.system.memory.total || 0)}</span>
            </div>
            <Progress value={memUsedPct} className="h-2 bg-primary/10" />
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>Used: {memUsedPct.toFixed(1)}%</div>
              <div>Free: {formatBytes((data?.system.memory.total || 0) - (data?.system.memory.used || 0))}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> System Uptime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-4 font-mono">{data?.uptime || "N/A"}</div>
            <div className="mt-4 text-xs text-muted-foreground">
              <div>Hostname: {data?.hostname || "unknown"}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-primary/10 mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" /> Interface Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {data?.system.interfaces && data.system.interfaces.length > 0 ? (
              data.system.interfaces.map((iface) => (
                <div key={iface.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="font-mono">{iface.name}</Badge>
                      <span className="text-sm font-mono text-muted-foreground">{iface.ip}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      RX: {iface.rx} | TX: {iface.tx}
                    </div>
                  </div>
                  <Progress value={iface.ip === "127.0.0.1" ? 2 : 30} className="h-1 bg-primary/5" />
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-4">No interface data available</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" /> BIND9 Process Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 rounded-lg bg-card/30 border border-border/40">
              <div className="text-xs text-muted-foreground uppercase mb-1">PID</div>
              <div className="text-xl font-mono">{data?.bind9.pid || "N/A"}</div>
            </div>
            <div className="p-4 rounded-lg bg-card/30 border border-border/40">
              <div className="text-xs text-muted-foreground uppercase mb-1">Status</div>
              <div className="text-xl font-mono">{data?.bind9.running ? "Active" : "Inactive"}</div>
            </div>
            <div className="p-4 rounded-lg bg-card/30 border border-border/40">
              <div className="text-xs text-muted-foreground uppercase mb-1">Threads</div>
              <div className="text-xl font-mono">{data?.bind9.threads}</div>
            </div>
            <div className="p-4 rounded-lg bg-card/30 border border-border/40">
              <div className="text-xs text-muted-foreground uppercase mb-1">Version</div>
              <div className="text-xl font-mono truncate">{data?.bind9.version || "N/A"}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}