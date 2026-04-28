import { AlertCircle, AlertTriangle, Bell, CheckCircle2, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { LogData } from "@/lib/api";

function levelIcon(level: string) {
  switch (level) {
    case "ERROR":
      return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />;
    case "WARN":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
    case "INFO":
      return <Info className="h-4 w-4 shrink-0 text-blue-500" />;
    default:
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  }
}

export function LayoutNotificationsSheet({
  open,
  onOpenChange,
  notifications,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: LogData[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-96 max-w-full flex-col p-0">
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center text-muted-foreground">
              <Bell className="h-10 w-10 opacity-40" />
              <div>
                <p className="font-medium text-foreground">No notifications yet</p>
                <p className="text-sm text-muted-foreground">
                  Recent log activity will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((log) => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-4">
                  {levelIcon(log.level)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{log.message}</p>
                      <Badge variant="outline" className="shrink-0">
                        {log.level}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{log.source}</span>
                      <Separator orientation="vertical" className="h-3" />
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
