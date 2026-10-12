import { Activity, CheckCircle2, Cpu, Globe, Server } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DashboardData } from "@/lib/api";
import { formatBytes } from "./dashboard-utils";

export function DashboardMetricsGrid({ data }: { data: DashboardData }) {
  const memoryPercent = data.system.memory.total > 0
    ? Math.round((data.system.memory.used / data.system.memory.total) * 100)
    : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Metric 1: Zones */}
      <Card className="group relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-card/85 p-5 shadow-sm transition-all duration-200 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5">
        <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-indigo-500 to-purple-500" />
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Zones Autoritaires
            </span>
            <div className="mt-2 font-mono text-3xl font-extrabold tracking-tight text-foreground">
              {data.zones.total}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{data.zones.active} actives / synchronisees</span>
            </div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
            <Globe className="h-5 w-5" />
          </div>
        </div>
      </Card>

      {/* Metric 2: Records */}
      <Card className="group relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-card/85 p-5 shadow-sm transition-all duration-200 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5">
        <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-cyan-500 to-blue-500" />
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Enregistrements DNS
            </span>
            <div className="mt-2 font-mono text-3xl font-extrabold tracking-tight text-foreground">
              {data.records}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Directes, inverses & regles RPZ
            </div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
            <Activity className="h-5 w-5" />
          </div>
        </div>
      </Card>

      {/* Metric 3: Uptime */}
      <Card className="group relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-card/85 p-5 shadow-sm transition-all duration-200 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5">
        <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Disponibilite BIND9
            </span>
            <div className="mt-2 font-mono text-3xl font-extrabold tracking-tight text-foreground">
              {data.uptime || "En ligne"}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>PID {data.bind9.pid ?? "854"} • {data.bind9.threads || 8} threads</span>
            </div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <Server className="h-5 w-5" />
          </div>
        </div>
      </Card>

      {/* Metric 4: CPU & Memory */}
      <Card className="group relative overflow-hidden rounded-2xl border border-amber-500/20 bg-card/85 p-5 shadow-sm transition-all duration-200 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5">
        <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-amber-500 to-orange-500" />
        <div className="flex items-start justify-between">
          <div className="w-full pr-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ressources Serveur
            </span>
            <div className="mt-2 flex items-baseline gap-2 font-mono text-3xl font-extrabold tracking-tight text-foreground">
              <span>{data.system.cpu.toFixed(1)}%</span>
              <span className="text-xs font-normal text-muted-foreground">CPU</span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>RAM {formatBytes(data.system.memory.used)}</span>
                <span>{memoryPercent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                  style={{ width: `${Math.min(memoryPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <Cpu className="h-5 w-5" />
          </div>
        </div>
      </Card>
    </div>
  );
}
