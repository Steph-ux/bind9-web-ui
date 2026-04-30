import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Search, Terminal, Trash2 } from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader, PageState } from "@/components/layout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { clearLogs, getLogs, type LogData, type LogScope } from "@/lib/api";

type StreamMode = "connecting" | "live" | "polling";

type LogFilterState = {
  level: string | null;
  search: string;
};

function matchesFilters(log: LogData, filters: LogFilterState) {
  if (filters.level && log.level !== filters.level) {
    return false;
  }

  const query = filters.search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = `${log.timestamp} ${log.level} ${log.source} ${log.message}`.toLowerCase();
  return haystack.includes(query);
}

function mergeLogs(existing: LogData[], incoming: LogData[], filters: LogFilterState) {
  const allowed = incoming.filter((entry) => matchesFilters(entry, filters));
  if (allowed.length === 0) {
    return existing;
  }

  const byId = new Map<string, LogData>();
  for (const entry of [...allowed, ...existing]) {
    if (!byId.has(entry.id)) {
      byId.set(entry.id, entry);
    }
  }

  return Array.from(byId.values()).slice(0, 200);
}

function tagAppStreamLog(log: LogData): LogData {
  return { ...log, origin: "app", transport: "database" };
}

function describeStreamMode(mode: StreamMode, scope: LogScope) {
  if (scope === "bind") {
    return {
      badge: "Exact BIND polling",
      footer: "Reading exact remote BIND files and service journals. Results refresh every 10 seconds.",
    };
  }

  if (scope === "combined") {
    switch (mode) {
      case "live":
        return {
          badge: "Combined live",
          footer: "Application events stream live. Exact BIND entries refresh when the page reloads or polls.",
        };
      case "polling":
        return {
          badge: "Combined polling",
          footer: "Live application streaming is unavailable. App and BIND entries refresh every 10 seconds.",
        };
      default:
        return {
          badge: "Connecting",
          footer: "Connecting to the application log stream while keeping exact BIND snapshots available.",
        };
    }
  }

  switch (mode) {
    case "live":
      return {
        badge: "Live stream",
        footer: "Connected - tailing logs in real time.",
      };
    case "polling":
      return {
        badge: "Polling fallback",
        footer: "WebSocket unavailable - polling every 10 seconds.",
      };
    default:
      return {
        badge: "Connecting",
        footer: "Connecting to the live log stream.",
      };
  }
}

function describeScope(scope: LogScope) {
  switch (scope) {
    case "bind":
      return {
        title: "Exact BIND view",
        description:
          "This view reads exact remote BIND log tails from readable files and service journals on the active target. It does not mix in application events.",
      };
    case "app":
      return {
        title: "Application view",
        description:
          "This view shows only the web UI application log store. It supports WebSocket live streaming and can be cleared from this page.",
      };
    default:
      return {
        title: "Combined view",
        description:
          "This view merges exact readable BIND logs with application events. Only the application portion streams live; BIND entries refresh on reload or polling.",
      };
  }
}

export default function Logs() {
  const [logs, setLogs] = useState<LogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [logScope, setLogScope] = useState<LogScope>("combined");
  const [streamMode, setStreamMode] = useState<StreamMode>("connecting");
  const [clearing, setClearing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const filtersRef = useRef<LogFilterState>({ level: null, search: "" });
  const { toast } = useToast();

  const fetchLogs = async (options: { silent?: boolean } = {}) => {
    try {
      if (!options.silent) {
        setLoading(true);
      }

      const data = await getLogs({
        level: activeLevel || undefined,
        search: filter || undefined,
        limit: 200,
        scope: logScope,
      });
      setLogs(data);
    } catch (error: any) {
      toast({ title: "Log fetch failed", description: error.message, variant: "destructive" });
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    filtersRef.current = { level: activeLevel, search: filter };
  }, [activeLevel, filter]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchLogs();
    }, 300);
    return () => clearTimeout(timeout);
  }, [filter, activeLevel, logScope]);

  useEffect(() => {
    if (logScope === "bind") {
      setStreamMode("polling");
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);
    let closedByCleanup = false;

    wsRef.current = ws;
    setStreamMode("connecting");

    ws.onopen = () => {
      if (!closedByCleanup) {
        setStreamMode("live");
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const currentFilters = filtersRef.current;

        if (message.type === "log") {
          setLogs((current) => mergeLogs(current, [tagAppStreamLog(message.data)], currentFilters));
          return;
        }

        if (message.type === "history" && Array.isArray(message.data)) {
          setLogs((current) => mergeLogs(current, message.data.map(tagAppStreamLog), currentFilters));
        }
      } catch {
        setStreamMode("polling");
      }
    };

    ws.onerror = () => {
      if (!closedByCleanup) {
        setStreamMode("polling");
      }
    };

    ws.onclose = () => {
      if (!closedByCleanup) {
        setStreamMode("polling");
      }
    };

    return () => {
      closedByCleanup = true;
      ws.close();
      wsRef.current = null;
    };
  }, [logScope]);

  useEffect(() => {
    if (streamMode === "live") {
      return;
    }

    const interval = setInterval(() => {
      void fetchLogs({ silent: true });
    }, 10000);

    return () => clearInterval(interval);
  }, [streamMode, filter, activeLevel, logScope]);

  const handleClear = async () => {
    try {
      setClearing(true);
      await clearLogs();
      await fetchLogs({ silent: true });
      setShowClearConfirm(false);
      toast({ title: "Logs cleared", description: "Stored application log entries have been removed." });
    } catch (error: any) {
      toast({ title: "Clear failed", description: error.message, variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  const handleDownload = () => {
    const content = logs
      .map((entry) => `${entry.timestamp}\t${entry.level}\t${entry.source}\t${entry.message}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bind9-logs-${logScope}-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const levels = [
    { label: "All", value: null },
    { label: "Errors", value: "ERROR" },
    { label: "Warnings", value: "WARN" },
    { label: "Info", value: "INFO" },
    { label: "Debug", value: "DEBUG" },
  ];

  const levelBadge = (level: string) => {
    switch (level) {
      case "ERROR":
        return <Badge variant="destructive">{level}</Badge>;
      case "WARN":
        return <Badge className="bg-amber-500 text-black">{level}</Badge>;
      case "INFO":
        return <Badge className="bg-primary text-primary-foreground">{level}</Badge>;
      default:
        return <Badge variant="secondary">{level}</Badge>;
    }
  };

  const streamState = describeStreamMode(streamMode, logScope);
  const scopeDetails = describeScope(logScope);
  const bindEntryCount = logs.filter((entry) => entry.origin === "bind").length;
  const appEntryCount = logs.length - bindEntryCount;
  const bindSources = Array.from(
    new Set(logs.filter((entry) => entry.origin === "bind").map((entry) => entry.source)),
  );
  const viewModeLabel =
    logScope === "bind" ? "BIND exact" : logScope === "app" ? "App only" : "Combined";
  const emptyStateMessage =
    logScope === "bind"
      ? "No exact BIND log lines matched the current filters or were readable from the active target."
      : "No log entries match the current filters.";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="System Logs"
          description="Inspect exact readable BIND logs, application events, or a combined operational view from the active target."
          icon={Terminal}
          badge={
            <Badge variant="outline" className="border-border/70 bg-background/70">
              {streamState.badge}
            </Badge>
          }
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-xl border-border/70 bg-background/70 shadow-none"
                onClick={() => void fetchLogs()}
                disabled={loading}
              >
                <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
                Refresh
              </Button>
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-xl border-border/70 bg-background/70 shadow-none"
                onClick={handleDownload}
                disabled={logs.length === 0}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-xl border-border/70 bg-background/70 text-destructive shadow-none hover:text-destructive"
                onClick={() => setShowClearConfirm(true)}
                disabled={logScope === "bind"}
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
          }
        />

        <Alert>
          <Terminal className="h-4 w-4" />
          <AlertTitle>{scopeDetails.title}</AlertTitle>
          <AlertDescription>{scopeDetails.description}</AlertDescription>
        </Alert>

        {logScope !== "app" && !loading && bindEntryCount === 0 ? (
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>No exact BIND lines available</AlertTitle>
            <AlertDescription>
              The active target did not return readable BIND log lines for the current filters from known file tails or service journals.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Visible logs"
            value={logs.length}
            description="Current result set after filtering"
            icon={Terminal}
            tone="success"
          />
          <MetricCard
            label="Application entries"
            value={appEntryCount}
            description="Visible web UI log records"
            icon={Terminal}
            tone="success"
          />
          <MetricCard
            label="BIND entries"
            value={bindEntryCount}
            description="Visible exact remote BIND lines"
            icon={Search}
            tone={bindEntryCount > 0 ? "success" : "default"}
          />
          <MetricCard
            label="View mode"
            value={viewModeLabel}
            description={bindSources.length > 0 ? bindSources.join(", ") : "No BIND sources in the current result"}
            icon={Search}
          />
        </div>

        {streamMode !== "live" && logScope !== "bind" ? (
          <Alert>
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>Live stream unavailable</AlertTitle>
            <AlertDescription>
              The application WebSocket stream is not currently active. The page is falling back to periodic polling so visibility remains available.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card className="linear-panel overflow-hidden border-border/60 bg-card/78 shadow-none">
          <CardHeader className="flex flex-col items-start justify-between gap-3 border-b border-border/60 p-4 md:flex-row md:items-center">
            <div className="flex w-full flex-col gap-3 md:max-w-[520px]">
              <Tabs value={logScope} onValueChange={(value) => setLogScope(value as LogScope)}>
                <TabsList className="h-auto rounded-2xl border border-border/60 bg-card/70 p-1">
                  <TabsTrigger value="combined" className="rounded-xl">
                    Combined
                  </TabsTrigger>
                  <TabsTrigger value="bind" className="rounded-xl">
                    BIND Exact
                  </TabsTrigger>
                  <TabsTrigger value="app" className="rounded-xl">
                    App Only
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative flex-1" style={{ maxWidth: "400px" }}>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  className="pl-9"
                  placeholder="Filter logs by source, level, or message"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 overflow-auto pb-1 md:pb-0">
              {levels.map((levelOption) => (
                <Button
                  key={levelOption.label}
                  variant={activeLevel === levelOption.value ? "default" : "outline"}
                  size="sm"
                  className={
                    activeLevel === levelOption.value
                      ? "rounded-full"
                      : "rounded-full border-border/70 bg-background/70 shadow-none"
                  }
                  onClick={() => setActiveLevel(levelOption.value)}
                >
                  {levelOption.label}
                </Button>
              ))}
            </div>
          </CardHeader>

          <ScrollArea className="relative" style={{ minHeight: "500px", maxHeight: "70vh" }}>
            <div className="bg-background/20 font-mono text-sm text-foreground">
              <div className="sticky top-0 z-10 border-b border-border/60 bg-card/92 backdrop-blur">
                <div className="flex text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  <div className="w-[200px] px-4 py-3">Timestamp</div>
                  <div className="w-[100px] px-4 py-3">Level</div>
                  <div className="w-[190px] px-4 py-3">Source</div>
                  <div className="flex-1 px-4 py-3">Message</div>
                </div>
              </div>

              {loading && logs.length === 0 ? (
                <PageState
                  loading
                  title="Loading logs"
                  description="Fetching recent activity from the server."
                  className="m-4"
                />
              ) : logs.length === 0 ? (
                <div className="m-4 rounded-2xl border border-dashed border-border/60 bg-background/45 p-8 text-center text-muted-foreground">
                  {emptyStateMessage}
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="mx-3 my-2 flex rounded-2xl border border-border/60 bg-background/45 transition-colors hover:bg-background/60"
                    >
                      <div className="w-[200px] shrink-0 whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                      <div className="w-[100px] shrink-0 px-4 py-2">{levelBadge(log.level)}</div>
                      <div className="w-[190px] shrink-0 px-4 py-3 text-foreground/80">
                        <div className="truncate">{log.source}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="border-border/60 bg-background/50 text-[10px] uppercase tracking-[0.14em]">
                            {log.origin === "bind" ? "BIND" : "APP"}
                          </Badge>
                          <Badge variant="outline" className="border-border/60 bg-background/50 text-[10px] uppercase tracking-[0.14em]">
                            {log.transport ?? "database"}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex-1 break-all px-4 py-3 text-foreground/92">
                        {log.message}
                      </div>
                  </div>
                ))
              )}

              <div className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Terminal className="h-3 w-3" />
                  <span>{streamState.footer}</span>
                </div>
              </div>
            </div>
          </ScrollArea>
        </Card>
      </div>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all logs</AlertDialogTitle>
            <AlertDialogDescription>
              Remove all stored application log entries from the web UI database? Exact remote BIND log files are not deleted by this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleClear}
              disabled={clearing}
            >
              {clearing ? "Clearing..." : "Clear Logs"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
