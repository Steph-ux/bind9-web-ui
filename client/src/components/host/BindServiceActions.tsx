import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { controlHostService, type HostBind9Detection } from "@/lib/api";

interface BindServiceActionsProps {
  detection: HostBind9Detection | null;
  onRefresh: () => void;
  compact?: boolean;
}

export function BindServiceActions({
  detection,
  onRefresh,
  compact = false,
}: BindServiceActionsProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const { toast } = useToast();

  const serviceStatus = detection?.bind9.serviceStatus || "unknown";
  const isRunning = serviceStatus === "active";

  const handleAction = async (action: "start" | "stop" | "restart" | "reload") => {
    setLoadingAction(action);
    try {
      const res = await controlHostService(action);
      toast({
        title: `Service BIND9: ${action.toUpperCase()}`,
        description: res.message,
        variant: res.success ? "default" : "destructive",
      });
      onRefresh();
    } catch (err: any) {
      toast({
        title: "Échec de l'action de service",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const getStatusBadge = () => {
    switch (serviceStatus) {
      case "active":
        return (
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-mono text-[10px] uppercase">
            Service Actif
          </Badge>
        );
      case "inactive":
        return (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400 font-mono text-[10px] uppercase">
            Service Inactif
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-400 font-mono text-[10px] uppercase">
            Service Échoué
          </Badge>
        );
      case "not-installed":
        return (
          <Badge variant="outline" className="border-zinc-500/40 bg-zinc-500/10 text-zinc-400 font-mono text-[10px] uppercase">
            Non Installé
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[10px] uppercase">
            Inconnu
          </Badge>
        );
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {getStatusBadge()}
        {isRunning ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => handleAction("reload")}
              className="h-7 px-2 text-[11px] gap-1 border-border/60 hover:bg-muted"
              title="Recharger la configuration (rndc / reload)"
            >
              {loadingAction === "reload" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3 text-indigo-400" />
              )}
              Recharger
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => handleAction("restart")}
              className="h-7 px-2 text-[11px] gap-1 border-border/60 hover:bg-muted"
              title="Redémarrer le service systemd"
            >
              {loadingAction === "restart" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 text-amber-400" />
              )}
              Redémarrer
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="default"
            disabled={loadingAction !== null || !detection?.bind9.isInstalled}
            onClick={() => handleAction("start")}
            className="h-7 px-2.5 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loadingAction === "start" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            Démarrer BIND9
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-border/60 bg-card/70 shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
          isRunning ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"
        }`}>
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground">Gestionnaire de Service BIND9</span>
            {getStatusBadge()}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Unité systemd : <code className="font-mono">{detection?.bind9.serviceName || "bind9"}</code>
            {detection?.bind9.mainPid && ` (PID ${detection.bind9.mainPid})`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isRunning ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => handleAction("reload")}
              className="h-8 text-xs gap-1.5 border-border/70"
            >
              {loadingAction === "reload" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 text-indigo-400" />
              )}
              Recharger
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => handleAction("restart")}
              className="h-8 text-xs gap-1.5 border-border/70"
            >
              {loadingAction === "restart" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
              )}
              Redémarrer
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => handleAction("stop")}
              className="h-8 text-xs gap-1.5 border-rose-500/30 hover:bg-rose-500/10 text-rose-400"
            >
              {loadingAction === "stop" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              Arrêter
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={loadingAction !== null || !detection?.bind9.isInstalled}
            onClick={() => handleAction("start")}
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loadingAction === "start" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Démarrer le Service
          </Button>
        )}
      </div>
    </div>
  );
}
