import { useState, lazy, Suspense } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Download,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  WifiOff,
} from "lucide-react";

import { BindStatusCard } from "@/components/dashboard/BindStatusCard";
import { DashboardMetricsGrid } from "@/components/dashboard/DashboardMetricsGrid";
import { RecentLogsCard } from "@/components/dashboard/RecentLogsCard";
import { exportDashboardReport } from "@/components/dashboard/dashboard-utils";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader, PageState } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboard, executeRndc, getHostDetection } from "@/lib/api";
import { AlertCircle, Wrench } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BindHostWizardDialog, DnsQueryTesterCard } from "@/components/host";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";

const RecordDistributionCard = lazy(async () => {
  const module = await import("@/components/dashboard/RecordDistributionCard");
  return { default: module.RecordDistributionCard };
});

function RecordDistributionFallback() {
  return (
    <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle className="tracking-[-0.04em]">Record distribution</CardTitle>
          <p className="text-sm text-muted-foreground">
            Loading zone composition and record mix.
          </p>
        </div>
        <Badge variant="outline" className="border-border/70 bg-background/70">
          Loading
        </Badge>
      </CardHeader>
      <CardContent className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
        Loading chart data...
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t, language } = useI18n();
  const { toast } = useToast();
  const [reloading, setReloading] = useState(false);
  const [flushing, setFlushing] = useState(false);

  const {
    data,
    error,
    isPending,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    refetchInterval: 10_000,
  });

  const { data: hostDetection, refetch: refetchHost } = useQuery({
    queryKey: ["host-detection"],
    queryFn: getHostDetection,
    refetchInterval: 10_000,
  });

  const handleRndcReload = async () => {
    setReloading(true);
    try {
      const res = await executeRndc("reload");
      toast({
        title: "BIND9 recharge",
        description: res.output || "Configuration rechargee avec succes via rndc reload.",
      });
      refetch();
    } catch (err: any) {
      toast({
        title: "Erreur de rechargement",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setReloading(false);
    }
  };

  const handleRndcFlush = async () => {
    setFlushing(true);
    try {
      const res = await executeRndc("flush");
      toast({
        title: "Cache DNS purge",
        description: res.output || "Le cache des requetes a ete vide via rndc flush.",
      });
    } catch (err: any) {
      toast({
        title: "Erreur purge cache",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setFlushing(false);
    }
  };

  if (isPending) {
    return (
      <DashboardLayout>
        <PageState
          loading
          title="Loading dashboard"
          description="Fetching DNS metrics and recent activity."
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <PageState
          icon={WifiOff}
          tone="danger"
          title="Dashboard unavailable"
          description={error instanceof Error ? error.message : "Unable to load dashboard data."}
          action={<Button onClick={() => refetch()}>Retry</Button>}
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={t.dashboard.title}
          description={t.dashboard.subtitle}
          icon={Server}
          actions={
            <>
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-xl border-border/70 bg-background/70 shadow-none hover:bg-muted"
                onClick={() => exportDashboardReport(data)}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">{t.common.exportReport}</span>
              </Button>
              <Button
                className="h-10 gap-2 rounded-xl bg-primary text-primary-foreground font-medium shadow-sm hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={["h-4 w-4", isFetching ? "animate-spin" : ""].join(" ")} />
                <span>{isFetching ? t.common.refreshing : t.common.refresh}</span>
              </Button>
            </>
          }
        />

        {/* Host BIND9 Needs Installation or Initialization Banner */}
        {hostDetection && (hostDetection.needsInstallation || hostDetection.needsInitialization) && (
          <Alert className="border-indigo-500/40 bg-indigo-500/10 text-foreground flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-2xl shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <AlertTitle className="text-sm font-bold text-foreground">
                  {hostDetection.needsInstallation
                    ? "Configuration Serveur : BIND9 n'est pas encore installé sur ce système"
                    : "Configuration Requise : L'arborescence ou la configuration BIND9 doit être initialisée"}
                </AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground mt-0.5">
                  {hostDetection.needsInstallation
                    ? `Le binaire named est absent sur ${hostDetection.os.distro}. Utilisez l'assistant intégré pour installer les paquets automatiquement.`
                    : "Les fichiers named.conf.options ou named.conf.local sont manquants. L'assistant va configurer les profils DNS (Autoritaire, Cacheur ou Hybride)."}
                </AlertDescription>
              </div>
            </div>
            <BindHostWizardDialog
              detection={hostDetection}
              onRefresh={() => {
                refetchHost();
                refetch();
              }}
              triggerButton={
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs gap-1.5 shrink-0 font-medium shadow-sm transition-all">
                  <Wrench className="h-4 w-4" />
                  Lancer l'Assistant BIND9
                </Button>
              }
            />
          </Alert>
        )}

        <DashboardMetricsGrid data={data} />

        {/* Quick DNS Actions Panel */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/zones">
            <div className="group cursor-pointer rounded-2xl border border-border/70 bg-card/80 p-4 transition-all duration-200 hover:border-primary/50 hover:bg-muted/40 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
                  <Plus className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">Gestion des Zones</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Creer ou editer vos domaines DNS</p>
            </div>
          </Link>
          <div
            onClick={handleRndcReload}
            className="group cursor-pointer rounded-2xl border border-border/70 bg-card/80 p-4 transition-all duration-200 hover:border-emerald-500/50 hover:bg-muted/40 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <RefreshCw className={`h-5 w-5 ${reloading ? "animate-spin" : ""}`} />
              </div>
              <span className="text-[11px] font-mono uppercase text-emerald-400/80">rndc reload</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">Recharger BIND9</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Appliquer les zones sans coupure</p>
          </div>
          <div
            onClick={handleRndcFlush}
            className="group cursor-pointer rounded-2xl border border-border/70 bg-card/80 p-4 transition-all duration-200 hover:border-sky-500/50 hover:bg-muted/40 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
                <RotateCcw className={`h-5 w-5 ${flushing ? "animate-spin" : ""}`} />
              </div>
              <span className="text-[11px] font-mono uppercase text-sky-400/80">rndc flush</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">Purger le Cache</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Vider le cache des requetes recursives</p>
          </div>
          <Link href="/firewall-rpz">
            <div className="group cursor-pointer rounded-2xl border border-border/70 bg-card/80 p-4 transition-all duration-200 hover:border-amber-500/50 hover:bg-muted/40 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">Pare-feu DNS RPZ</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Bloquer les malwares et menaces</p>
            </div>
          </Link>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <Suspense fallback={<RecordDistributionFallback />}>
            <RecordDistributionCard data={data} />
          </Suspense>
          <BindStatusCard data={data} detection={hostDetection} onRefresh={refetchHost} />
        </div>

        <DnsQueryTesterCard />

        <RecentLogsCard logs={data.recentLogs} />
      </div>
    </DashboardLayout>
  );
}

