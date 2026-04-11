import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Server, Cpu, Database, Network, Activity, Clock, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const memUsedPct = data ? Math.round((data.system.memory.used / data.system.memory.total) * 100) : 0;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center" style={{ height: "60vh" }}>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Server Status</h2>
          <p className="text-muted-foreground">Hardware utilization and daemon health.</p>
        </div>
        <Badge variant={data?.bind9.running ? "default" : "secondary"} className="px-3 py-1.5 text-sm rounded-full">
          {data?.bind9.running ? "● BIND9 RUNNING" : <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> BIND9 NOT DETECTED</span>}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-3 text-sm">
              <Cpu className="h-4 w-4 text-primary" /> CPU Usage
            </div>
            <div className="font-bold font-mono text-3xl mb-3">
              {data?.system.cpu.total.toFixed(1)}%
            </div>
            <Progress value={data?.system.cpu.total || 0} className="h-1.5 mb-3" />
            <div className="flex justify-between text-muted-foreground text-xs">
              <span>User: {data?.system.cpu.user.toFixed(1)}%</span>
              <span>System: {data?.system.cpu.system.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-3 text-sm">
              <Database className="h-4 w-4 text-primary" /> Memory
            </div>
            <div className="font-bold font-mono text-3xl mb-1">
              {formatBytes(data?.system.memory.used || 0)}
            </div>
            <div className="text-muted-foreground mb-3 text-sm">
              / {formatBytes(data?.system.memory.total || 0)}
            </div>
            <Progress value={memUsedPct} className="h-1.5 mb-3" />
            <div className="flex justify-between text-muted-foreground text-xs">
              <span>Used: {memUsedPct}%</span>
              <span>Free: {formatBytes((data?.system.memory.total || 0) - (data?.system.memory.used || 0))}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-3 text-sm">
              <Activity className="h-4 w-4 text-primary" /> System Uptime
            </div>
            <div className="font-bold font-mono text-3xl mb-3">
              {data?.uptime || "N/A"}
            </div>
            <div className="text-muted-foreground text-sm">
              Hostname: <span className="font-mono">{data?.hostname || "unknown"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader className="border-b flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <CardTitle>Interface Statistics</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {data?.system.interfaces && data.system.interfaces.length > 0 ? (
            <div className="flex flex-col gap-4">
              {data.system.interfaces.map((iface) => (
                <div key={iface.name}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="font-mono">{iface.name}</Badge>
                      <span className="text-muted-foreground font-mono text-sm">{iface.ip}</span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      ↓ {iface.rx} &nbsp;|&nbsp; ↑ {iface.tx}
                    </div>
                  </div>
                  <Progress value={iface.ip === "127.0.0.1" ? 2 : 30} className="h-1" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">No interface data available</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <CardTitle>BIND9 Process Information</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "PID", value: data?.bind9.pid || "N/A" },
              { label: "Status", value: data?.bind9.running ? "Active" : "Inactive" },
              { label: "Threads", value: data?.bind9.threads ?? "N/A" },
              { label: "Version", value: data?.bind9.version || "N/A" },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 rounded-md border bg-muted/30">
                <div className="text-muted-foreground uppercase mb-1 text-[10px] tracking-widest">{label}</div>
                <div className="font-bold font-mono truncate">{String(value)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}