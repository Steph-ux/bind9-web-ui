// Copyright Â(c) 2025 Stephane ASSOGBA
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { storage } from "./storage";
import { bind9Service } from "./bind9-service";
import { sshManager } from "./ssh-manager";
import { backupService } from "./backup-service";
import { healthService } from "./health-service";
import { configSectionContentSchema } from "@shared/schema";
import { z } from "zod";

import { registerAdminSecurityRoutes } from "./admin-security-routes";
import { registerBindSecurityRoutes } from "./bind-security-routes";
import { registerConnectionRoutes } from "./connection-routes";
import { registerOperationsRoutes } from "./operations-routes";
import { registerReplicationRoutes } from "./replication-routes";
import { registerRpzRoutes } from "./rpz-routes";
import { registerSystemRoutes } from "./system-routes";
import { registerUserManagementRoutes } from "./user-management-routes";
import { registerZoneRoutes } from "./zone-routes";

function normalizeApiScopePath(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function tokenScopeAllowsRequest(scopeValue: string, method: string, requestPath: string): boolean {
  const [rawScopePath, rawAccessMode] = scopeValue.split(":");
  const normalizedScopePath = normalizeApiScopePath(rawScopePath || "");
  const normalizedRequestPath = normalizeApiScopePath(requestPath.replace(/^\/api\/?/, ""));

  if (!normalizedScopePath) {
    return false;
  }

  if (rawAccessMode === "read" && !["GET", "HEAD"].includes(method)) {
    return false;
  }

  return (
    normalizedRequestPath === normalizedScopePath ||
    normalizedRequestPath.startsWith(`${normalizedScopePath}/`)
  );
}


/** Sanitize error messages â€” in production, hide internal details for 500 errors */
function safeError(status: number, message: string): string {
  if (process.env.NODE_ENV === "production" && status >= 500) {
    return "Internal Server Error";
  }
  return message;
}

async function refreshAclsFromBind() {
  const fileAcls = await bind9Service.syncAclsFromConfig();
  const currentDbAcls = await storage.getAcls();
  const seen = new Set<string>();

  for (const fileAcl of fileAcls) {
    seen.add(fileAcl.name);
    const existing = currentDbAcls.find((item) => item.name === fileAcl.name);
    if (!existing) {
      await storage.createAcl({
        name: fileAcl.name,
        networks: fileAcl.networks,
        comment: "Imported from named.conf.acls",
      });
      continue;
    }

    if (existing.networks !== fileAcl.networks) {
      await storage.updateAcl(existing.id, { networks: fileAcl.networks });
    }
  }

  for (const stale of currentDbAcls) {
    if (!seen.has(stale.name)) {
      await storage.deleteAcl(stale.id);
    }
  }

  return storage.getAcls();
}

async function refreshKeysFromBind() {
  const fileKeys = await bind9Service.syncKeysFromConfig();
  const currentDbKeys = await storage.getKeys();
  const seen = new Set<string>();

  for (const fileKey of fileKeys) {
    seen.add(fileKey.name);
    const existing = currentDbKeys.find((item) => item.name === fileKey.name);
    if (!existing) {
      await storage.createKey({
        name: fileKey.name,
        algorithm: fileKey.algorithm as any,
        secret: fileKey.secret,
      });
      continue;
    }

    if (existing.algorithm !== fileKey.algorithm || existing.secret !== fileKey.secret) {
      await storage.updateKey(existing.id, {
        algorithm: fileKey.algorithm as any,
        secret: fileKey.secret,
      });
    }
  }

  for (const stale of currentDbKeys) {
    if (!seen.has(stale.name)) {
      await storage.deleteKey(stale.id);
    }
  }

  return storage.getKeys();
}

function getRecordSignature(record: { name: string; type: string; value: string; ttl: number; priority?: number | null }) {
  return [
    record.name,
    record.type,
    record.value,
    String(record.ttl ?? 3600),
    String(record.priority ?? ""),
  ].join("|");
}

function recordSetsDiffer(
  currentRecords: Array<{ name: string; type: string; value: string; ttl: number; priority?: number | null }>,
  parsedRecords: Array<{ name: string; type: string; value: string; ttl: number; priority?: number | null }>
) {
  if (currentRecords.length !== parsedRecords.length) {
    return true;
  }

  const current = currentRecords.map(getRecordSignature).sort();
  const parsed = parsedRecords.map(getRecordSignature).sort();
  return current.some((signature, index) => signature !== parsed[index]);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Middleware to ensure user is authenticated (session or Bearer token)
  const requireAuth = async (req: Request, res: Response, next: Function) => {
    // Exclude auth routes (handled by setupAuth)
    if (req.path.startsWith("/api/auth")) return next();

    // Session auth takes priority
    if (req.isAuthenticated()) {
      return next();
    }

    // Bearer token auth
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const rawToken = authHeader.slice(7);
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const token = await storage.getApiTokenByHash(tokenHash);
      if (token) {
        // Check permissions scope
        const scope = token.permissions;
        if (scope !== "*" && scope !== "all") {
          const allowed = scope.split(",").map(s => s.trim());
          const hasAccess = allowed.some((perm) => tokenScopeAllowsRequest(perm, req.method, req.path));
          if (!hasAccess) {
            return res.status(403).json({ message: "Token does not have permission for this resource" });
          }
        }
        // Mark token as used
        await storage.updateTokenLastUsed(tokenHash);
        // Attach token info to request for downstream use
        (req as any).apiToken = token;
        (req as any).tokenRole = scope === "*" || scope === "all" ? "admin" : "operator";
        return next();
      }
    }

    res.status(401).json({ message: "Unauthorized" });
  };

  // Middleware to ensure user is admin (session or Bearer token with full scope)
  const requireAdmin = (req: Request, res: Response, next: Function) => {
    if (req.isAuthenticated() && (req.user as any).role === "admin") return next();
    if ((req as any).tokenRole === "admin") return next();
    if (!req.isAuthenticated() && !(req as any).apiToken) return res.status(401).json({ message: "Unauthorized" });
    return res.status(403).json({ message: "Forbidden" });
  };

  // Middleware to ensure user is admin or operator (session or Bearer token)
  const requireOperator = (req: Request, res: Response, next: Function) => {
    if (req.isAuthenticated()) {
      const role = (req.user as any).role;
      if (role === "admin" || role === "operator") return next();
      return res.status(403).json({ message: "Forbidden" });
    }
    if ((req as any).apiToken) return next(); // Token already passed requireAuth scope check
    return res.status(401).json({ message: "Unauthorized" });
  };

  const requireViewer = (req: Request, res: Response, next: Function) => {
    if (req.isAuthenticated()) return next();
    if ((req as any).apiToken) return next();
    return res.status(401).json({ message: "Unauthorized" });
  };

  const verifySessionCookie = (cookie: string, callback: (res: boolean, code?: number, message?: string) => void) => {
    if (!cookie.includes("connect.sid")) {
      return callback(false, 4001, "Authentication required");
    }
    const req = http.request({
      hostname: "127.0.0.1",
      port: httpServer.address() ? (httpServer.address() as any).port : 3001,
      path: "/api/auth/me",
      method: "GET",
      headers: { Cookie: cookie },
    }, (res: any) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk; });
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          callback(!!data.id);
        } catch {
          callback(false, 4001, "Authentication required");
        }
      });
    });
    req.on("error", () => callback(false, 4001, "Authentication required"));
    req.setTimeout(3000, () => { req.destroy(); callback(false, 4001, "Auth check timeout"); });
    req.end();
  };

  // Protect all API routes defined below
  app.use("/api", requireAuth);

  registerAdminSecurityRoutes({ app, requireAdmin, requireOperator, safeError });

  registerConnectionRoutes({
    app,
    requireAdmin,
    requireAuth,
    safeError,
    refreshAclsFromBind,
    refreshKeysFromBind,
  });

  registerReplicationRoutes({ app, requireAdmin, requireOperator, safeError });

  registerRpzRoutes({ app, requireAdmin, requireOperator, safeError });

  registerBindSecurityRoutes({
    app,
    requireViewer,
    requireOperator,
    safeError,
    refreshAclsFromBind,
    refreshKeysFromBind,
  });

  registerSystemRoutes({
    app,
    requireViewer,
    requireOperator,
    requireAdmin,
    safeError,
  });

  registerUserManagementRoutes({ app, requireAdmin, safeError });

  registerOperationsRoutes({ app, requireAdmin, requireOperator, safeError });

  registerZoneRoutes({ app, requireViewer, requireOperator, safeError });

  // â”€â”€ Restore SSH connections on startup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    const allConns = await storage.getConnections();
    // Register all connections in the pool
    for (const conn of allConns) {
      sshManager.register(conn.id, {
        host: conn.host,
        port: conn.port,
        username: conn.username,
        authType: conn.authType as "password" | "key",
        password: conn.password || undefined,
        privateKey: conn.privateKey || undefined,
      });
    }
    // Connect all registered connections
    for (const conn of allConns) {
      try {
        await sshManager.connectById(conn.id);
        await storage.updateConnection(conn.id, { lastStatus: "connected" });
        console.log(`[startup] SSH connection restored: ${conn.name} (${conn.host})`);
      } catch (e: any) {
        await storage.updateConnection(conn.id, { lastStatus: "failed" });
        console.log(`[startup] SSH connection failed for ${conn.name}: ${e.message}`);
      }
    }
    // Set the active connection for bind9-service
    const activeConn = allConns.find(c => c.isActive);
    if (activeConn) {
      sshManager.setActive(activeConn.id);
      bind9Service.configure({
        mode: "ssh",
        confDir: activeConn.bind9ConfDir || undefined,
        zoneDir: activeConn.bind9ZoneDir || undefined,
        rndcBin: activeConn.rndcBin || undefined,
      });
    }
  } catch (e: any) {
    console.log(`[startup] No active connection: ${e.message}`);
  }

  // â”€â”€ Auto-sync ACLs and Keys on startup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    if (await bind9Service.isAvailable()) {
      console.log("[startup] Syncing ACLs and Keys...");
      await refreshAclsFromBind();
      await refreshKeysFromBind();
      console.log("[startup] ACLs and Keys imported from BIND9 without rewriting server config");
    }
  } catch (e: any) {
    console.log(`[startup] Failed to sync ACLs/Keys: ${e.message}`);
  }

  // â”€â”€ Auto-sync zones from BIND9 config on startup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    if (await bind9Service.isAvailable()) {
      console.log("[startup] Starting zone sync...");
      const configZones = await bind9Service.syncZonesFromConfig();
      const existingZones = await storage.getZones();
      let synced = 0;
      let errors = 0;

      for (const cz of configZones) {
        try {
          // Check if supported type
          if (!["master", "slave", "forward"].includes(cz.type)) {
            console.log(`[startup] Skipping zone ${cz.domain}: unsupported type '${cz.type}'`);
            continue;
          }

          let zoneId = "";
          const found = existingZones.find(z => z.domain === cz.domain);

          if (found) {
            zoneId = found.id;
            await storage.updateZone(found.id, { type: cz.type as any, filePath: cz.filePath });
          } else {
            const zone = await storage.createZone({
              domain: cz.domain,
              type: cz.type as any,
            });
            zoneId = zone.id;
            await storage.updateZone(zone.id, { filePath: cz.filePath });
          }

          // Import records from zone file (same as manual sync)
          if (cz.filePath) {
            try {
              const records = await bind9Service.readZoneFile(cz.filePath);
              if (records.length > 0) {
                const currentRecords = await storage.getRecords(zoneId);
                const nonSoaRecords = records.filter(r => r.type !== "SOA");
                if (recordSetsDiffer(currentRecords, nonSoaRecords)) {
                  for (const r of currentRecords) {
                    await storage.deleteRecord(r.id);
                  }
                  let importedCount = 0;
                  for (const rec of nonSoaRecords) {
                    try {
                      await storage.createRecord({
                        zoneId: zoneId,
                        name: rec.name,
                        type: rec.type as any,
                        value: rec.value,
                        ttl: rec.ttl,
                        priority: rec.priority,
                      });
                      importedCount++;
                    } catch {}
                  }
                  console.log(`[startup] Imported ${importedCount} records for zone ${cz.domain}`);
                }
              }
            } catch (recError: any) {
              console.warn(`[startup] Failed to read records for zone ${cz.domain}: ${recError.message}`);
            }
          }

          synced++;
        } catch (err: any) {
          console.error(`[startup] Failed to sync zone ${cz.domain}: ${err.message}`);
          errors++;
        }
      }

      if (synced > 0 || errors > 0) {
        console.log(`[startup] Sync result: ${synced} synced, ${errors} failed`);
        await storage.insertLog({
          level: "INFO",
          source: "zones",
          message: `Auto-sync: ${synced} synced, ${errors} failed`,
        });
      }
    }
  } catch (e: any) {
    console.log(`[startup] Zone sync process failed: ${e.message}`);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  CONFIG
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.get("/api/config/:section", requireViewer, async (req: Request, res: Response) => {
    try {
      const section = String(req.params.section);
      // Validate section name to prevent path traversal
      if (!/^[a-zA-Z0-9_-]+$/.test(section)) {
        return res.status(400).json({ message: "Invalid section name" });
      }

      // Prefer BIND9 file content (show what's actually on the server)
      // Fall back to DB snapshot, then default template
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
        content = snapshot?.content || "";
      }

      if (!content) {
        content = getDefaultConfig(section as string);
      }

      res.json({ section, content });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/config/:section", requireAdmin, async (req: Request, res: Response) => {
    try {
      const section = req.params.section as string;
      // Validate section name to prevent path traversal
      if (!/^[a-zA-Z0-9_-]+$/.test(section)) {
        return res.status(400).json({ message: "Invalid section name" });
      }
      const { content } = configSectionContentSchema.parse(req.body);

      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }

      const configPath = path.posix.join(process.env.BIND9_CONF_DIR || "/etc/bind", `named.conf.${section}`);
      await bind9Service.assertWritablePath(configPath, `write named.conf.${section}`);
      await bind9Service.writeNamedConf(section, content);
      await bind9Service.reload();
      const snapshot = await storage.saveConfig(section, content);

      await storage.insertLog({
        level: "INFO",
        source: "config",
        message: `Configuration section '${section}' updated`,
      });

      res.json(snapshot);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  ROLLBACK â€” Restore BIND9 files from .bak backups
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.post("/api/rollback/:file", requireAdmin, async (req: Request, res: Response) => {
    try {
      const file = String(req.params.file);
      // Only allow known BIND9 config/zone file names to prevent path traversal
      const allowedFiles = [
        "named.conf", "named.conf.local", "named.conf.acls", "named.conf.keys", "named.conf.options",
        "db.rpz.intra",
      ];
      // Also allow db.* zone files
      if (!allowedFiles.includes(file) && !/^db\.[a-z0-9._-]+$/i.test(file)) {
        return res.status(400).json({ message: "Unknown file â€” rollback not allowed" });
      }
      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }
      const BIND9_CONF_DIR = process.env.BIND9_CONF_DIR || "/etc/bind";
      const BIND9_ZONE_DIR = bind9Service.getZoneDir() || process.env.BIND9_ZONE_DIR || "/var/cache/bind";
      // Determine path: zone files in zone dir, config files in conf dir
      const isZone = file.startsWith("db.");
      const filePath = isZone
        ? path.posix.join(BIND9_ZONE_DIR, file)
        : path.posix.join(BIND9_CONF_DIR, file);

      const restored = await bind9Service.restoreFromBackup(filePath);
      if (!restored) {
        return res.status(404).json({ message: `No .bak backup found for ${file}` });
      }
      // Validate + reload
      try {
        await bind9Service.reload();
      } catch (reloadErr: any) {
        // File restored but reload failed â€” still report success with warning
        await storage.insertLog({ level: "WARN", source: "rollback", message: `Restored ${file} from backup but reload failed: ${reloadErr.message}` });
        return res.json({ message: `Restored ${file} from backup but BIND9 reload failed`, warning: reloadErr.message });
      }
      await storage.insertLog({ level: "INFO", source: "rollback", message: `Restored ${file} from .bak backup and reloaded BIND9` });
      res.json({ message: `Restored ${file} from backup and reloaded BIND9` });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  WEBSOCKET â€” Live Logs (requires auth via cookie)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws/logs",
    verifyClient: (info: { origin: string; secure: boolean; req: any }, callback: (res: boolean, code?: number, message?: string) => void) => {
      const cookie = info.req.headers?.cookie || "";
      verifySessionCookie(cookie, callback);
    },
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[ws] Authenticated log client connected");

    storage.getLogs({ limit: 50 }).then((logs) => {
      ws.send(JSON.stringify({ type: "history", data: logs }));
    });

    ws.on("close", () => {
      console.log("[ws] Log client disconnected");
    });
  });

  // â”€â”€ Replication/Health WebSocket â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const replWss = new WebSocketServer({
    server: httpServer,
    path: "/ws/replication",
    verifyClient: (info: { origin: string; secure: boolean; req: any }, callback: (res: boolean, code?: number, message?: string) => void) => {
      // Same auth as log WS â€” cookie-based
      const cookie = info.req.headers?.cookie || "";
      verifySessionCookie(cookie, callback);
    },
  });

  replWss.on("connection", (ws: WebSocket) => {
    console.log("[ws] Replication monitor client connected");
    // Send current health snapshot
    storage.getHealthChecks(undefined, 50).then(checks => {
      ws.send(JSON.stringify({ type: "health-snapshot", data: checks }));
    });
    ws.on("close", () => {
      console.log("[ws] Replication monitor client disconnected");
    });
  });

  // Broadcast health check results to replication WS clients
  const originalRunCheck = healthService.runCheck.bind(healthService);
  healthService.runCheck = async function () {
    const results = await originalRunCheck();
    const message = JSON.stringify({ type: "health-update", data: results });
    replWss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    return results;
  };

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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  BIND9 LOG MONITORING
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  bind9Service.monitorLogFile(async (line) => {
    // Basic parsing to extract level if possible, else default to INFO
    let level: "INFO" | "WARN" | "ERROR" = "INFO";
    if (/error|fail/i.test(line)) level = "ERROR";
    else if (/warning/i.test(line)) level = "WARN";

    // Insert into storage (which broadcasts via WS)
    await storage.insertLog({
      level,
      source: "bind9",
      message: line.substring(0, 500),
    });
  });

  // Start periodic health checks (every 60s)
  healthService.start(60_000);

  // Start auto-backup scheduler (every 6 hours)
  backupService.start(6 * 60 * 60 * 1000);

  return httpServer;
}

// â”€â”€ Default config templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    allow-transfer { trusted-transfer; };
    allow-recursion { trusted-clients; };

    // Logging - Write to file for Admin Panel to read
    logging {
        channel default_file {
            file "named.run" versions 3 size 5m;
            severity dynamic;
            print-time yes;
        };
        category default { default_file; };
        category queries { default_file; };
    };
};`;
  }
  if (section === "local") {
    return `// Local zone definitions\n// Zones will be auto-generated by the admin panel\n`;
  }
  return `// Configuration section: ${section}\n`;
}

