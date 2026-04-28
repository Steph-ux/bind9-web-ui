import { Activity, CheckCircle2, Cpu, Globe, Server } from "lucide-react";

import { MetricCard } from "@/components/layout";
import type { DashboardData } from "@/lib/api";

import { formatBytes } from "./dashboard-utils";

export function DashboardMetricsGrid({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Zones"
        value={data.zones.total}
        icon={Globe}
        tone="success"
        description={
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {data.zones.active} active
          </span>
        }
      />
      <MetricCard
        label="Records"
        value={data.records}
        icon={Activity}
        description="DNS records across all managed zones."
      />
      <MetricCard
        label="Uptime"
        value={data.uptime}
        icon={Server}
        tone={data.bind9.running ? "success" : "warning"}
        description={data.bind9.running ? "Service responding normally." : "Service not detected."}
      />
      <MetricCard
        label="CPU Usage"
        value={`${data.system.cpu.toFixed(1)}%`}
        icon={Cpu}
        tone="warning"
        description={`Memory ${formatBytes(data.system.memory.used)} / ${formatBytes(data.system.memory.total)}`}
      />
    </div>
  );
}
