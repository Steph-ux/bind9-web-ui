import { Activity, CheckCircle2, Cpu, Globe, Server } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DashboardData } from "@/lib/api";
import { formatBytes } from "./dashboard-utils";

export function DashboardMetricsGrid({ data }: { data: DashboardData }) {
  const memoryPercent = data.system.memory.total > 0
    ? Math.round((data.system.memory.used / data.system.memory.total) * 100)
    : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Metric 1: Zones */}
      <Card className="group relative overflow-hidden rounded-xl border border-indigo-500/20 bg-card/85 p-3 sm:p-3.5 shadow-none">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate block">
              Zones Autoritaires
            </span>
            <div className="mt-1 font-mono text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {data.zones.total}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{data.zones.active} actives</span>
            </div>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
            <Globe className="h-4 w-4" />
          </div>
        </div>
      </Card>

      {/* Metric 2: Records */}
      <Card className="group relative overflow-hidden rounded-xl border border-cyan-500/20 bg-card/85 p-3 sm:p-3.5 shadow-none">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate block">
              Enregistrements DNS
            </span>
            <div className="mt-1 font-mono text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {data.records}
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground truncate">
              Directes, inverses & RPZ
            </div>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
            <Activity className="h-4 w-4" />
          </div>
        </div>
      </Card>

      {/* Metric 3: Uptime */}
      <Card className="group relative overflow-hidden rounded-xl border border-emerald-500/20 bg-card/85 p-3 sm:p-3.5 shadow-none">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate block">
              Disponibilité BIND9
            </span>
            <div className="mt-1 font-mono text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {data.uptime || "En ligne"}
            </div>
            {data.bind9.running ? (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">PID {data.bind9.pid || "Actif"} • {data.bind9.threads || 1} thread(s)</span>
              </div>
            ) : (
              <div className="mt-1.5 text-[11px] text-muted-foreground truncate">
                Service inactif
              </div>
            )}
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <Server className="h-4 w-4" />
          </div>
        </div>
      </Card>

      {/* Metric 4: CPU & Memory */}
      <Card className="group relative overflow-hidden rounded-xl border border-amber-500/20 bg-card/85 p-3 sm:p-3.5 shadow-none">
        <div className="flex items-start justify-between">
          <div className="w-full pr-2 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate block">
              Ressources Serveur
            </span>
            <div className="mt-1 flex items-baseline gap-1.5 font-mono text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              <span>{data.system.cpu.toFixed(1)}%</span>
              <span className="text-[10px] font-normal text-muted-foreground">CPU</span>
            </div>
            <div className="mt-1.5 space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>RAM {formatBytes(data.system.memory.used)}</span>
                <span>{memoryPercent}%</span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                  style={{ width: `${Math.min(memoryPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <Cpu className="h-4 w-4" />
          </div>
        </div>
      </Card>
    </div>
  );
}
