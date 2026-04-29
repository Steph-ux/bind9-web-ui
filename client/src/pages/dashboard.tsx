import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, Server, WifiOff } from "lucide-react";
import { lazy, Suspense } from "react";

import { BindStatusCard } from "@/components/dashboard/BindStatusCard";
import { DashboardMetricsGrid } from "@/components/dashboard/DashboardMetricsGrid";
import { RecentLogsCard } from "@/components/dashboard/RecentLogsCard";
import { exportDashboardReport } from "@/components/dashboard/dashboard-utils";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader, PageState } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboard } from "@/lib/api";

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
          title="System Overview"
          description="Real-time DNS metrics, service health, and recent server activity across the current control plane."
          icon={Server}
          badge={
            <Badge variant="outline" className="gap-2 border-border/70 bg-background/70">
              <span
                className={[
                  "h-2 w-2 rounded-full",
                  data.bind9.running ? "bg-emerald-500" : "bg-amber-500",
                ].join(" ")}
              />
              {data.bind9.running ? "BIND9 online" : "BIND9 not detected"}
            </Badge>
          }
          actions={
            <>
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-xl border-border/70 bg-background/70 shadow-none"
                onClick={() => exportDashboardReport(data)}
              >
                <Download className="h-4 w-4" />
                Export report
              </Button>
              <Button
                className="h-10 gap-2 rounded-xl bg-[linear-gradient(180deg,hsl(var(--primary)/0.95),hsl(var(--accent)/0.84))] text-primary-foreground shadow-[0_16px_40px_hsl(var(--primary)/0.22)]"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={["h-4 w-4", isFetching ? "animate-spin" : ""].join(" ")} />
                {isFetching ? "Refreshing" : "Refresh"}
              </Button>
            </>
          }
        />

        <DashboardMetricsGrid data={data} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <Suspense fallback={<RecordDistributionFallback />}>
            <RecordDistributionCard data={data} />
          </Suspense>
          <BindStatusCard data={data} />
        </div>

        <RecentLogsCard logs={data.recentLogs} />
      </div>
    </DashboardLayout>
  );
}

