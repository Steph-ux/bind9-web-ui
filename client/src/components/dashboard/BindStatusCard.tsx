import { Activity, CheckCircle2, Cpu, HardDrive, RefreshCw, RotateCcw, Server, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BindServiceActions } from "@/components/host/BindServiceActions";
import type { DashboardData, HostBind9Detection } from "@/lib/api";

export function BindStatusCard({
  data,
  detection,
  onRefresh,
}: {
  data: DashboardData;
  detection?: HostBind9Detection | null;
  onRefresh?: () => void;
}) {
  const isRunning = detection ? detection.bind9.serviceStatus === "active" : data.bind9.running;
  const version = detection?.bind9.version || data.bind9.version || "Non détecté";
  const pid = detection?.bind9.mainPid ?? data.bind9.pid ?? "N/A";
  const serviceName = detection?.bind9.serviceName || "bind9";

  return (
    <Card className="rounded-2xl border border-border/70 bg-card/85 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
            isRunning
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }`}>
            <Server className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-bold tracking-tight text-foreground">
              Serveur BIND9 Local
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Moteur DNS natif sur l'hôte & unité systemd <code className="font-mono text-foreground font-semibold">{serviceName}</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {detection && onRefresh && (
            <BindServiceActions detection={detection} onRefresh={onRefresh} compact />
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        {/* Node Status Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border/50 bg-background/50 p-2.5">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Version BIND9</span>
            <span className="font-mono text-sm font-bold text-foreground">
              {version}
            </span>
          </div>

          <div className="rounded-xl border border-border/50 bg-background/50 p-2.5">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Temps d'activité</span>
            <span className="font-mono text-sm font-bold text-foreground truncate block">
              {data.uptime || "N/A"}
            </span>
          </div>

          <div className="rounded-xl border border-border/50 bg-background/50 p-2.5">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Processus PID</span>
            <span className="font-mono text-sm font-bold text-foreground">
              {pid}
            </span>
          </div>

          <div className="rounded-xl border border-border/50 bg-background/50 p-2.5">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Zones Actives</span>
            <span className="font-mono text-sm font-bold text-foreground">
              {data.zones.active} / {data.zones.total}
            </span>
          </div>
        </div>

        {/* Local Host Node Status Pill */}
        <div className="space-y-2 pt-1 text-xs">
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              <span className="font-semibold text-foreground">Hôte Système ({detection?.os.distro || "Linux"})</span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              {detection?.ports.port53Listening ? "Port 53 Écoute OK" : "Port 53 Fermé"}
            </span>
          </div>

          {detection?.config.confDir && (
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-background/40 px-2.5 py-1.5 text-[11px] text-muted-foreground font-mono">
              <span>Répertoire BIND</span>
              <span className="text-foreground">{detection.config.confDir}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
