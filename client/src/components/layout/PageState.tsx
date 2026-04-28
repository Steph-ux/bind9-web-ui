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
        "border bg-card/70 shadow-sm",
        tone === "danger" ? "border-destructive/30" : "border-border/70",
        className,
      )}
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className={cn(
            loading
              ? "bg-primary/10 text-primary"
              : tone === "danger"
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary",
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

