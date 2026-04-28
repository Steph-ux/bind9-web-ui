import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, Server, WifiOff } from "lucide-react";

import { BindStatusCard } from "@/components/dashboard/BindStatusCard";
import { DashboardMetricsGrid } from "@/components/dashboard/DashboardMetricsGrid";
import { RecentLogsCard } from "@/components/dashboard/RecentLogsCard";
import { RecordDistributionCard } from "@/components/dashboard/RecordDistributionCard";
import { exportDashboardReport } from "@/components/dashboard/dashboard-utils";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader, PageState } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDashboard } from "@/lib/api";

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
          description="Real-time DNS metrics, service health and recent server activity."
          icon={Server}
          badge={
            <Badge variant="outline" className="gap-2">
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
                className="gap-2"
                onClick={() => exportDashboardReport(data)}
              >
                <Download className="h-4 w-4" />
                Export report
              </Button>
              <Button className="gap-2" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={["h-4 w-4", isFetching ? "animate-spin" : ""].join(" ")} />
                {isFetching ? "Refreshing" : "Refresh"}
              </Button>
            </>
          }
        />

        <DashboardMetricsGrid data={data} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <RecordDistributionCard data={data} />
          <BindStatusCard data={data} />
        </div>

        <RecentLogsCard logs={data.recentLogs} />
      </div>
    </DashboardLayout>
  );
}

