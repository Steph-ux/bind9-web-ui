import type { LucideIcon } from "lucide-react";
import { CircleAlert, Inbox } from "lucide-react";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type StateTone = "default" | "danger";

interface PageStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  loading?: boolean;
  tone?: StateTone;
  className?: string;
}

export function PageState({
  title,
  description,
  icon,
  action,
  loading = false,
  tone = "default",
  className,
}: PageStateProps) {
  const Icon = loading ? null : icon ?? (tone === "danger" ? CircleAlert : Inbox);

  return (
    <Empty
      className={cn(
        "linear-panel bg-card/70 shadow-none",
        tone === "danger" ? "border-destructive/25" : "border-border/60",
        className,
      )}
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className={cn(
            loading
              ? "bg-primary/12 text-primary ring-1 ring-primary/20"
              : tone === "danger"
                ? "bg-destructive/12 text-destructive ring-1 ring-destructive/20"
                : "bg-primary/12 text-primary ring-1 ring-primary/20",
          )}
        >
          {loading ? <Spinner className="size-5" /> : Icon ? <Icon className="size-5" /> : null}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

