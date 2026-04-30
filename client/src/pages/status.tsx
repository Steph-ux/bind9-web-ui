import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Clock,
  Cpu,
  Database,
  FileText,
  Globe,
  Key,
  Loader2,
  Network,
  RefreshCw,
  Shield,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader, PageState } from "@/components/layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getBindInfo, getStatus, type BindInfoData, type StatusData } from "@/lib/api";

interface StatusSnapshot {
  status: StatusData;
  bindInfo: BindInfoData;
  bindInfoError: string | null;
}

const EMPTY_BIND_INFO: BindInfoData = {
  forwarders: [],
  allowRecursion: [],
  allowQuery: [],
  allowTransfer: [],
  dnssec: [],
  transfers: { incoming: 0, outgoing: 0, details: [] },
  slaveZones: [],
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function Status() {
  const {
    data,
    error,
    isPending,
    isFetching,
    refetch,
  } = useQuery<StatusSnapshot>({
    queryKey: ["status-page"],
    queryFn: async () => {
      const [statusResult, bindInfoResult] = await Promise.allSettled([getStatus(), getBindInfo()]);

      if (statusResult.status !== "fulfilled") {
        throw statusResult.reason instanceof Error
          ? statusResult.reason
          : new Error("Unable to load server status.");
      }

      return {
        status: statusResult.value,
        bindInfo: bindInfoResult.status === "fulfilled" ? bindInfoResult.value : EMPTY_BIND_INFO,
        bindInfoError:
          bindInfoResult.status === "rejected"
            ? bindInfoResult.reason instanceof Error
              ? bindInfoResult.reason.message
              : "Advanced BIND details are temporarily unavailable."
            : null,
      };
    },
    refetchInterval: 10_000,
  });

  if (isPending) {
    return (
      <DashboardLayout>
        <PageState
          loading
          title="Loading server status"
          description="Collecting hardware, daemon and BIND9 management data."
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <PageState
          tone="danger"
          title="Server status unavailable"
          description={error instanceof Error ? error.message : "Unable to load server status."}
          action={
            <Button onClick={() => refetch()}>
              Retry
            </Button>
          }
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  const { status, bindInfo } = data;
  const { bindInfoError } = data;
  const memUsedPct = Math.round((status.system.memory.used / status.system.memory.total) * 100);
  const rpzZoneNames = status.management?.rpz.zoneName
    ? status.management.rpz.zoneName.split(",").map((name) => name.trim()).filter(Boolean)
    : [];
  const targetLabel =
    status.connectionMode === "ssh" && status.sshState?.host
      ? status.sshState.host
      : status.hostname || "current server";
  const writableSummary = status.management
    ? [
        ["Options", status.management.writablePaths.namedConfOptions],
        ["Zones", status.management.features.zones],
        ["ACLs", status.management.features.acls],
        ["Keys", status.management.features.keys],
        ["RPZ", status.management.features.rpz],
      ]
    : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Server Status"
          description="Hardware utilization, BIND9 health and management capabilities."
          icon={Activity}
          badge={
            <Badge
              variant="outline"
              className={[
                "gap-2 border-border/70 bg-background/70",
                status.bind9.running
                  ? "text-emerald-400"
                  : "text-amber-400",
              ].join(" ")}
            >
              {status.bind9.running ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  BIND9 running
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  BIND9 not detected
                </>
              )}
            </Badge>
          }
          actions={
            <Button
              variant="outline"
              className="h-10 gap-2 rounded-xl border-border/70 bg-background/70 shadow-none"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          }
        />

        {bindInfoError ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Partial status only</AlertTitle>
            <AlertDescription>
              Core server status is available, but advanced BIND details could not be loaded: {bindInfoError}
            </AlertDescription>
          </Alert>
        ) : null}

        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>What this page reflects</AlertTitle>
          <AlertDescription>
            Forwarders and the allow-* controls below are parsed from the active server&apos;s
            <span className="mx-1 font-mono">named.conf.options</span>
            file. Named ACL objects themselves are managed separately in
            <span className="mx-1 font-mono">Security &gt; ACLs</span>.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="CPU Usage"
            value={`${status.system.cpu.total.toFixed(1)}%`}
            description={`User ${status.system.cpu.user.toFixed(1)}%, System ${status.system.cpu.system.toFixed(1)}%`}
            icon={Cpu}
            tone="warning"
          />
          <MetricCard
            label="Memory"
            value={formatBytes(status.system.memory.used)}
            description={`${memUsedPct}% used of ${formatBytes(status.system.memory.total)}`}
            icon={Database}
          />
          <MetricCard
            label="System Uptime"
            value={status.uptime || "N/A"}
            description={`Hostname ${status.hostname || "unknown"}`}
            icon={Clock}
            tone="success"
          />
          <MetricCard
            label="Open Files"
            value={status.system.openFiles}
            description={status.bind9.running ? `BIND9 ${status.bind9.version}` : "Daemon not detected"}
            icon={FileText}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-2 tracking-[-0.04em]">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                Control Plane
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Mode</div>
                <div className="font-mono font-semibold">{status.connectionMode?.toUpperCase() || "LOCAL"}</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Target</div>
                <div className="truncate font-mono font-semibold">{targetLabel}</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">SSH State</div>
                <div className="font-mono font-semibold">
                  {status.sshState?.connected
                    ? "Connected"
                    : status.sshState?.configured
                      ? "Configured"
                      : "Local only"}
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">BIND Access</div>
                <div className="font-mono font-semibold">
                  {status.management?.available ? "Available" : "Unavailable"}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-2 tracking-[-0.04em]">
                <Shield className="h-4 w-4 text-primary" />
                Writable Surface
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {status.management ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {writableSummary.map(([label, enabled]) => (
                      <Badge key={String(label)} variant={enabled ? "default" : "secondary"}>
                        {label} {enabled ? "Writable" : "Read-only"}
                      </Badge>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                      <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Layout</div>
                      <div className="font-mono font-semibold">{status.management.zoneLayout.strategy}</div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                      <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">RPZ</div>
                      <div className="font-mono font-semibold">
                        {status.management.rpz.configured ? status.management.rpz.zoneName || "Configured" : "Not configured"}
                      </div>
                      {rpzZoneNames.length > 1 ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Multiple response-policy zones are active on this target.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <PageState
                  title="No management capability data"
                  description="This target did not return writable-surface metadata."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)]">
          <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-2 tracking-[-0.04em]">
                <Network className="h-4 w-4 text-primary" />
                Interface Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {status.system.interfaces.length > 0 ? (
                status.system.interfaces.map((iface) => (
                  <div key={iface.name} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/45 px-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Badge variant="outline" className="border-border/70 bg-background/70 font-mono">
                          {iface.name}
                        </Badge>
                        <span className="truncate font-mono text-sm text-muted-foreground">
                          {iface.ip}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        RX {iface.rx} | TX {iface.tx}
                      </div>
                    </div>
                    <Progress value={iface.ip === "127.0.0.1" ? 2 : 30} className="h-1.5" />
                  </div>
                ))
              ) : (
                <PageState
                  title="No interface data"
                  description="The server did not return any network interface statistics."
                />
              )}
            </CardContent>
          </Card>

          <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-2 tracking-[-0.04em]">
                <Activity className="h-4 w-4 text-primary" />
                BIND9 Process Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "PID", value: status.bind9.pid ?? "N/A" },
                  { label: "Status", value: status.bind9.running ? "Active" : "Inactive" },
                  { label: "Threads", value: status.bind9.threads || "N/A" },
                  { label: "Version", value: status.bind9.version || "N/A" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-2xl border border-border/60 bg-background/45 p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {label}
                    </div>
                    <div className="truncate font-mono font-semibold">{String(value)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {status.management ? (
          <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-2 tracking-[-0.04em]">
                <Shield className="h-4 w-4 text-primary" />
                Management Capabilities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Mode</div>
                  <div className="font-mono font-semibold">{status.management.mode}</div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Zone Layout</div>
                  <div className="font-mono font-semibold">{status.management.zoneLayout.strategy}</div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Forward Dir</div>
                  <div className="break-all font-mono text-xs">
                    {status.management.zoneLayout.forwardDir || "Not detected"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Reverse Dir</div>
                  <div className="break-all font-mono text-xs">
                    {status.management.zoneLayout.reverseDir || "Not detected"}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant={status.management.features.zones ? "default" : "secondary"}>
                  Zones {status.management.features.zones ? "Writable" : "Read-only"}
                </Badge>
                <Badge variant={status.management.features.acls ? "default" : "secondary"}>
                  ACLs {status.management.features.acls ? "Writable" : "Read-only"}
                </Badge>
                <Badge variant={status.management.features.keys ? "default" : "secondary"}>
                  Keys {status.management.features.keys ? "Writable" : "Read-only"}
                </Badge>
                <Badge variant={status.management.features.rpz ? "default" : "secondary"}>
                  RPZ {status.management.features.rpz ? "Writable" : "Read-only"}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Includes
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={status.management.includes.namedConfLocalIncluded ? "outline" : "secondary"}>
                      named.conf.local
                    </Badge>
                    <Badge variant={status.management.includes.namedConfAclsIncluded ? "outline" : "secondary"}>
                      named.conf.acls
                    </Badge>
                    <Badge variant={status.management.includes.namedConfKeysIncluded ? "outline" : "secondary"}>
                      named.conf.keys
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Writable Paths
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={status.management.writablePaths.namedConfLocal ? "outline" : "secondary"}>
                      local
                    </Badge>
                    <Badge variant={status.management.writablePaths.namedConfOptions ? "outline" : "secondary"}>
                      options
                    </Badge>
                    <Badge variant={status.management.writablePaths.namedConfAcls ? "outline" : "secondary"}>
                      acls
                    </Badge>
                    <Badge variant={status.management.writablePaths.namedConfKeys ? "outline" : "secondary"}>
                      keys
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-2 tracking-[-0.04em]">
                <Globe className="h-4 w-4 text-primary" />
                Forwarders
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <p className="text-xs text-muted-foreground">
                Global forwarders explicitly declared in <span className="font-mono">named.conf.options</span>.
              </p>
              {bindInfo.forwarders.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {bindInfo.forwarders.map((ip) => (
                    <Badge key={ip} variant="outline" className="font-mono">
                      {ip}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No global forwarders are explicitly configured in <span className="font-mono">named.conf.options</span>.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-2 tracking-[-0.04em]">
                <Shield className="h-4 w-4 text-primary" />
                Global Access Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground">
                These values come from the global <span className="font-mono">allow-recursion</span>,
                <span className="mx-1 font-mono">allow-query</span> and
                <span className="font-mono">allow-transfer</span> directives, not from the ACL object list itself.
              </p>
              {[
                {
                  label: "Allow-Recursion",
                  items: bindInfo.allowRecursion,
                  emptyLabel: "No global allow-recursion directive found.",
                },
                {
                  label: "Allow-Query",
                  items: bindInfo.allowQuery,
                  emptyLabel: "No global allow-query directive found.",
                },
                {
                  label: "Allow-Transfer",
                  items: bindInfo.allowTransfer,
                  emptyLabel: "No global allow-transfer directive found.",
                },
              ].map(({ label, items, emptyLabel }) => (
                <div key={label}>
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {label}
                  </div>
                  {items.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((item) => (
                        <Badge key={item} variant="secondary" className="font-mono text-xs">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs italic text-muted-foreground">{emptyLabel}</div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-2 tracking-[-0.04em]">
                <Key className="h-4 w-4 text-primary" />
                DNSSEC Signing Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {bindInfo.dnssec.length > 0 ? (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {bindInfo.dnssec.map((zone) => (
                    <div
                      key={zone.zone}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/45 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge variant={zone.signed ? "default" : "secondary"} className="text-xs">
                          {zone.signed ? "Signed" : "Unsigned"}
                        </Badge>
                        <span className="truncate font-mono text-sm">{zone.zone}</span>
                      </div>
                      {zone.keys.length > 0 ? (
                        <div className="flex flex-wrap justify-end gap-1">
                          {zone.keys.map((key, index) => (
                            <Badge key={`${zone.zone}-${index}`} variant="outline" className="text-[10px] font-mono">
                              {key.algorithm} ({key.status})
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No DNSSEC zones detected.</p>
              )}
            </CardContent>
          </Card>

          <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-2 tracking-[-0.04em]">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                Zone Transfers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border/60 bg-background/45 p-3 text-center">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Incoming</div>
                  <div className="font-mono text-2xl font-semibold">{bindInfo.transfers.incoming}</div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/45 p-3 text-center">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Outgoing</div>
                  <div className="font-mono text-2xl font-semibold">{bindInfo.transfers.outgoing}</div>
                </div>
              </div>
              {bindInfo.transfers.details.length > 0 ? (
                <div className="space-y-1">
                  {bindInfo.transfers.details.map((detail, index) => (
                    <div
                      key={`${detail}-${index}`}
                      className="truncate rounded-xl border border-border/60 bg-background/45 px-2 py-1 font-mono text-xs text-muted-foreground"
                    >
                      {detail}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active transfers.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {bindInfo.slaveZones.length > 0 ? (
          <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-2 tracking-[-0.04em]">
                <FileText className="h-4 w-4 text-primary" />
                Slave Zones Sync Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left">Zone</th>
                      <th className="px-3 py-2 text-left">File</th>
                      <th className="px-3 py-2 text-left">Last Modified</th>
                      <th className="px-3 py-2 text-right">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bindInfo.slaveZones.map((zone) => (
                      <tr key={zone.zone} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono">{zone.zone}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{zone.file}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {zone.lastModified ? new Date(zone.lastModified).toLocaleString() : "Never"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                          {zone.size > 0 ? formatBytes(zone.size) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

