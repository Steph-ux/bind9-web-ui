import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricTone = "default" | "success" | "warning" | "danger";

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  tone?: MetricTone;
  className?: string;
}

const toneStyles: Record<MetricTone, string> = {
  default: "bg-primary/12 text-primary ring-1 ring-primary/20",
  success: "bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-500/20",
  warning: "bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/20",
  danger: "bg-destructive/12 text-destructive ring-1 ring-destructive/20",
};

export function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "default",
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("linear-panel overflow-hidden border-border/60 bg-card/78 shadow-none", className)}>
      <CardContent className="relative p-5">
        <div className="linear-hairline absolute inset-x-0 top-0" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
              {label}
            </p>
            <div className="text-3xl font-semibold tracking-[-0.06em]">{value}</div>
            {description ? (
              <div className="text-sm leading-6 text-muted-foreground">{description}</div>
            ) : null}
          </div>
          {Icon ? (
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                toneStyles[tone],
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

