import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/api";

type DistributionItem = {
  name: string;
  value: number;
};

function normalizeDistribution(items: DashboardData["typeDistribution"]): DistributionItem[] {
  if (!items.length) {
    return [{ name: "No data", value: 0 }];
  }

  return [...items]
    .map((item) => ({
      name: item.name || "Unknown",
      value: Number.isFinite(item.value) ? item.value : 0,
    }))
    .sort((left, right) => right.value - left.value);
}

export function RecordDistributionCard({ data }: { data: DashboardData }) {
  const chartData = normalizeDistribution(data.typeDistribution);
  const maxValue = Math.max(...chartData.map((item) => item.value), 1);

  return (
    <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="tracking-[-0.04em]">Record distribution</CardTitle>
          <p className="text-sm text-muted-foreground">
            Relative mix of DNS record types across managed zones.
          </p>
        </div>
        <Badge variant="outline" className="border-border/70 bg-background/70">
          {chartData.length} types
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {chartData.map((item) => {
            const width = item.value === 0 ? 2 : Math.max((item.value / maxValue) * 100, 6);

            return (
              <div
                key={item.name}
                className="space-y-2 rounded-2xl border border-border/60 bg-background/45 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0 font-medium text-foreground">
                    <span className="block truncate">{item.name}</span>
                  </div>
                  <div className="shrink-0 tabular-nums text-muted-foreground">{item.value}</div>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--primary)/0.95),hsl(var(--accent)/0.82))] transition-[width] duration-300"
                    style={{ width: `${width}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
