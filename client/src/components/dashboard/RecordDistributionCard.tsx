import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/api";

type DistributionItem = {
  name: string;
  value: number;
};

const TYPE_COLORS: Record<string, { bg: string; bar: string; text: string }> = {
  A: { bg: "bg-blue-500/15 border-blue-500/30", bar: "bg-blue-500", text: "text-blue-400" },
  AAAA: { bg: "bg-indigo-500/15 border-indigo-500/30", bar: "bg-indigo-500", text: "text-indigo-400" },
  CNAME: { bg: "bg-amber-500/15 border-amber-500/30", bar: "bg-amber-500", text: "text-amber-400" },
  MX: { bg: "bg-emerald-500/15 border-emerald-500/30", bar: "bg-emerald-500", text: "text-emerald-400" },
  TXT: { bg: "bg-purple-500/15 border-purple-500/30", bar: "bg-purple-500", text: "text-purple-400" },
  NS: { bg: "bg-rose-500/15 border-rose-500/30", bar: "bg-rose-500", text: "text-rose-400" },
  PTR: { bg: "bg-fuchsia-500/15 border-fuchsia-500/30", bar: "bg-fuchsia-500", text: "text-fuchsia-400" },
  SRV: { bg: "bg-cyan-500/15 border-cyan-500/30", bar: "bg-cyan-500", text: "text-cyan-400" },
  SOA: { bg: "bg-zinc-500/15 border-zinc-500/30", bar: "bg-zinc-500", text: "text-zinc-400" },
};

function getColor(type: string) {
  return TYPE_COLORS[type.toUpperCase()] || {
    bg: "bg-slate-500/15 border-slate-500/30",
    bar: "bg-slate-500",
    text: "text-slate-400",
  };
}

function normalizeDistribution(items: DashboardData["typeDistribution"]): DistributionItem[] {
  if (!items || !items.length) {
    return [{ name: "Aucune donnee", value: 0 }];
  }

  return [...items]
    .map((item) => ({
      name: item.name || "Inconnu",
      value: Number.isFinite(item.value) ? item.value : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

export function RecordDistributionCard({ data }: { data: DashboardData }) {
  const chartData = normalizeDistribution(data.typeDistribution);
  const totalRecords = chartData.reduce((acc, item) => acc + item.value, 0) || 1;

  return (
    <Card className="rounded-2xl border border-border/70 bg-card/85 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50">
        <div>
          <CardTitle className="text-base font-bold tracking-tight text-foreground">
            Repartition des Enregistrements DNS
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ventilation typologique a travers l'ensemble des catalogues autoritaires
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          {chartData.length} types actifs
        </Badge>
      </CardHeader>

      <CardContent className="pt-4 space-y-5">
        {/* Segmented multi-color progress bar */}
        <div className="space-y-1.5">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/60 p-0.5">
            {chartData.map((item) => {
              const pct = (item.value / totalRecords) * 100;
              if (pct < 1) return null;
              const color = getColor(item.name);
              return (
                <div
                  key={item.name}
                  className={`h-full first:rounded-l-full last:rounded-r-full ${color.bar} transition-all duration-300`}
                  style={{ width: `${pct}%` }}
                  title={`${item.name}: ${item.value} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Volume total analyse</span>
            <span className="font-mono font-semibold text-foreground">{totalRecords} enregistrements</span>
          </div>
        </div>

        {/* Detailed items list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {chartData.map((item) => {
            const pct = ((item.value / totalRecords) * 100).toFixed(1);
            const color = getColor(item.name);

            return (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-xl border border-border/50 bg-background/50 p-2.5 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-2">
                  <span className={`flex h-6 w-10 items-center justify-center rounded-lg border font-mono text-[11px] font-bold uppercase ${color.bg} ${color.text}`}>
                    {item.name}
                  </span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {item.value}
                  </span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
