import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Terminal, Search, Download, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLogs, clearLogs, type LogData } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Logs() {
  const [logs, setLogs] = useState<LogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
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

  // WebSocket for live logs
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

    ws.onerror = () => {
      console.log("[ws] Connection error, falling back to polling");
    };

    return () => {
      ws.close();
    };
  }, []);

  // Re-fetch when filter changes
  useEffect(() => {
    const timeout = setTimeout(fetchLogs, 300);
    return () => clearTimeout(timeout);
  }, [filter, activeLevel]);

  const handleClear = async () => {
    if (!confirm("Clear all logs?")) return;
    try {
      await clearLogs();
      setLogs([]);
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

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">System Logs</h1>
          <p className="text-muted-foreground mt-1">Real-time event stream from services.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 border-primary/20" onClick={handleDownload}>
            <Download className="w-4 h-4" /> Download
          </Button>
          <Button variant="destructive" className="gap-2 bg-destructive/20 text-destructive border-destructive/20 hover:bg-destructive/30" onClick={handleClear}>
            <Trash2 className="w-4 h-4" /> Clear
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-primary/10 overflow-hidden">
        <div className="p-4 border-b border-border/40 flex flex-col md:flex-row gap-4 justify-between items-center bg-card/30">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Filter logs..."
              className="pl-9 bg-background/50 border-primary/10"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
            {levels.map(l => (
              <Badge
                key={l.label}
                variant="outline"
                className={`cursor-pointer transition-colors ${activeLevel === l.value ? 'bg-primary/10 text-primary border-primary/20' : 'hover:bg-primary/5'}`}
                onClick={() => setActiveLevel(l.value)}
              >
                {l.label}
              </Badge>
            ))}
          </div>
        </div>
        <div className="bg-black/60 font-mono text-sm overflow-x-auto min-h-[500px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/20 text-muted-foreground text-[10px] uppercase tracking-wider">
                <th className="p-4 font-medium w-48">Timestamp</th>
                <th className="p-4 font-medium w-24">Level</th>
                <th className="p-4 font-medium w-32">Source</th>
                <th className="p-4 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td className="p-8 text-center" colSpan={4}>
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-muted-foreground" colSpan={4}>
                    No log entries. Activity will appear here in real-time.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/10 hover:bg-white/5 transition-colors group">
                    <td className="p-4 text-muted-foreground whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border
                        ${log.level === 'INFO' ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' : ''}
                        ${log.level === 'WARN' ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' : ''}
                        ${log.level === 'ERROR' ? 'border-red-500/30 text-red-400 bg-red-500/10' : ''}
                        ${log.level === 'DEBUG' ? 'border-gray-500/30 text-gray-400 bg-gray-500/10' : ''}
                      `}>
                        {log.level}
                      </span>
                    </td>
                    <td className="p-4 text-primary/70">{log.source}</td>
                    <td className="p-4 text-gray-300 group-hover:text-white transition-colors">{log.message}</td>
                  </tr>
                ))
              )}
              <tr className="animate-pulse" ref={logEndRef as any}>
                <td className="p-4" colSpan={4}>
                  <div className="flex items-center gap-2 text-primary/40 text-xs">
                    <Terminal className="w-3 h-3" />
                    <span>
                      {wsRef.current?.readyState === WebSocket.OPEN ? "connected — tailing logs..." : "connecting..."}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardLayout>
  );
}