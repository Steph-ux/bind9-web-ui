import { useEffect, useRef, useState } from "react";
import { Download, Search, Terminal, Trash2 } from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader, PageState } from "@/components/layout";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { clearLogs, getLogs, type LogData } from "@/lib/api";

export default function Logs() {
  const [logs, setLogs] = useState<LogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const data = await getLogs({
        level: activeLevel || undefined,
        search: filter || undefined,
        limit: 200,
      });
      setLogs(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "log") {
        setLogs((prev) => [msg.data, ...prev].slice(0, 200));
      } else if (msg.type === "history") {
        setLogs((prev) => {
          const ids = new Set(prev.map((l) => l.id));
          const newLogs = msg.data.filter((l: LogData) => !ids.has(l.id));
          return [...newLogs, ...prev].slice(0, 200);
        });
      }
    };
    ws.onerror = () => console.log("[ws] Connection error, falling back to polling");
    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(fetchLogs, 300);
    return () => clearTimeout(timeout);
  }, [filter, activeLevel]);

  const handleClear = async () => {
    try {
      await clearLogs();
      setLogs([]);
      setShowClearConfirm(false);
      toast({ title: "Cleared", description: "All logs have been cleared" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDownload = () => {
    const content = logs
      .map((l) => `${l.timestamp}\t${l.level}\t${l.source}\t${l.message}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bind9-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="System Logs"
          description="Real-time event stream from services, API actions, and BIND9 activity."
          icon={Terminal}
          badge={
            <Badge variant="outline" className="border-border/70 bg-background/70">
              {wsRef.current?.readyState === WebSocket.OPEN ? "Live stream" : "Polling"}
            </Badge>
          }
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-xl border-border/70 bg-background/70 shadow-none"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-xl border-border/70 bg-background/70 text-destructive shadow-none hover:text-destructive"
                onClick={() => setShowClearConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
          }
        />

        <Card className="linear-panel overflow-hidden border-border/60 bg-card/78 shadow-none">
          <CardHeader className="flex flex-col items-start justify-between gap-3 border-b border-border/60 p-4 md:flex-row md:items-center">
            <div className="relative flex-1" style={{ maxWidth: "400px" }}>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                className="pl-9"
                placeholder="Filter logs..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="flex gap-2 overflow-auto pb-1 md:pb-0">
              {levels.map((l) => (
                <Button
                  key={l.label}
                  variant={activeLevel === l.value ? "default" : "outline"}
                  size="sm"
                  className={
                    activeLevel === l.value
                      ? "rounded-full"
                      : "rounded-full border-border/70 bg-background/70 shadow-none"
                  }
                  onClick={() => setActiveLevel(l.value)}
                >
                  {l.label}
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
                  No log entries. Activity will appear here in real-time.
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

              <div ref={logEndRef} className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Terminal className="h-3 w-3" />
                  <span>
                    {wsRef.current?.readyState === WebSocket.OPEN
                      ? "connected - tailing logs..."
                      : "connecting..."}
                  </span>
                </div>
              </div>
            </div>
          </ScrollArea>
        </Card>
      </div>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Logs</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear all logs? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleClear}
            >
              Clear Logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
