import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import {
  insertReplicationServerSchema,
  updateReplicationServerSchema,
} from "@shared/schema";

import { replicationService } from "./replication-service";
import { sshManager } from "./ssh-manager";
import { storage } from "./storage";

type RegisterReplicationRoutesOptions = {
  app: Express;
  requireAdmin: RequestHandler;
  requireOperator: RequestHandler;
  safeError: (status: number, message: string) => string;
};

function maskReplicationSecrets<T extends { password?: string | null; privateKey?: string | null }>(server: T) {
  return {
    ...server,
    password: server.password ? "***" : "",
    privateKey: server.privateKey ? "***" : "",
  };
}

function getMissingAuthSecretMessage(
  authType: string | undefined,
  password: string | undefined | null,
  privateKey: string | undefined | null,
): string | null {
  if (authType === "password" && !password) {
    return "Password is required when authType is password";
  }
  if (authType === "key" && !privateKey) {
    return "Private key is required when authType is key";
  }
  return null;
}

export function registerReplicationRoutes({
  app,
  requireAdmin,
  requireOperator,
  safeError,
}: RegisterReplicationRoutesOptions) {
  app.get("/api/replication/stats", requireOperator, async (_req: Request, res: Response) => {
    try {
      const servers = await storage.getReplicationServers();
      const conflicts = await storage.getReplicationConflicts(false);
      const zones = await storage.getZones();
      const masterZones = zones.filter((zone) => zone.type === "master" && zone.status === "active");

      const enabled = servers.filter((server) => server.enabled);
      const connected = servers.filter((server) => server.lastSyncStatus === "success");
      const failed = servers.filter((server) => server.lastSyncStatus === "failed");
      const neverSynced = servers.filter((server) => server.lastSyncStatus === "never");

      res.json({
        totalServers: servers.length,
        enabledServers: enabled.length,
        connectedServers: connected.length,
        failedServers: failed.length,
        neverSyncedServers: neverSynced.length,
        totalZones: masterZones.length,
        unresolvedConflicts: conflicts.length,
        serialMismatches: conflicts.filter((conflict) => conflict.conflictType === "serial_mismatch").length,
        zoneMissing: conflicts.filter((conflict) => conflict.conflictType === "zone_missing").length,
        lastSyncAt: servers.reduce((latest: string | null, server) => {
          if (!server.lastSyncAt) return latest;
          if (!latest || server.lastSyncAt > latest) return server.lastSyncAt;
          return latest;
        }, null),
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/replication", requireOperator, async (_req: Request, res: Response) => {
    try {
      const servers = await storage.getReplicationServers();
      res.json(servers.map(maskReplicationSecrets));
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/replication", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertReplicationServerSchema.parse(req.body);
      const authError = getMissingAuthSecretMessage(data.authType, data.password, data.privateKey);
      if (authError) {
        return res.status(400).json({ message: authError });
      }

      const server = await storage.createReplicationServer({
        name: data.name,
        host: data.host,
        port: data.port,
        username: data.username,
        authType: data.authType,
        password: data.authType === "password" ? data.password : "",
        privateKey: data.authType === "key" ? data.privateKey : "",
        bind9ConfDir: data.bind9ConfDir || "/etc/bind",
        bind9ZoneDir: data.bind9ZoneDir || "",
        role: data.role || "slave",
        enabled: data.enabled !== false,
      });

      await storage.insertLog({
        level: "INFO",
        source: "replication",
        message: `Replication server '${data.name}' added (${data.host}:${data.port})`,
      });

      res.status(201).json(maskReplicationSecrets(server));
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/replication/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const existing = await storage.getReplicationServer(id);
      if (!existing) {
        return res.status(404).json({ message: "Server not found" });
      }

      const parsed = updateReplicationServerSchema.parse(req.body);
      const allowed: Record<string, unknown> = {};
      if (parsed.name !== undefined) allowed.name = parsed.name;
      if (parsed.host !== undefined) allowed.host = parsed.host;
      if (parsed.port !== undefined) allowed.port = parsed.port;
      if (parsed.username !== undefined) allowed.username = parsed.username;
      if (parsed.authType !== undefined) allowed.authType = parsed.authType;
      if (parsed.password !== undefined && parsed.password !== "***") allowed.password = parsed.password;
      if (parsed.privateKey !== undefined && parsed.privateKey !== "***") allowed.privateKey = parsed.privateKey;
      if (parsed.bind9ConfDir !== undefined) allowed.bind9ConfDir = parsed.bind9ConfDir;
      if (parsed.bind9ZoneDir !== undefined) allowed.bind9ZoneDir = parsed.bind9ZoneDir;
      if (parsed.role !== undefined) allowed.role = parsed.role;
      if (parsed.enabled !== undefined) allowed.enabled = parsed.enabled;

      const nextAuthType = parsed.authType ?? existing.authType;
      const hasPassword =
        typeof allowed.password === "string" ? allowed.password.length > 0 : Boolean(existing.password);
      const hasPrivateKey =
        typeof allowed.privateKey === "string" ? allowed.privateKey.length > 0 : Boolean(existing.privateKey);
      const authError = getMissingAuthSecretMessage(nextAuthType, hasPassword ? "set" : "", hasPrivateKey ? "set" : "");
      if (authError) {
        return res.status(400).json({ message: authError });
      }

      if (nextAuthType === "password") {
        allowed.privateKey = "";
      } else if (nextAuthType === "key") {
        allowed.password = "";
      }

      const updated = await storage.updateReplicationServer(id, allowed);
      res.json(maskReplicationSecrets(updated));
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/replication/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const deleted = await storage.deleteReplicationServer(id);
      if (!deleted) {
        return res.status(404).json({ message: "Server not found" });
      }

      await storage.insertLog({
        level: "WARN",
        source: "replication",
        message: `Replication server removed (id: ${id})`,
      });
      res.json({ message: "Server deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/replication/:id/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const server = await storage.getReplicationServer(id);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      const result = await sshManager.testConnection({
        host: server.host,
        port: server.port,
        username: server.username,
        authType: server.authType as "password" | "key",
        password: server.password || undefined,
        privateKey: server.privateKey || undefined,
      });

      await storage.updateReplicationSyncStatus(id, result.success ? "success" : "failed");
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/replication/sync", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await replicationService.syncAll();
      await storage.insertLog({
        level: "INFO",
        source: "replication",
        message: `Full sync completed: ${result.results.filter((item) => item.success).length}/${result.results.length} servers OK (${result.totalZones} zones, ${result.duration}ms)`,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/replication/sync/:zoneId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const zoneId = String(req.params.zoneId);
      const result = await replicationService.syncZone(zoneId);
      await storage.insertLog({
        level: "INFO",
        source: "replication",
        message: `Zone sync completed: ${result.results.filter((item) => item.success).length}/${result.results.length} servers OK`,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/replication/notify/:domain", requireAdmin, async (req: Request, res: Response) => {
    try {
      const domain = String(req.params.domain);
      if (!/^[a-zA-Z0-9._-]+$/.test(domain)) {
        return res.status(400).json({ message: "Invalid domain" });
      }
      await replicationService.notifyZone(domain);
      res.json({ message: `Notify sent for ${domain}` });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/replication/conflicts", requireOperator, async (req: Request, res: Response) => {
    try {
      const resolved =
        req.query.resolved === "true" ? true : req.query.resolved === "false" ? false : undefined;
      const conflicts = await storage.getReplicationConflicts(resolved);
      const servers = await storage.getReplicationServers();
      const serverMap = new Map(servers.map((server) => [server.id, server.name]));
      res.json(conflicts.map((conflict) => ({
        ...conflict,
        serverName: serverMap.get(conflict.serverId) || "Unknown",
      })));
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/replication/conflicts/detect", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const newConflicts = await replicationService.detectConflicts();
      res.json({ detected: newConflicts.length, conflicts: newConflicts });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/replication/conflicts/:id/resolve", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.resolveReplicationConflict(String(req.params.id));
      res.json({ message: "Conflict resolved" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/replication/conflicts/resolve-all", requireAdmin, async (_req: Request, res: Response) => {
    try {
      await storage.resolveAllReplicationConflicts();
      res.json({ message: "All conflicts resolved" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/replication/:serverId/bindings", requireOperator, async (req: Request, res: Response) => {
    try {
      const serverId = String(req.params.serverId);
      const bindings = await storage.getReplicationZoneBindings(serverId);
      const zones = await storage.getZones();
      const zoneMap = new Map(zones.map((zone) => [zone.id, zone.domain]));
      res.json(bindings.map((binding) => ({
        ...binding,
        zoneDomain: zoneMap.get(binding.zoneId) || "unknown",
      })));
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/replication/:serverId/bindings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = String(req.params.serverId);
      const { bindings } = req.body;
      if (!Array.isArray(bindings)) {
        return res.status(400).json({ message: "bindings must be an array" });
      }

      await storage.setReplicationZoneBindings(serverId, bindings);
      await storage.insertLog({
        level: "INFO",
        source: "replication",
        message: `Zone bindings updated for server ${serverId} (${bindings.length} zones)`,
      });
      res.json({ message: "Zone bindings updated" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });
}
