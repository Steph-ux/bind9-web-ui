import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Terminal, Search, Download, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getLogs, clearLogs, type LogData } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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
        setLogs(prev => [msg.data, ...prev].slice(0, 200));
      } else if (msg.type === "history") {
        setLogs(prev => {
          const ids = new Set(prev.map(l => l.id));
          const newLogs = msg.data.filter((l: LogData) => !ids.has(l.id));
          return [...newLogs, ...prev].slice(0, 200);
        });
      }
    };
    ws.onerror = () => console.log("[ws] Connection error, falling back to polling");
    return () => { ws.close(); };
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
    const content = logs.map(l => `${l.timestamp}\t${l.level}\t${l.source}\t${l.message}`).join("\n");
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
      case 'ERROR': return <Badge variant="destructive">{level}</Badge>;
      case 'WARN': return <Badge className="bg-yellow-500 text-black">{level}</Badge>;
      case 'INFO': return <Badge className="bg-blue-500 text-white">{level}</Badge>;
      default: return <Badge variant="secondary">{level}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">System Logs</h2>
          <p className="text-muted-foreground">Real-time event stream from services.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleDownload}>
            <Download className="h-4 w-4" /> Download
          </Button>
          <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setShowClearConfirm(true)}>
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="p-4 border-b flex flex-col md:flex-row gap-3 justify-between items-start md:items-center">
          <div className="relative flex-1" style={{ maxWidth: "400px" }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              className="pl-9"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-auto pb-1 md:pb-0">
            {levels.map(l => (
              <Button
                key={l.label}
                variant={activeLevel === l.value ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setActiveLevel(l.value)}
              >
                {l.label}
              </Button>
            ))}
          </div>
        </CardHeader>

        {/* Terminal Window */}
        <ScrollArea className="relative" style={{ minHeight: "500px", maxHeight: "70vh" }}>
          <div className="bg-zinc-950 dark:bg-zinc-950 text-zinc-100 dark:text-zinc-100 font-mono text-sm">
            {/* Sticky header */}
            <div className="sticky top-0 bg-zinc-950 dark:bg-zinc-950 border-b border-zinc-800 dark:border-zinc-800 z-10">
              <div className="flex text-zinc-500 dark:text-zinc-500 uppercase text-xs font-medium">
                <div className="py-3 px-4 w-[200px]">Timestamp</div>
                <div className="py-3 px-4 w-[100px]">Level</div>
                <div className="py-3 px-4 w-[150px]">Source</div>
                <div className="py-3 px-4 flex-1">Message</div>
              </div>
            </div>

            {loading && logs.length === 0 ? (
              <div className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-400 dark:text-zinc-400" />
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 dark:text-zinc-500">
                No log entries. Activity will appear here in real-time.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex border-b border-zinc-800/50 dark:border-zinc-800/50 hover:bg-zinc-900/50 dark:hover:bg-zinc-900/50 transition-colors">
                  <div className="py-2 px-4 w-[200px] text-zinc-500 dark:text-zinc-500 shrink-0 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                  <div className="py-2 px-4 w-[100px] shrink-0">
                    {levelBadge(log.level)}
                  </div>
                  <div className="py-2 px-4 w-[150px] text-cyan-400 dark:text-cyan-400 shrink-0 truncate">
                    {log.source}
                  </div>
                  <div className="py-2 px-4 flex-1 text-zinc-200 dark:text-zinc-200 break-all">
                    {log.message}
                  </div>
                </div>
              ))
            )}

            {/* Tailing Indicator */}
            <div ref={logEndRef as any} className="py-3 px-4 animate-pulse">
              <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-500 text-xs">
                <Terminal className="h-3 w-3" />
                <span>
                  {wsRef.current?.readyState === WebSocket.OPEN ? "connected â€” tailing logs..." : "connecting..."}
                </span>
              </div>
            </div>
          </div>
        </ScrollArea>
      </Card>
      {/* Clear Confirmation */}
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
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleClear}>
              Clear Logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
