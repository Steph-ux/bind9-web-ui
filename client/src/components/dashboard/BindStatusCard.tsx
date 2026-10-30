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
  const serviceName = detection?.bind9.serviceName || "named";

  return (
    <Card className="rounded-2xl border border-border/70 bg-card/85 shadow-none">
      <CardHeader className="space-y-3 pb-3 border-b border-border/50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Server className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground truncate">
                Serveur BIND9 Local
              </CardTitle>
              <p className="text-xs text-muted-foreground truncate">
                Unité systemd : <code className="font-mono font-medium text-foreground">{serviceName}</code>
              </p>
            </div>
          </div>

          <Badge variant="outline" className="shrink-0 gap-1.5 text-xs font-normal border-border/70 text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-emerald-500" : "bg-amber-500"}`} />
            {isRunning ? "Service Actif" : "Service Inactif"}
          </Badge>
        </div>

        {detection && onRefresh && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
            <span>Contrôle du service</span>
            <BindServiceActions detection={detection} onRefresh={onRefresh} compact hideStatusBadge />
          </div>
        )}
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
              <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-emerald-500" : "bg-amber-500"}`} />
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
