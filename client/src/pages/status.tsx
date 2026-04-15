import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Cpu, Database, Network, Activity, Clock, Loader2, AlertTriangle, Shield, ArrowRightLeft, Globe, Key, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getStatus, getBindInfo, type StatusData, type BindInfoData } from "@/lib/api";

export default function Status() {
  const [data, setData] = useState<StatusData | null>(null);
  const [bindInfo, setBindInfo] = useState<BindInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<any>(null);

  const fetchStatus = async () => {
    try {
      const [status, info] = await Promise.all([getStatus(), getBindInfo()]);
      setData(status);
      setBindInfo(info);
    } catch (e) {
      console.error("Status fetch failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 10000);
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

      <Card className="mb-6">
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

      {/* ── BIND9 Advanced Info ──────────────────────────────── */}
      {data?.management && (
        <Card className="mb-6">
          <CardHeader className="border-b flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <CardTitle>Management Capabilities</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="p-3 rounded-md border bg-muted/30">
                <div className="text-muted-foreground uppercase mb-1 text-[10px] tracking-widest">Mode</div>
                <div className="font-bold font-mono">{data.management.mode}</div>
              </div>
              <div className="p-3 rounded-md border bg-muted/30">
                <div className="text-muted-foreground uppercase mb-1 text-[10px] tracking-widest">Zone Layout</div>
                <div className="font-bold font-mono">{data.management.zoneLayout.strategy}</div>
              </div>
              <div className="p-3 rounded-md border bg-muted/30">
                <div className="text-muted-foreground uppercase mb-1 text-[10px] tracking-widest">Forward Dir</div>
                <div className="font-mono text-xs break-all">{data.management.zoneLayout.forwardDir || "Not detected"}</div>
              </div>
              <div className="p-3 rounded-md border bg-muted/30">
                <div className="text-muted-foreground uppercase mb-1 text-[10px] tracking-widest">Reverse Dir</div>
                <div className="font-mono text-xs break-all">{data.management.zoneLayout.reverseDir || "Not detected"}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={data.management.features.zones ? "default" : "secondary"}>Zones {data.management.features.zones ? "Writable" : "Read-only"}</Badge>
              <Badge variant={data.management.features.acls ? "default" : "secondary"}>ACLs {data.management.features.acls ? "Writable" : "Read-only"}</Badge>
              <Badge variant={data.management.features.keys ? "default" : "secondary"}>Keys {data.management.features.keys ? "Writable" : "Read-only"}</Badge>
              <Badge variant={data.management.features.rpz ? "default" : "secondary"}>RPZ {data.management.features.rpz ? "Writable" : "Read-only"}</Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-widest mb-2">Includes</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={data.management.includes.namedConfLocalIncluded ? "outline" : "secondary"}>named.conf.local</Badge>
                  <Badge variant={data.management.includes.namedConfAclsIncluded ? "outline" : "secondary"}>named.conf.acls</Badge>
                  <Badge variant={data.management.includes.namedConfKeysIncluded ? "outline" : "secondary"}>named.conf.keys</Badge>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-widest mb-2">Writable Paths</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={data.management.writablePaths.namedConfLocal ? "outline" : "secondary"}>local</Badge>
                  <Badge variant={data.management.writablePaths.namedConfOptions ? "outline" : "secondary"}>options</Badge>
                  <Badge variant={data.management.writablePaths.namedConfAcls ? "outline" : "secondary"}>acls</Badge>
                  <Badge variant={data.management.writablePaths.namedConfKeys ? "outline" : "secondary"}>keys</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {/* Forwarders */}
        <Card>
          <CardHeader className="border-b flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <CardTitle>Forwarders</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {bindInfo?.forwarders && bindInfo.forwarders.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {bindInfo.forwarders.map((ip) => (
                  <Badge key={ip} variant="outline" className="font-mono">{ip}</Badge>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No forwarders configured</div>
            )}
          </CardContent>
        </Card>

        {/* Access Controls */}
        <Card>
          <CardHeader className="border-b flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <CardTitle>Access Controls</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {[
                { label: "Allow-Recursion", items: bindInfo?.allowRecursion },
                { label: "Allow-Query", items: bindInfo?.allowQuery },
                { label: "Allow-Transfer", items: bindInfo?.allowTransfer },
              ].map(({ label, items }) => (
                <div key={label}>
                  <div className="text-muted-foreground text-xs uppercase tracking-widest mb-1">{label}</div>
                  {items && items.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((item) => (
                        <Badge key={item} variant="secondary" className="font-mono text-xs">{item}</Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-xs italic">Not configured</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {/* DNSSEC Status */}
        <Card>
          <CardHeader className="border-b flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            <CardTitle>DNSSEC Signing Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {bindInfo?.dnssec && bindInfo.dnssec.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {bindInfo.dnssec.map((zone) => (
                  <div key={zone.zone} className="flex items-center justify-between p-2 rounded-md border bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Badge variant={zone.signed ? "default" : "secondary"} className="text-xs">
                        {zone.signed ? "Signed" : "Unsigned"}
                      </Badge>
                      <span className="font-mono text-sm">{zone.zone}</span>
                    </div>
                    {zone.keys.length > 0 && (
                      <div className="flex gap-1">
                        {zone.keys.map((k, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] font-mono">
                            {k.algorithm} ({k.status})
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No DNSSEC zones detected</div>
            )}
          </CardContent>
        </Card>

        {/* Zone Transfers */}
        <Card>
          <CardHeader className="border-b flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            <CardTitle>Zone Transfers</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-3 grid-cols-2 mb-3">
              <div className="p-3 rounded-md border bg-muted/30 text-center">
                <div className="text-muted-foreground uppercase mb-1 text-[10px] tracking-widest">Incoming</div>
                <div className="font-bold font-mono text-2xl">{bindInfo?.transfers.incoming ?? 0}</div>
              </div>
              <div className="p-3 rounded-md border bg-muted/30 text-center">
                <div className="text-muted-foreground uppercase mb-1 text-[10px] tracking-widest">Outgoing</div>
                <div className="font-bold font-mono text-2xl">{bindInfo?.transfers.outgoing ?? 0}</div>
              </div>
            </div>
            {bindInfo?.transfers.details && bindInfo.transfers.details.length > 0 ? (
              <div className="space-y-1">
                {bindInfo.transfers.details.map((detail, i) => (
                  <div key={i} className="text-xs font-mono text-muted-foreground bg-muted/20 rounded px-2 py-1 truncate">
                    {detail}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No active transfers</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Slave Zones */}
      {bindInfo?.slaveZones && bindInfo.slaveZones.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="border-b flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle>Slave Zones Sync Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 px-3">Zone</th>
                    <th className="text-left py-2 px-3">File</th>
                    <th className="text-left py-2 px-3">Last Modified</th>
                    <th className="text-right py-2 px-3">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {bindInfo.slaveZones.map((sz) => (
                    <tr key={sz.zone} className="border-b last:border-0">
                      <td className="py-2 px-3 font-mono">{sz.zone}</td>
                      <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{sz.file}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {sz.lastModified ? new Date(sz.lastModified).toLocaleString() : "Never"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                        {sz.size > 0 ? formatBytes(sz.size) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
