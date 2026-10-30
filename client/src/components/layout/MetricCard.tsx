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
  default: "bg-primary/10 text-primary ring-1 ring-primary/20",
  success: "bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20",
  danger: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
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
    <Card className={cn("border-border/60 bg-card/75 shadow-none transition-colors", className)}>
      <CardContent className="p-3 sm:p-3.5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="space-y-0.5 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {label}
            </p>
            <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-foreground">{value}</div>
            {description ? (
              <div className="text-[11px] text-muted-foreground truncate leading-normal">{description}</div>
            ) : null}
          </div>
          {Icon ? (
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                toneStyles[tone],
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
