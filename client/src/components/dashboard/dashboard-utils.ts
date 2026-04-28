import type { DashboardData } from "@/lib/api";

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function exportDashboardReport(data: DashboardData) {
  const lines = [
    `BIND9 Admin Report - ${new Date().toLocaleString()}`,
    "==========================================",
    "",
    `Zones: ${data.zones.total} total, ${data.zones.active} active`,
    `Records: ${data.records}`,
    `BIND9: ${data.bind9.running ? "Running" : "Not detected"}${data.bind9.running ? ` (v${data.bind9.version}, PID ${data.bind9.pid}, ${data.bind9.threads} threads)` : ""}`,
    `Uptime: ${data.uptime}`,
    `CPU: ${data.system.cpu.toFixed(1)}%`,
    `Memory: ${formatBytes(data.system.memory.used)} / ${formatBytes(data.system.memory.total)}`,
    "",
    "Record Distribution:",
    ...data.typeDistribution.map((entry) => `  ${entry.name}: ${entry.value}`),
    "",
    "Recent Logs:",
    ...data.recentLogs.map(
      (log) => `  [${new Date(log.timestamp).toLocaleString()}] ${log.level} ${log.source}: ${log.message}`,
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bind9-report-${new Date().toISOString().slice(0, 10)}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}
