import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/api";

export function RecordDistributionCard({ data }: { data: DashboardData }) {
  const chartData = data.typeDistribution.length
    ? data.typeDistribution
    : [{ name: "No data", value: 0 }];

  return (
    <Card className="border-border/70 bg-card/85 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Record distribution</CardTitle>
        <Badge variant="secondary">{chartData.length} types</Badge>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
              <Bar
                dataKey="value"
                fill="hsl(var(--primary))"
                radius={[0, 8, 8, 0]}
                barSize={26}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
