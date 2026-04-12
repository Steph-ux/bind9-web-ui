import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import os from "os";
import { storage } from "./storage";
import { bind9Service } from "./bind9-service";
import { sshManager } from "./ssh-manager";
import { firewallService } from "./firewall-service";
import { insertZoneSchema, insertDnsRecordSchema, insertAclSchema, insertTsigKeySchema, insertConnectionSchema, insertRpzEntrySchema } from "@shared/schema";
import { z } from "zod";

import { hashPassword } from "./auth";
import { insertUserSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Middleware to ensure user is authenticated
  const requireAuth = (req: Request, res: Response, next: Function) => {
    // Exclude auth routes (handled by setupAuth)
    if (req.path.startsWith("/api/auth")) return next();

    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  // Middleware to ensure user is admin
  const requireAdmin = (req: Request, res: Response, next: Function) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    if ((req.user as any).role !== "admin") return res.status(403).json({ message: "Forbidden" });
    next();
  };

  // Middleware to ensure user is admin or operator
  const requireOperator = (req: Request, res: Response, next: Function) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const role = (req.user as any).role;
    if (role !== "admin" && role !== "operator") return res.status(403).json({ message: "Forbidden" });
    next();
  };

  // Protect all API routes defined below
  app.use("/api", requireAuth);

  // ── Firewall Management (Admin Only) ──────────────────────────
  app.get("/api/firewall/status", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const status = await firewallService.getStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/firewall/toggle", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { enable } = req.body;
      if (typeof enable !== "boolean") return res.status(400).json({ message: "enable must be a boolean" });
      await firewallService.toggle(enable);
      res.json({ message: `Firewall ${enable ? 'enabled' : 'disabled'}` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/firewall/backend", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { backend } = req.body;
      const ALLOWED_BACKENDS = ["ufw", "firewalld", "iptables", "nftables", "none"];
      if (!backend) return res.status(400).json({ message: "Backend is required" });
      if (!ALLOWED_BACKENDS.includes(backend)) return res.status(400).json({ message: `Invalid backend. Allowed: ${ALLOWED_BACKENDS.join(", ")}` });
      firewallService.setBackend(backend);
      const status = await firewallService.getStatus();
      res.json({ message: `Switched to ${backend}`, status });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/firewall/rules", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { rules } = await firewallService.getStatus();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/firewall/rules", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { toPort, proto, action, fromIp } = req.body;
      if (!toPort) return res.status(400).json({ message: "Port is required" });
      const ALLOWED_PROTOS = ["tcp", "udp", "any"];
      const ALLOWED_ACTIONS = ["allow", "deny", "reject"];
      if (proto && !ALLOWED_PROTOS.includes(proto)) return res.status(400).json({ message: `Invalid protocol. Allowed: ${ALLOWED_PROTOS.join(", ")}` });
      if (action && !ALLOWED_ACTIONS.includes(action)) return res.status(400).json({ message: `Invalid action. Allowed: ${ALLOWED_ACTIONS.join(", ")}` });

      await firewallService.addRule(toPort, proto || "tcp", action || "allow", fromIp || "any");
      res.json({ message: "Rule added" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/firewall/rules/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id));
      await firewallService.deleteRule(id);
      res.json({ message: "Rule deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── DNS Firewall (RPZ) ────────────────────────────────────────
  app.get("/api/rpz", requireOperator, async (_req: Request, res: Response) => {
    try {
      const entries = await storage.getRpzEntries();
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/rpz", requireOperator, async (req: Request, res: Response) => {
    try {
      // Validate input
      const data = insertRpzEntrySchema.parse(req.body);

      // Create in DB
      const entry = await storage.createRpzEntry(data);

      // Sync to BIND9
      const allEntries = await storage.getRpzEntries();
      const zoneEntries = allEntries.map(e => ({
        name: e.name,
        type: e.type,
        target: e.target || undefined
      }));

      await bind9Service.ensureRpzConfigured(); // Ensure config exists
      await bind9Service.writeRpzZone("rpz.intra", zoneEntries);
      await bind9Service.reload();

      res.json(entry);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/rpz/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      await storage.deleteRpzEntry(id);

      // Sync to BIND9
      const allEntries = await storage.getRpzEntries();
      const zoneEntries = allEntries.map(e => ({
        name: e.name,
        type: e.type,
        target: e.target || undefined
      }));

      await bind9Service.ensureRpzConfigured();
      await bind9Service.writeRpzZone("rpz.intra", zoneEntries);
      await bind9Service.reload();

      res.json({ message: "Entry deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });


  // ── Users Management (Admin Only) ─────────────────────────────
  app.get("/api/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const users = await storage.getUsers();
      // Remove passwords
      const safeUsers = users.map(u => {
        const { password, ...rest } = u;
        return rest;
      });
      res.json(safeUsers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const existing = await storage.getUserByUsername(data.username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(data.password);
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
      });

      const { password, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { password, role, username, mustChangePassword } = req.body;

      const ALLOWED_ROLES = ["admin", "operator", "viewer"];
      const updateData: any = {};
      if (role) {
        if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ message: `Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}` });
        updateData.role = role;
      }
      if (password) {
        if (password.length < 4) return res.status(400).json({ message: "Password must be at least 4 characters" });
        updateData.password = await hashPassword(password);
        updateData.mustChangePassword = false;
      }
      if (username !== undefined) updateData.username = String(username);
      if (mustChangePassword !== undefined) updateData.mustChangePassword = !!mustChangePassword;

      const updated = await storage.updateUser(id, updateData);
      // exclude password
      const { password: _, ...safe } = updated;
      res.json(safe);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/users/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (id === (req.user as any).id) {
        return res.status(400).json({ message: "Cannot delete yourself" });
      }
      await storage.deleteUser(id);
      res.json({ message: "User deleted" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });




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

  // ── Auto-sync ACLs and Keys on startup ────────────────────────
  try {
    if (await bind9Service.isAvailable()) {
      console.log("[startup] Syncing ACLs and Keys...");

      // 1. Import existing ACLs from file if DB is empty or missing them
      const existingAcls = await bind9Service.syncAclsFromConfig();
      const currentDbAcls = await storage.getAcls();

      for (const fileAcl of existingAcls) {
        if (!currentDbAcls.find(a => a.name === fileAcl.name)) {
          console.log(`[startup] Importing ACL '${fileAcl.name}' from named.conf.acls`);
          await storage.createAcl({
            name: fileAcl.name,
            networks: fileAcl.networks,
            comment: "Imported from named.conf.acls"
          });
        }
      }

      // 2. Write back to ensuring loose consistency
      const allAcls = await storage.getAcls();
      await bind9Service.writeAclsConf(allAcls);

      // 3. Import existing Keys from file (recursively) if DB is empty or missing them
      const existingKeys = await bind9Service.syncKeysFromConfig();
      const currentDbKeys = await storage.getKeys();

      for (const fileKey of existingKeys) {
        if (!currentDbKeys.find(k => k.name === fileKey.name)) {
          console.log(`[startup] Importing Key '${fileKey.name}' from config`);
          await storage.createKey({
            name: fileKey.name,
            algorithm: fileKey.algorithm as any,
            secret: fileKey.secret
          });
        }
      }

      // 4. Write back keys
      const allKeys = await storage.getKeys();
      await bind9Service.writeKeysConf(allKeys);
      await bind9Service.ensureConfigIncludes();
      await bind9Service.rndc("reconfig");
      console.log("[startup] ACLs and Keys synced");
    }
  } catch (e: any) {
    console.log(`[startup] Failed to sync ACLs/Keys: ${e.message}`);
  }

  // ── Auto-sync zones from BIND9 config on startup ──────────────
  try {
    if (await bind9Service.isAvailable()) {
      console.log("[startup] Starting zone sync...");
      const configZones = await bind9Service.syncZonesFromConfig();
      let synced = 0;
      let errors = 0;

      for (const cz of configZones) {
        try {
          // Check if supported type
          if (!["master", "slave", "forward"].includes(cz.type)) {
            console.log(`[startup] Skipping zone ${cz.domain}: unsupported type '${cz.type}'`);
            continue;
          }

          const existing = await storage.getZones();
          const found = existing.find(z => z.domain === cz.domain);

          if (!found) {
            const zone = await storage.createZone({
              domain: cz.domain,
              type: cz.type as any,
            });
            // Update filePath
            await storage.updateZone(zone.id, { filePath: cz.filePath });
            synced++;
          }
        } catch (err: any) {
          console.error(`[startup] Failed to sync zone ${cz.domain}: ${err.message}`);
          errors++;
        }
      }

      if (synced > 0 || errors > 0) {
        console.log(`[startup] Sync result: ${synced} imported, ${errors} failed`);
        await storage.insertLog({
          level: "INFO",
          source: "zones",
          message: `Auto-sync: ${synced} imported, ${errors} failed`,
        });
      }
    }
  } catch (e: any) {
    console.log(`[startup] Zone sync process failed: ${e.message}`);
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

  /** Sync zones from BIND9 config files into the database */
  /** Sync zones from BIND9 config files into the database */
  app.post("/api/zones/sync", requireOperator, async (_req: Request, res: Response) => {
    try {
      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }

      console.log("[api] Starting manual zone sync");
      const configZones = await bind9Service.syncZonesFromConfig();
      const existingZones = await storage.getZones();
      let synced = 0;
      let skipped = 0;
      let errors = 0;

      for (const cz of configZones) {
        try {
          // Check if supported type
          if (!["master", "slave", "forward"].includes(cz.type)) {
            console.log(`[api] Skipping zone ${cz.domain}: unsupported type '${cz.type}'`);
            skipped++;
            continue;
          }

          let zoneId = "";
          const found = existingZones.find(z => z.domain === cz.domain);

          if (found) {
            console.log(`[api] Zone ${cz.domain} exists, updating details...`);
            zoneId = found.id;
            await storage.updateZone(found.id, { filePath: cz.filePath });
          } else {
            const newZone = await storage.createZone({
              domain: cz.domain,
              type: cz.type as any,
            });
            zoneId = newZone.id;
            await storage.updateZone(newZone.id, { filePath: cz.filePath });
          }

          // Import records from zone file
          if (cz.filePath) {
            try {
              const records = await bind9Service.readZoneFile(cz.filePath);

              if (records.length > 0) {
                // Delete existing records
                const currentRecords = await storage.getRecords(zoneId);
                for (const r of currentRecords) {
                  await storage.deleteRecord(r.id);
                }

                let importedCount = 0;
                for (const rec of records) {
                  if (rec.type === "SOA") continue;
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
                  } catch { }
                }
                console.log(`[api] Imported ${importedCount} records for zone ${cz.domain}`);
              } else {
                console.log(`[api] No records found for zone ${cz.domain} (or parsing failed)`);
              }
            } catch (recError: any) {
              console.warn(`[api] Failed to read records for zone ${cz.domain}: ${recError.message}`);
            }
          }
          synced++;
        } catch (zoneError: any) {
          console.error(`[api] Failed to sync zone ${cz.domain}: ${zoneError.message}`);
          errors++;
        }
      }

      await storage.insertLog({
        level: "INFO",
        source: "zones",
        message: `Zone sync: ${synced} imported, ${skipped} skipped, ${errors} failed, ${configZones.length} total found`,
      });

      res.json({
        message: `Synced ${synced} zones, ${skipped} skipped (exist or unsupported), ${errors} failed`,
        total: configZones.length,
        synced,
        skipped,
      });

    } catch (error: any) {
      console.error(`[api] Sync fatal error: ${error.message}`);
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

  app.post("/api/zones", requireOperator, async (req: Request, res: Response) => {
    try {
      // Validate schema (allowing extra fields not in DB schema)
      const data = insertZoneSchema.parse(req.body);

      // Extract extra fields
      const { autoReverse, network } = req.body;

      // 1. Create the requested zone
      const zone = await storage.createZone(data);

      try {
        if (await bind9Service.isAvailable()) {
          // Write empty zone file
          await bind9Service.writeZoneFile(zone.filePath, zone.domain, [], zone.serial);

          // Add to named.conf.local
          await bind9Service.addZoneToConfig(zone.domain, zone.type, zone.filePath);
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

      // 2. Handle Auto-Reverse Zone
      if (autoReverse && network && zone.type === "master") {
        try {
          // Calculate reverse domain: 192.168.1 -> 1.168.192.in-addr.arpa
          const parts = network.split(".").filter(Boolean);
          const reverseDomain = parts.reverse().join(".") + ".in-addr.arpa";

          // Check if already exists
          const existing = await storage.getZones();
          if (!existing.find(z => z.domain === reverseDomain)) {

            const reverseZone = await storage.createZone({
              domain: reverseDomain,
              type: "master",
              adminEmail: zone.adminEmail,
            });

            if (await bind9Service.isAvailable()) {
              // Write empty zone file for reverse
              await bind9Service.writeZoneFile(reverseZone.filePath, reverseZone.domain, [], reverseZone.serial);
              // Add to named.conf.local
              await bind9Service.addZoneToConfig(reverseZone.domain, "master", reverseZone.filePath);
            }

            await storage.insertLog({
              level: "INFO",
              source: "zones",
              message: `Auto-created reverse zone ${reverseDomain} for network ${network}`,
            });
          }
        } catch (revError: any) {
          await storage.insertLog({
            level: "WARN",
            source: "zones",
            message: `Failed to auto-create reverse zone: ${revError.message}`,
          });
        }
      }

      // Reload BIND9 once at the end
      if (await bind9Service.isAvailable()) {
        await bind9Service.reload();
      }

      res.status(201).json(zone);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/zones/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      // Only allow specific fields to be updated
      const allowed: Record<string, any> = {};
      const { domain, type, status, adminEmail, filePath } = req.body;
      if (domain !== undefined) allowed.domain = String(domain);
      if (type !== undefined) allowed.type = String(type);
      if (status !== undefined) allowed.status = String(status);
      if (adminEmail !== undefined) allowed.adminEmail = String(adminEmail);
      if (filePath !== undefined) allowed.filePath = String(filePath);
      const updated = await storage.updateZone(id, allowed);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/zones/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      await storage.deleteZone(id);

      // Remove from named.conf.local
      try {
        if (await bind9Service.isAvailable()) {
          await bind9Service.removeZoneFromConfig(zone.domain);
          await bind9Service.reload();
        }
      } catch (e: any) {
        console.error(`[api] Failed to remove zone from config: ${e.message}`);
      }

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
  // Helper to write zone changes to disk and reload
  const syncZoneFile = async (zoneId: string) => {
    try {
      const zone = await storage.getZone(zoneId);
      if (!zone || !zone.filePath) return;

      const records = await storage.getRecords(zoneId);
      const serial = new Date().toISOString().slice(0, 10).replace(/-/g, "") +
        String(Math.floor(Math.random() * 99) + 1).padStart(2, "0");

      // Update serial in DB
      await storage.updateZone(zone.id, { serial });

      // Build record list for bind9 service
      const zoneRecords = records.map(r => ({
        name: r.name,
        type: r.type,
        value: r.value,
        ttl: r.ttl,
        priority: r.priority || undefined,
      }));

      // Write file
      await bind9Service.writeZoneFile(
        zone.filePath,
        zone.domain,
        zoneRecords,
        serial,
        { adminEmail: zone.adminEmail || undefined }
      );

      // Reload zone
      await bind9Service.rndc(`reload ${zone.domain}`);
      console.log(`[bind9] Zone ${zone.domain} updated and reloaded`);
    } catch (error: any) {
      console.error(`[bind9] Failed to sync zone file: ${error.message}`);
      // Don't throw, just log. The DB is updated.
    }
  };

  /**
   * Automatically manage PTR records when A/AAAA records change
   */
  const updateReverseRecord = async (
    action: "create" | "update" | "delete",
    record: { name: string; type: string; value: string; zoneId: string },
    oldRecord?: { name: string; type: string; value: string; zoneId: string }
  ) => {
    try {
      // Only handle A/AAAA records
      if (!["A", "AAAA"].includes(record.type)) return;

      // Calculate reverse IP
      let reverseIp = "";
      if (record.type === "A") {
        const parts = record.value.split(".");
        if (parts.length === 4) {
          reverseIp = `${parts[3]}.${parts[2]}.${parts[1]}.${parts[0]}.in-addr.arpa`;
        }
      } else if (record.type === "AAAA") {
        // Simplified AAAA handling (often too complex given variations, but basic support)
        // For now, let's focus on A records as requested by user context ("192.168...")
        // TODO: Add full IPv6 expansion logic if needed
        return;
      }

      if (!reverseIp) return;

      // Find best matching reverse zone
      const zones = await storage.getZones();
      // Sort zones by length desc to find most specific match
      const reverseZones = zones.filter(z => z.domain.endsWith(".arpa")).sort((a, b) => b.domain.length - a.domain.length);

      const targetZone = reverseZones.find(z => reverseIp.endsWith(z.domain));
      if (!targetZone) {
        console.log(`[auto-reverse] No matching reverse zone found for ${reverseIp}`);
        return;
      }

      // Calculate PTR name (relative to zone)
      // e.g. reverseIp = 10.5.168.192.in-addr.arpa
      // targetZone = 5.168.192.in-addr.arpa
      // ptrName = 10
      const ptrName = reverseIp.slice(0, reverseIp.length - targetZone.domain.length - 1); // -1 for dot
      const sourceZone = zones.find(z => z.id === record.zoneId);

      let fqdn = record.name;
      if (sourceZone) {
        fqdn = record.name === "@" ? sourceZone.domain : `${record.name}.${sourceZone.domain}`;
      }

      // Ensure FQDN ends with dot
      const ptrValue = fqdn.endsWith(".") ? fqdn : `${fqdn}.`;

      console.log(`[auto-reverse] ${action.toUpperCase()} PTR ${ptrName} in ${targetZone.domain} -> ${ptrValue}`);

      const existingRecords = await storage.getRecords(targetZone.id);

      if (action === "create") {
        // Check specific PTR
        const exists = existingRecords.find(r => r.name === ptrName && r.value === ptrValue && r.type === "PTR");
        if (!exists) {
          await storage.createRecord({
            zoneId: targetZone.id,
            name: ptrName,
            type: "PTR",
            value: ptrValue,
            ttl: 3600,
          });
          await syncZoneFile(targetZone.id);
        } else {
          console.log(`[auto-reverse] PTR ${ptrName} -> ${ptrValue} already exists. Skipping.`);
        }
      } else if (action === "update") {
        // If IP changed, delete old PTR and create new
        if (oldRecord && oldRecord.value !== record.value) {
          await updateReverseRecord("delete", oldRecord);
          await updateReverseRecord("create", record);
          return;
        }

        // If name changed, we need to find the OLD PTR record and update it
        if (oldRecord && oldRecord.name !== record.name) {
          const oldFqdn = sourceZone ? (oldRecord.name === "@" ? sourceZone.domain : `${oldRecord.name}.${sourceZone.domain}`) : oldRecord.name;
          const oldPtrValue = oldFqdn.endsWith(".") ? oldFqdn : `${oldFqdn}.`;

          const targetRecord = existingRecords.find(r => r.name === ptrName && r.type === "PTR" && r.value === oldPtrValue);
          if (targetRecord) {
            await storage.updateRecord(targetRecord.id, { value: ptrValue });
            await syncZoneFile(targetZone.id);
          }
        }
      } else if (action === "delete") {
        const targetRecord = existingRecords.find(r => r.name === ptrName && r.type === "PTR" && r.value === ptrValue);
        if (targetRecord) {
          await storage.deleteRecord(targetRecord.id);
          await syncZoneFile(targetZone.id);
        }
      }

    } catch (e: any) {
      console.error(`[auto-reverse] Failed: ${e.message}`);
    }
  };

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

  app.post("/api/zones/:id/records", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });

      const data = insertDnsRecordSchema.parse({ ...req.body, zoneId: id });
      const record = await storage.createRecord(data);

      await storage.insertLog({
        level: "INFO",
        source: "records",
        message: `Record ${record.name} ${record.type} ${record.value} added to ${zone.domain}`,
      });

      // Sync changes to disk
      await syncZoneFile(id);

      // Auto-update reverse DNS
      updateReverseRecord("create", record);

      res.status(201).json(record);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/records/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const record = await storage.getRecord(id);
      if (!record) return res.status(404).json({ message: "Record not found" });
      // Only allow specific fields to be updated
      const allowed: Record<string, any> = {};
      const { name, type, value, ttl, priority } = req.body;
      if (name !== undefined) allowed.name = String(name);
      if (type !== undefined) allowed.type = String(type);
      if (value !== undefined) allowed.value = String(value);
      if (ttl !== undefined) allowed.ttl = parseInt(ttl, 10) || 3600;
      if (priority !== undefined) allowed.priority = parseInt(priority, 10) || null;
      const updated = await storage.updateRecord(id, allowed);

      // Sync changes to disk
      await syncZoneFile(record.zoneId);

      // Auto-update reverse DNS
      updateReverseRecord("update", updated, record);

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/records/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const record = await storage.getRecord(id);
      if (!record) return res.status(404).json({ message: "Record not found" });

      await storage.deleteRecord(id);

      // Sync changes to disk
      await syncZoneFile(record.zoneId);

      // Auto-update reverse DNS
      updateReverseRecord("delete", record);

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
      const section = String(req.params.section);
      // Validate section name to prevent path traversal
      if (!/^[a-zA-Z0-9_-]+$/.test(section)) {
        return res.status(400).json({ message: "Invalid section name" });
      }

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

  app.put("/api/config/:section", requireAdmin, async (req: Request, res: Response) => {
    try {
      const section = req.params.section as string;
      // Validate section name to prevent path traversal
      if (!/^[a-zA-Z0-9_-]+$/.test(section)) {
        return res.status(400).json({ message: "Invalid section name" });
      }
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

  app.post("/api/acls", requireOperator, async (req: Request, res: Response) => {
    try {
      const data = insertAclSchema.parse(req.body);
      const acl = await storage.createAcl(data);

      await storage.insertLog({
        level: "INFO",
        source: "security",
        message: `ACL '${acl.name}' created with networks: ${acl.networks}`,
      });

      // Sync to BIND9
      try {
        if (await bind9Service.isAvailable()) {
          const allAcls = await storage.getAcls();
          await bind9Service.writeAclsConf(allAcls);
          await bind9Service.rndc("reconfig");
        }
      } catch (e: any) {
        console.error(`[bind9] Failed to sync ACLs: ${e.message}`);
      }

      res.status(201).json(acl);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/acls/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const acl = await storage.getAcl(id);
      if (!acl) return res.status(404).json({ message: "ACL not found" });
      // Only allow specific fields to be updated
      const allowed: Record<string, any> = {};
      const { name, networks, comment } = req.body;
      if (name !== undefined) allowed.name = String(name);
      if (networks !== undefined) allowed.networks = String(networks);
      if (comment !== undefined) allowed.comment = String(comment);
      const updated = await storage.updateAcl(id, allowed);

      // Sync to BIND9
      try {
        if (await bind9Service.isAvailable()) {
          const allAcls = await storage.getAcls();
          await bind9Service.writeAclsConf(allAcls);
          await bind9Service.rndc("reconfig");
        }
      } catch (e: any) {
        console.error(`[bind9] Failed to sync ACLs: ${e.message}`);
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/acls/:id", requireOperator, async (req: Request, res: Response) => {
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

      // Sync to BIND9
      try {
        if (await bind9Service.isAvailable()) {
          const allAcls = await storage.getAcls();
          await bind9Service.writeAclsConf(allAcls);
          await bind9Service.rndc("reconfig");
        }
      } catch (e: any) {
        console.error(`[bind9] Failed to sync ACLs: ${e.message}`);
      }

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
      // Hide secrets
      const safeKeys = keys.map(k => ({
        ...k,
        secret: k.secret.slice(0, 5) + "...[hidden]"
      }));
      res.json(safeKeys);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/keys", requireOperator, async (req: Request, res: Response) => {
    try {
      const data = insertTsigKeySchema.parse(req.body);
      const key = await storage.createKey(data);

      await storage.insertLog({
        level: "INFO",
        source: "security",
        message: `TSIG key '${key.name}' created`,
      });

      // Sync to BIND9
      try {
        if (await bind9Service.isAvailable()) {
          const allKeys = await storage.getKeys();
          await bind9Service.writeKeysConf(allKeys);
          await bind9Service.rndc("reconfig");
        }
      } catch (e: any) {
        console.error(`[bind9] Failed to sync Keys: ${e.message}`);
      }

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

  app.delete("/api/keys/:id", requireOperator, async (req: Request, res: Response) => {
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

      // Sync to BIND9
      try {
        if (await bind9Service.isAvailable()) {
          const allKeys = await storage.getKeys();
          await bind9Service.writeKeysConf(allKeys);
          await bind9Service.rndc("reconfig");
        }
      } catch (e: any) {
        console.error(`[bind9] Failed to sync Keys: ${e.message}`);
      }

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
        limit: req.query.limit ? Math.min(parseInt(req.query.limit as string) || 200, 1000) : 200,
      };
      // Combine app logs with real BIND9 logs
      const appLogs = await storage.getLogs(filter);

      let bind9Logs: typeof appLogs = [];
      try {
        if (await bind9Service.isAvailable()) {
          const raw = await bind9Service.readBind9Logs(filter.limit || 200);
          bind9Logs = raw.map(l => ({
            id: `bind9-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ...l,
            level: l.level as "INFO" | "WARN" | "ERROR" | "DEBUG",
          }));

          // Apply filters to BIND9 logs too
          if (filter.level) {
            bind9Logs = bind9Logs.filter(l => l.level === filter.level);
          }
          if (filter.source && filter.source !== "app") {
            bind9Logs = bind9Logs.filter(l => l.source === filter.source);
          }
          if (filter.search) {
            const q = filter.search.toLowerCase();
            bind9Logs = bind9Logs.filter(l => l.message.toLowerCase().includes(q));
          }
        }
      } catch { }

      // If source=app, only show app logs
      if (filter.source === "app") {
        return res.json(appLogs);
      }

      // Merge and sort by timestamp desc
      const all = [...appLogs, ...bind9Logs]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, filter.limit || 200);

      res.json(all);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /** Get only real BIND9 daemon logs */
  app.get("/api/logs/bind9", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string) || 200, 1000) : 200;
      const logs = await bind9Service.readBind9Logs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/logs", requireAdmin, async (_req: Request, res: Response) => {
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

  app.post("/api/connections", requireAdmin, async (req: Request, res: Response) => {
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

  app.put("/api/connections/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const conn = await storage.getConnection(id);
      if (!conn) return res.status(404).json({ message: "Connection not found" });

      // Only allow specific fields to be updated
      const allowed: Record<string, any> = {};
      const { name, host, port, username, authType, password, privateKey, bind9ConfDir, bind9ZoneDir, rndcBin } = req.body;
      if (name !== undefined) allowed.name = String(name);
      if (host !== undefined) allowed.host = String(host);
      if (port !== undefined) allowed.port = parseInt(port, 10) || 22;
      if (username !== undefined) allowed.username = String(username);
      if (authType !== undefined) allowed.authType = String(authType);
      if (bind9ConfDir !== undefined) allowed.bind9ConfDir = String(bind9ConfDir);
      if (bind9ZoneDir !== undefined) allowed.bind9ZoneDir = String(bind9ZoneDir);
      if (rndcBin !== undefined) allowed.rndcBin = String(rndcBin);
      // Don't overwrite password/key if they come as "***"
      if (password !== undefined && password !== "***") allowed.password = String(password);
      if (privateKey !== undefined && privateKey !== "***") allowed.privateKey = String(privateKey);

      const updated = await storage.updateConnection(id, allowed);
      res.json({
        ...updated,
        password: updated.password ? "***" : "",
        privateKey: updated.privateKey ? "***" : "",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/connections/:id", requireAdmin, async (req: Request, res: Response) => {
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
  app.post("/api/connections/:id/test", requireAdmin, async (req: Request, res: Response) => {
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
  app.post("/api/connections/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { host, port, username, authType, password, privateKey } = req.body;
      if (!host || !username) {
        return res.status(400).json({ message: "host and username are required" });
      }
      // Validate host: prevent SSRF — only allow hostnames/IPs, no schemes or internal addrs
      const safeHost = String(host).trim();
      if (!/^[a-zA-Z0-9.:-]+$/.test(safeHost)) {
        return res.status(400).json({ message: "Invalid host format" });
      }
      const safePort = parseInt(port, 10) || 22;
      if (safePort < 1 || safePort > 65535) {
        return res.status(400).json({ message: "Invalid port number" });
      }
      const safeAuthType = authType === "key" ? "key" : "password";

      const result = await sshManager.testConnection({
        host: safeHost,
        port: safePort,
        username: String(username),
        authType: safeAuthType,
        password: password ? String(password) : undefined,
        privateKey: privateKey ? String(privateKey) : undefined,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /** Activate a connection — switches bind9-service to SSH mode */
  app.put("/api/connections/:id/activate", requireAdmin, async (req: Request, res: Response) => {
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
  app.put("/api/connections/deactivate", requireAdmin, async (_req: Request, res: Response) => {
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
  //  WEBSOCKET — Live Logs (requires auth via cookie)
  // ══════════════════════════════════════════════════════════════
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws/logs",
    verifyClient: (info: { origin: string; secure: boolean; req: any }, callback: (res: boolean, code?: number, message?: string) => void) => {
      // WS upgrade requests bypass Express middleware, so we verify
      // the session cookie by making an internal HTTP request
      const cookie = info.req.headers?.cookie || "";
      if (!cookie.includes("connect.sid")) {
        return callback(false, 4001, "Authentication required");
      }
      // Verify session by making an internal request to /api/auth/me
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

  // ══════════════════════════════════════════════════════════════
  //  BIND9 LOG MONITORING
  // ══════════════════════════════════════════════════════════════
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
