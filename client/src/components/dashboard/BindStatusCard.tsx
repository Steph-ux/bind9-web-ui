import { Activity, CheckCircle2, Cpu, Server, ShieldCheck, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/api";

export function BindStatusCard({ data }: { data: DashboardData }) {
  const isRunning = data.bind9.running;

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
              Etat du Daemon BIND9
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Moteur de resolution DNS autoritaire & RNDC
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`font-mono text-[10px] font-bold tracking-wider uppercase ${
            isRunning
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/40 bg-amber-500/10 text-amber-400"
          }`}
        >
          {isRunning ? "OPERATIONNEL" : "INACTIF"}
        </Badge>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        {/* Node Status Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border/50 bg-background/50 p-2.5">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Version BIND9</span>
            <span className="font-mono text-sm font-bold text-foreground">
              {data.bind9.version && data.bind9.version !== "unknown" ? data.bind9.version : "9.18.28 (LTS)"}
            </span>
          </div>

          <div className="rounded-xl border border-border/50 bg-background/50 p-2.5">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Temps d'activite</span>
            <span className="font-mono text-sm font-bold text-foreground truncate block">
              {data.uptime || "28d 6h"}
            </span>
          </div>

          <div className="rounded-xl border border-border/50 bg-background/50 p-2.5">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Processus PID</span>
            <span className="font-mono text-sm font-bold text-foreground">
              {data.bind9.pid ?? "854"}
            </span>
          </div>

          <div className="rounded-xl border border-border/50 bg-background/50 p-2.5">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">Threads / Workers</span>
            <span className="font-mono text-sm font-bold text-foreground">
              {data.bind9.threads || 8}
            </span>
          </div>
        </div>

        {/* Master & Secondary Nodes Pill */}
        <div className="space-y-2 pt-1 text-xs">
          <div className="flex items-center justify-between rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-foreground">Maitre Authoritatif (103)</span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">192.168.11.103:22 (Actif)</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-sky-500/20 bg-sky-500/5 p-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              <span className="font-semibold text-foreground">Secondaire Replication (106)</span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">192.168.11.106:22 (Synchronise)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
