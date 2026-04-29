import type { Express, Request, RequestHandler, Response } from "express";

import { bind9Service } from "./bind9-service";
import { sshManager } from "./ssh-manager";
import { storage } from "./storage";

type RegisterSystemRoutesOptions = {
  app: Express;
  requireViewer: RequestHandler;
  requireOperator: RequestHandler;
  requireAdmin: RequestHandler;
  safeError: (status: number, message: string) => string;
};

export function registerSystemRoutes({
  app,
  requireViewer,
  requireOperator,
  requireAdmin,
  safeError,
}: RegisterSystemRoutesOptions) {
  app.get("/api/dashboard", requireViewer, async (_req: Request, res: Response) => {
    try {
      const allZones = await storage.getZones();
      const bind9Status = await bind9Service.getStatus();
      const metrics = await bind9Service.getSystemMetrics();
      const uptime = await bind9Service.getUptime();
      const recentLogs = await storage.getLogs({ limit: 5 });

      let totalRecords = 0;
      const typeCounts: Record<string, number> = {};
      for (const zone of allZones) {
        const records = await storage.getRecords(zone.id);
        totalRecords += records.length;
        for (const record of records) {
          typeCounts[record.type] = (typeCounts[record.type] || 0) + 1;
        }
      }

      const typeDistribution = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

      res.json({
        zones: {
          total: allZones.length,
          active: allZones.filter((zone) => zone.status === "active").length,
        },
        records: totalRecords,
        bind9: bind9Status,
        uptime,
        system: {
          cpu: metrics.cpu.total,
          memory: {
            used: metrics.memory.used,
            total: metrics.memory.total,
          },
        },
        typeDistribution,
        recentLogs,
        connectionMode: bind9Service.getMode(),
        sshState: sshManager.getState(),
      });
    } catch (error: any) {
      console.error("[system-routes] dashboard failed", error);
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/logs", requireViewer, async (req: Request, res: Response) => {
    try {
      const filter = {
        level: req.query.level as string | undefined,
        source: req.query.source as string | undefined,
        search: req.query.search as string | undefined,
        limit: req.query.limit ? Math.min(parseInt(req.query.limit as string, 10) || 200, 1000) : 200,
      };
      const appLogs = await storage.getLogs(filter);

      let bind9Logs: typeof appLogs = [];
      try {
        if (await bind9Service.isAvailable()) {
          const raw = await bind9Service.readBind9Logs(filter.limit || 200);
          bind9Logs = raw.map((log) => ({
            id: `bind9-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ...log,
            level: log.level as "INFO" | "WARN" | "ERROR" | "DEBUG",
          }));

          if (filter.level) {
            bind9Logs = bind9Logs.filter((log) => log.level === filter.level);
          }
          if (filter.source && filter.source !== "app") {
            bind9Logs = bind9Logs.filter((log) => log.source === filter.source);
          }
          if (filter.search) {
            const query = filter.search.toLowerCase();
            bind9Logs = bind9Logs.filter((log) => log.message.toLowerCase().includes(query));
          }
        }
      } catch {}

      if (filter.source === "app") {
        return res.json(appLogs);
      }

      const allLogs = [...appLogs, ...bind9Logs]
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .slice(0, filter.limit || 200);

      res.json(allLogs);
    } catch (error: any) {
      console.error("[system-routes] status failed", error);
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/logs/bind9", requireViewer, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10) || 200, 1000) : 200;
      const logs = await bind9Service.readBind9Logs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/logs", requireAdmin, async (_req: Request, res: Response) => {
    try {
      await storage.clearLogs();
      res.json({ message: "Logs cleared" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/status", requireViewer, async (_req: Request, res: Response) => {
    try {
      const [bind9Status, management] = await Promise.all([
        bind9Service.getStatus(),
        bind9Service.getManagementSummary(),
      ]);
      const metrics = await bind9Service.getSystemMetrics();
      const uptime = await bind9Service.getUptime();
      const hostname = await bind9Service.getHostname();

      res.json({
        bind9: bind9Status,
        system: metrics,
        uptime,
        hostname,
        connectionMode: bind9Service.getMode(),
        sshState: sshManager.getState(),
        management,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/server/bind-info", requireViewer, async (_req: Request, res: Response) => {
    try {
      const [forwarders, allowAcls, dnssec, transfers, slaveZones, management] = await Promise.all([
        bind9Service.getForwarders(),
        bind9Service.getAllowRecursionQuery(),
        bind9Service.getDnssecStatus(),
        bind9Service.getZoneTransfers(),
        bind9Service.getSlaveZonesStatus(),
        bind9Service.getManagementSummary(),
      ]);

      res.json({
        forwarders,
        allowRecursion: allowAcls.allowRecursion,
        allowQuery: allowAcls.allowQuery,
        allowTransfer: allowAcls.allowTransfer,
        dnssec,
        transfers,
        slaveZones,
        management,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/rndc/:command", requireOperator, async (req: Request, res: Response) => {
    try {
      const command = String(req.params.command);
      const allowed = ["reload", "flush", "status", "stats", "reconfig", "dumpdb", "querylog"];
      if (!allowed.includes(command)) {
        return res.status(400).json({
          message: `Command '${command}' not allowed. Allowed: ${allowed.join(", ")}`,
        });
      }

      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available on this system" });
      }

      const output = await bind9Service.rndc(command);
      await storage.insertLog({
        level: "INFO",
        source: "rndc",
        message: `rndc ${command} executed`,
      });

      res.json({ command, output });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });
}
