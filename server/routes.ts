import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import os from "os";
import { storage } from "./storage";
import { bind9Service } from "./bind9-service";
import { sshManager } from "./ssh-manager";
import { insertZoneSchema, insertDnsRecordSchema, insertAclSchema, insertTsigKeySchema, insertConnectionSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Restore active SSH connection on startup ──────────────────
  try {
    const activeConn = await storage.getActiveConnection();
    if (activeConn) {
      sshManager.setConfig({
        host: activeConn.host,
        port: activeConn.port,
        username: activeConn.username,
        authType: activeConn.authType as "password" | "key",
        password: activeConn.password || undefined,
        privateKey: activeConn.privateKey || undefined,
      });
      bind9Service.configure({
        mode: "ssh",
        confDir: activeConn.bind9ConfDir || undefined,
        zoneDir: activeConn.bind9ZoneDir || undefined,
        rndcBin: activeConn.rndcBin || undefined,
      });
      try {
        await sshManager.connect();
        await storage.updateConnection(activeConn.id, { lastStatus: "connected" });
        console.log(`[startup] SSH connection restored: ${activeConn.name} (${activeConn.host})`);
      } catch (e: any) {
        await storage.updateConnection(activeConn.id, { lastStatus: "failed" });
        console.log(`[startup] SSH connection failed: ${e.message}`);
      }
    }
  } catch (e: any) {
    console.log(`[startup] No active connection: ${e.message}`);
  }

  // ══════════════════════════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════════════════════════
  app.get("/api/dashboard", async (_req: Request, res: Response) => {
    try {
      const allZones = await storage.getZones();
      const bind9Status = await bind9Service.getStatus();
      const metrics = await bind9Service.getSystemMetrics();
      const uptime = await bind9Service.getUptime();
      const recentLogs = await storage.getLogs({ limit: 5 });

      // Count records per type
      let totalRecords = 0;
      const typeCounts: Record<string, number> = {};
      for (const zone of allZones) {
        const records = await storage.getRecords(zone.id);
        totalRecords += records.length;
        for (const r of records) {
          typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
        }
      }

      const typeDistribution = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

      res.json({
        zones: {
          total: allZones.length,
          active: allZones.filter(z => z.status === "active").length,
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
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ZONES
  // ══════════════════════════════════════════════════════════════
  app.get("/api/zones", async (_req: Request, res: Response) => {
    try {
      const allZones = await storage.getZones();
      const enriched = await Promise.all(allZones.map(async (zone) => ({
        ...zone,
        records: await storage.getZoneRecordCount(zone.id),
      })));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/zones/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      const records = await storage.getRecords(zone.id);
      res.json({ ...zone, records });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/zones", async (req: Request, res: Response) => {
    try {
      const data = insertZoneSchema.parse(req.body);
      const zone = await storage.createZone(data);

      try {
        if (await bind9Service.isAvailable()) {
          await bind9Service.writeZoneFile(zone.filePath, zone.domain, [], zone.serial);
          await bind9Service.reload();
        }
      } catch (e: any) {
        await storage.insertLog({
          level: "WARN",
          source: "zones",
          message: `Zone ${zone.domain} created in DB but BIND9 sync failed: ${e.message}`,
        });
      }

      await storage.insertLog({
        level: "INFO",
        source: "zones",
        message: `Zone ${zone.domain} created (type: ${zone.type})`,
      });

      res.status(201).json(zone);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/zones/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      const updated = await storage.updateZone(id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/zones/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      await storage.deleteZone(id);

      await storage.insertLog({
        level: "WARN",
        source: "zones",
        message: `Zone ${zone.domain} deleted`,
      });

      res.json({ message: "Zone deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  DNS RECORDS
  // ══════════════════════════════════════════════════════════════
  app.get("/api/zones/:id/records", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      const records = await storage.getRecords(id);
      res.json(records);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/zones/:id/records", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });

      const data = insertDnsRecordSchema.parse({ ...req.body, zoneId: id });
      const record = await storage.createRecord(data);

      const serial = new Date().toISOString().slice(0, 10).replace(/-/g, "") +
        String(Math.floor(Math.random() * 99) + 1).padStart(2, "0");
      await storage.updateZone(zone.id, { serial });

      await storage.insertLog({
        level: "INFO",
        source: "records",
        message: `Record ${record.name} ${record.type} ${record.value} added to ${zone.domain}`,
      });

      res.status(201).json(record);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/records/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const record = await storage.getRecord(id);
      if (!record) return res.status(404).json({ message: "Record not found" });
      const updated = await storage.updateRecord(id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/records/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const record = await storage.getRecord(id);
      if (!record) return res.status(404).json({ message: "Record not found" });
      await storage.deleteRecord(id);
      res.json({ message: "Record deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  CONFIG
  // ══════════════════════════════════════════════════════════════
  app.get("/api/config/:section", async (req: Request, res: Response) => {
    try {
      const { section } = req.params;

      let content = "";
      try {
        if (await bind9Service.isAvailable()) {
          if (section === "options") {
            content = await bind9Service.readNamedConfOptions();
          } else {
            content = await bind9Service.readNamedConf();
          }
        }
      } catch { }

      if (!content) {
        const snapshot = await storage.getConfig(section as string);
        content = snapshot?.content || getDefaultConfig(section as string);
      }

      res.json({ section, content });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/config/:section", async (req: Request, res: Response) => {
    try {
      const section = req.params.section as string;
      const { content } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "content is required" });
      }

      const snapshot = await storage.saveConfig(section, content);

      try {
        if (await bind9Service.isAvailable()) {
          await bind9Service.writeNamedConf(section, content);
          await bind9Service.reload();
        }
      } catch (e: any) {
        await storage.insertLog({
          level: "WARN",
          source: "config",
          message: `Config saved to DB but BIND9 sync failed: ${e.message}`,
        });
      }

      await storage.insertLog({
        level: "INFO",
        source: "config",
        message: `Configuration section '${section}' updated`,
      });

      res.json(snapshot);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ACLs
  // ══════════════════════════════════════════════════════════════
  app.get("/api/acls", async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getAcls());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/acls", async (req: Request, res: Response) => {
    try {
      const data = insertAclSchema.parse(req.body);
      const acl = await storage.createAcl(data);

      await storage.insertLog({
        level: "INFO",
        source: "security",
        message: `ACL '${acl.name}' created with networks: ${acl.networks}`,
      });

      res.status(201).json(acl);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/acls/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const acl = await storage.getAcl(id);
      if (!acl) return res.status(404).json({ message: "ACL not found" });
      const updated = await storage.updateAcl(id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/acls/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const acl = await storage.getAcl(id);
      if (!acl) return res.status(404).json({ message: "ACL not found" });
      await storage.deleteAcl(id);

      await storage.insertLog({
        level: "WARN",
        source: "security",
        message: `ACL '${acl.name}' deleted`,
      });

      res.json({ message: "ACL deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  TSIG KEYS
  // ══════════════════════════════════════════════════════════════
  app.get("/api/keys", async (_req: Request, res: Response) => {
    try {
      const keys = await storage.getKeys();
      res.json(keys.map(k => ({
        ...k,
        secret: k.secret.slice(0, 5) + "...[hidden]",
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/keys", async (req: Request, res: Response) => {
    try {
      const data = insertTsigKeySchema.parse(req.body);
      const key = await storage.createKey(data);

      await storage.insertLog({
        level: "INFO",
        source: "security",
        message: `TSIG key '${key.name}' created (${key.algorithm})`,
      });

      res.status(201).json({
        ...key,
        secret: key.secret.slice(0, 5) + "...[hidden]",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/keys/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const key = await storage.getKey(id);
      if (!key) return res.status(404).json({ message: "Key not found" });
      await storage.deleteKey(id);

      await storage.insertLog({
        level: "WARN",
        source: "security",
        message: `TSIG key '${key.name}' deleted`,
      });

      res.json({ message: "Key deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  LOGS
  // ══════════════════════════════════════════════════════════════
  app.get("/api/logs", async (req: Request, res: Response) => {
    try {
      const filter = {
        level: req.query.level as string | undefined,
        source: req.query.source as string | undefined,
        search: req.query.search as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 200,
      };
      res.json(await storage.getLogs(filter));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/logs", async (_req: Request, res: Response) => {
    try {
      await storage.clearLogs();
      res.json({ message: "Logs cleared" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  SERVER STATUS
  // ══════════════════════════════════════════════════════════════
  app.get("/api/status", async (_req: Request, res: Response) => {
    try {
      const bind9Status = await bind9Service.getStatus();
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
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  RNDC COMMANDS
  // ══════════════════════════════════════════════════════════════
  app.post("/api/rndc/:command", async (req: Request, res: Response) => {
    try {
      const command = req.params.command as string;
      const allowed = ["reload", "flush", "status", "stats", "reconfig", "dumpdb", "querylog"];
      if (!allowed.includes(command)) {
        return res.status(400).json({ message: `Command '${command}' not allowed. Allowed: ${allowed.join(", ")}` });
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
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  SSH CONNECTIONS
  // ══════════════════════════════════════════════════════════════
  app.get("/api/connections", async (_req: Request, res: Response) => {
    try {
      const conns = await storage.getConnections();
      // Mask passwords in response
      res.json(conns.map(c => ({
        ...c,
        password: c.password ? "***" : "",
        privateKey: c.privateKey ? "***" : "",
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/connections", async (req: Request, res: Response) => {
    try {
      const data = insertConnectionSchema.parse(req.body);
      const conn = await storage.createConnection(data);

      await storage.insertLog({
        level: "INFO",
        source: "connections",
        message: `Connection '${conn.name}' created (${conn.host}:${conn.port})`,
      });

      res.status(201).json({
        ...conn,
        password: conn.password ? "***" : "",
        privateKey: conn.privateKey ? "***" : "",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/connections/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const conn = await storage.getConnection(id);
      if (!conn) return res.status(404).json({ message: "Connection not found" });

      // Don't overwrite password/key if they come as "***"
      const updates = { ...req.body };
      if (updates.password === "***") delete updates.password;
      if (updates.privateKey === "***") delete updates.privateKey;

      const updated = await storage.updateConnection(id, updates);
      res.json({
        ...updated,
        password: updated.password ? "***" : "",
        privateKey: updated.privateKey ? "***" : "",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/connections/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const conn = await storage.getConnection(id);
      if (!conn) return res.status(404).json({ message: "Connection not found" });

      if (conn.isActive) {
        sshManager.disconnect();
        sshManager.setConfig(null);
        bind9Service.configure({ mode: "local" });
      }

      await storage.deleteConnection(id);

      await storage.insertLog({
        level: "WARN",
        source: "connections",
        message: `Connection '${conn.name}' deleted`,
      });

      res.json({ message: "Connection deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /** Test SSH connectivity */
  app.post("/api/connections/:id/test", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const conn = await storage.getConnection(id);
      if (!conn) return res.status(404).json({ message: "Connection not found" });

      const result = await sshManager.testConnection({
        host: conn.host,
        port: conn.port,
        username: conn.username,
        authType: conn.authType as "password" | "key",
        password: conn.password || undefined,
        privateKey: conn.privateKey || undefined,
      });

      // Update detected paths if test was successful
      if (result.success && result.serverInfo) {
        const updates: any = {
          lastStatus: "connected",
        };
        if (!conn.bind9ConfDir && result.serverInfo.confDir) {
          updates.bind9ConfDir = result.serverInfo.confDir;
        }
        if (!conn.bind9ZoneDir && result.serverInfo.zoneDir) {
          updates.bind9ZoneDir = result.serverInfo.zoneDir;
        }
        await storage.updateConnection(id, updates);
      } else {
        await storage.updateConnection(id, { lastStatus: "failed" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /** Test SSH connectivity with inline credentials (no saved connection) */
  app.post("/api/connections/test", async (req: Request, res: Response) => {
    try {
      const { host, port, username, authType, password, privateKey } = req.body;
      if (!host || !username) {
        return res.status(400).json({ message: "host and username are required" });
      }

      const result = await sshManager.testConnection({
        host,
        port: port || 22,
        username,
        authType: authType || "password",
        password,
        privateKey,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /** Activate a connection — switches bind9-service to SSH mode */
  app.put("/api/connections/:id/activate", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const conn = await storage.getConnection(id);
      if (!conn) return res.status(404).json({ message: "Connection not found" });

      // Setup SSH
      sshManager.setConfig({
        host: conn.host,
        port: conn.port,
        username: conn.username,
        authType: conn.authType as "password" | "key",
        password: conn.password || undefined,
        privateKey: conn.privateKey || undefined,
      });

      try {
        await sshManager.connect();
      } catch (e: any) {
        await storage.updateConnection(id, { lastStatus: "failed" });
        return res.status(502).json({ message: `SSH connection failed: ${e.message}` });
      }

      // Switch bind9-service to SSH mode
      bind9Service.configure({
        mode: "ssh",
        confDir: conn.bind9ConfDir || undefined,
        zoneDir: conn.bind9ZoneDir || undefined,
        rndcBin: conn.rndcBin || undefined,
      });

      // Mark as active in DB
      const activated = await storage.activateConnection(id);
      await storage.updateConnection(id, { lastStatus: "connected" });

      await storage.insertLog({
        level: "INFO",
        source: "connections",
        message: `Connection '${conn.name}' activated — SSH mode enabled (${conn.host}:${conn.port})`,
      });

      res.json({
        ...activated,
        password: "***",
        privateKey: activated.privateKey ? "***" : "",
        message: `Connected to ${conn.host}`,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /** Deactivate — switch back to local mode */
  app.put("/api/connections/deactivate", async (_req: Request, res: Response) => {
    try {
      sshManager.disconnect();
      sshManager.setConfig(null);
      bind9Service.configure({ mode: "local" });
      await storage.deactivateAllConnections();

      await storage.insertLog({
        level: "INFO",
        source: "connections",
        message: "All connections deactivated — switched to local mode",
      });

      res.json({ message: "Switched to local mode" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  WEBSOCKET — Live Logs
  // ══════════════════════════════════════════════════════════════
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/logs" });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[ws] Log client connected");

    storage.getLogs({ limit: 50 }).then((logs) => {
      ws.send(JSON.stringify({ type: "history", data: logs }));
    });

    ws.on("close", () => {
      console.log("[ws] Log client disconnected");
    });
  });

  // Broadcast new logs to all connected clients
  const originalInsertLog = storage.insertLog.bind(storage);
  storage.insertLog = async (entry) => {
    const log = await originalInsertLog(entry);
    const message = JSON.stringify({ type: "log", data: log });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    return log;
  };

  // Insert a startup log
  await storage.insertLog({
    level: "INFO",
    source: "general",
    message: "BIND9 Admin Panel server started",
  });

  return httpServer;
}

// ── Default config templates ────────────────────────────────────
function getDefaultConfig(section: string): string {
  if (section === "options") {
    return `options {
    directory "/var/cache/bind";

    // Forwarding
    forwarders {
        8.8.8.8;
        8.8.4.4;
    };

    // Security
    dnssec-validation auto;
    auth-nxdomain no;

    // Listen
    listen-on { any; };
    listen-on-v6 { any; };

    // Access
    allow-query { localhost; 192.168.0.0/16; };
    allow-transfer { none; };
    allow-recursion { trusted-clients; };

    // Logging
    querylog yes;
};`;
  }
  if (section === "local") {
    return `// Local zone definitions\n// Zones will be auto-generated by the admin panel\n`;
  }
  return `// Configuration section: ${section}\n`;
}
