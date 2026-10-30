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
  hideStatusBadge?: boolean;
}

export function BindServiceActions({
  detection,
  onRefresh,
  compact = false,
  hideStatusBadge = false,
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
          <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-normal">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Service Actif
          </Badge>
        );
      case "inactive":
        return (
          <Badge variant="outline" className="gap-1.5 border-border/70 bg-muted/40 text-muted-foreground text-xs font-normal">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Service Inactif
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="gap-1.5 border-destructive/30 bg-destructive/10 text-destructive text-xs font-normal">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
            Service Échoué
          </Badge>
        );
      case "not-installed":
        return (
          <Badge variant="outline" className="gap-1.5 border-border/70 bg-muted/30 text-muted-foreground text-xs font-normal">
            Non Installé
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-border text-muted-foreground text-xs font-normal">
            Inconnu
          </Badge>
        );
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {!hideStatusBadge && getStatusBadge()}
        {isRunning ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => handleAction("reload")}
              className="h-8 px-2.5 text-xs gap-1.5 border-border/70 hover:bg-muted"
              title="Recharger la configuration (rndc reload)"
            >
              {loadingAction === "reload" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3 text-primary" />
              )}
              Recharger
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => handleAction("restart")}
              className="h-8 px-2.5 text-xs gap-1.5 border-border/70 hover:bg-muted"
              title="Redémarrer le service systemd"
            >
              {loadingAction === "restart" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 text-amber-500" />
              )}
              Redémarrer
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={loadingAction !== null || !detection?.bind9.isInstalled}
            onClick={() => handleAction("start")}
            className="h-8 px-3 text-xs gap-1.5 font-medium border-border/70 hover:bg-muted"
          >
            {loadingAction === "start" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 text-emerald-500" />
            )}
            Démarrer BIND9
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-border/60 bg-card/70 shadow-none">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Activity className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Gestionnaire de Service BIND9</span>
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
              className="h-8 text-xs gap-1.5 border-border/70 hover:bg-muted"
            >
              {loadingAction === "reload" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 text-primary" />
              )}
              Recharger
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => handleAction("restart")}
              className="h-8 text-xs gap-1.5 border-border/70 hover:bg-muted"
            >
              {loadingAction === "restart" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
              )}
              Redémarrer
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => handleAction("stop")}
              className="h-8 text-xs gap-1.5 border-destructive/30 hover:bg-destructive/10 text-destructive"
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
            variant="outline"
            disabled={loadingAction !== null || !detection?.bind9.isInstalled}
            onClick={() => handleAction("start")}
            className="h-8 text-xs gap-1.5 font-medium border-border/70 hover:bg-muted"
          >
            {loadingAction === "start" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 text-emerald-500" />
            )}
            Démarrer le Service
          </Button>
        )}
      </div>
    </div>
  );
}
