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
import { useToast } from "@/hooks/use-toast";
import { clearLogs, getLogs, type LogData } from "@/lib/api";

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

function describeStreamMode(mode: StreamMode) {
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

export default function Logs() {
  const [logs, setLogs] = useState<LogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
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
  }, [filter, activeLevel]);

  useEffect(() => {
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
          setLogs((current) => mergeLogs(current, [message.data], currentFilters));
          return;
        }

        if (message.type === "history" && Array.isArray(message.data)) {
          setLogs((current) => mergeLogs(current, message.data, currentFilters));
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
  }, []);

  useEffect(() => {
    if (streamMode === "live") {
      return;
    }

    const interval = setInterval(() => {
      void fetchLogs({ silent: true });
    }, 10000);

    return () => clearInterval(interval);
  }, [streamMode, filter, activeLevel]);

  const handleClear = async () => {
    try {
      setClearing(true);
      await clearLogs();
      setLogs([]);
      setShowClearConfirm(false);
      toast({ title: "Logs cleared", description: "All stored log entries have been removed." });
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
    anchor.download = `bind9-logs-${new Date().toISOString().slice(0, 10)}.txt`;
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

  const streamState = describeStreamMode(streamMode);
  const filteredLabel = activeLevel ?? "ALL";
  const errorCount = logs.filter((entry) => entry.level === "ERROR").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="System Logs"
          description="Inspect application events and readable BIND log tails from the active target."
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
                disabled={logs.length === 0}
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
          }
        />

        <Alert>
          <Terminal className="h-4 w-4" />
          <AlertTitle>Log scope</AlertTitle>
          <AlertDescription>
            The live WebSocket stream shows application events. Each refresh also merges readable BIND
            log tails from the active server when those files or service journals are accessible. Clearing
            logs here only clears the application log store, not the remote BIND log files themselves.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Visible logs"
            value={logs.length}
            description="Current result set after filtering"
            icon={Terminal}
            tone="success"
          />
          <MetricCard
            label="Error entries"
            value={errorCount}
            description="Errors in the visible set"
            icon={Terminal}
            tone={errorCount > 0 ? "warning" : "success"}
          />
          <MetricCard
            label="Level filter"
            value={filteredLabel}
            description="Current level selector"
            icon={Search}
          />
          <MetricCard
            label="Search filter"
            value={filter.trim() ? `"${filter.trim()}"` : "None"}
            description="Current text filter"
            icon={Search}
          />
        </div>

        {streamMode !== "live" ? (
          <Alert>
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>Live stream unavailable</AlertTitle>
            <AlertDescription>
              The WebSocket stream is not currently active. The page is falling back to periodic polling so log visibility remains available.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card className="linear-panel overflow-hidden border-border/60 bg-card/78 shadow-none">
          <CardHeader className="flex flex-col items-start justify-between gap-3 border-b border-border/60 p-4 md:flex-row md:items-center">
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
                  <div className="w-[150px] px-4 py-3">Source</div>
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
                  No log entries match the current filters.
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
                    <div className="w-[150px] shrink-0 truncate px-4 py-3 text-foreground/80">
                      {log.source}
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
              Remove all stored log entries from the application database? This action cannot be undone.
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
