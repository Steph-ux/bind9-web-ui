import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { insertConnectionSchema, updateConnectionSchema } from "@shared/schema";

import { bind9Service } from "./bind9-service";
import { sshManager } from "./ssh-manager";
import { storage } from "./storage";

type RegisterConnectionRoutesOptions = {
  app: Express;
  requireAdmin: RequestHandler;
  requireAuth: RequestHandler;
  safeError: (status: number, message: string) => string;
  refreshAclsFromBind: () => Promise<unknown>;
  refreshKeysFromBind: () => Promise<unknown>;
};

function maskConnectionSecrets<T extends { password?: string | null; privateKey?: string | null }>(connection: T) {
  return {
    ...connection,
    password: connection.password ? "***" : "",
    privateKey: connection.privateKey ? "***" : "",
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

export function registerConnectionRoutes({
  app,
  requireAdmin,
  requireAuth,
  safeError,
  refreshAclsFromBind,
  refreshKeysFromBind,
}: RegisterConnectionRoutesOptions) {
  app.get("/api/connections", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const connections = await storage.getConnections();
      res.json(connections.map(maskConnectionSecrets));
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/connections", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertConnectionSchema.parse(req.body);
      const authError = getMissingAuthSecretMessage(data.authType, data.password, data.privateKey);
      if (authError) {
        return res.status(400).json({ message: authError });
      }

      const connection = await storage.createConnection(data);

      await storage.insertLog({
        level: "INFO",
        source: "connections",
        message: `Connection '${connection.name}' created (${connection.host}:${connection.port})`,
      });

      res.status(201).json(maskConnectionSecrets(connection));
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/connections/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const connection = await storage.getConnection(id);
      if (!connection) {
        return res.status(404).json({ message: "Connection not found" });
      }

      const parsed = updateConnectionSchema.parse(req.body);
      const allowed: Record<string, unknown> = {};
      if (parsed.name !== undefined) allowed.name = parsed.name;
      if (parsed.host !== undefined) allowed.host = parsed.host;
      if (parsed.port !== undefined) allowed.port = parsed.port;
      if (parsed.username !== undefined) allowed.username = parsed.username;
      if (parsed.authType !== undefined) allowed.authType = parsed.authType;
      if (parsed.bind9ConfDir !== undefined) allowed.bind9ConfDir = parsed.bind9ConfDir;
      if (parsed.bind9ZoneDir !== undefined) allowed.bind9ZoneDir = parsed.bind9ZoneDir;
      if (parsed.rndcBin !== undefined) allowed.rndcBin = parsed.rndcBin;
      if (parsed.password !== undefined && parsed.password !== "***") allowed.password = parsed.password;
      if (parsed.privateKey !== undefined && parsed.privateKey !== "***") allowed.privateKey = parsed.privateKey;

      const nextAuthType = parsed.authType ?? connection.authType;
      const hasPassword =
        typeof allowed.password === "string" ? allowed.password.length > 0 : Boolean(connection.password);
      const hasPrivateKey =
        typeof allowed.privateKey === "string" ? allowed.privateKey.length > 0 : Boolean(connection.privateKey);
      const authError = getMissingAuthSecretMessage(nextAuthType, hasPassword ? "set" : "", hasPrivateKey ? "set" : "");
      if (authError) {
        return res.status(400).json({ message: authError });
      }

      const updated = await storage.updateConnection(id, allowed);

      if (
        sshManager.isConnected(id) &&
        (allowed.host || allowed.port || allowed.username || allowed.password || allowed.privateKey || allowed.authType)
      ) {
        sshManager.unregister(id);
        sshManager.register(id, {
          host: updated.host,
          port: updated.port,
          username: updated.username,
          authType: updated.authType as "password" | "key",
          password: updated.password || undefined,
          privateKey: updated.privateKey || undefined,
        });
        try {
          await sshManager.connectById(id);
        } catch (error: any) {
          console.log(`[connections] Reconnect failed for ${updated.name}: ${error.message}`);
        }
      }

      res.json(maskConnectionSecrets(updated));
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/connections/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const connection = await storage.getConnection(id);
      if (!connection) {
        return res.status(404).json({ message: "Connection not found" });
      }

      if (connection.isActive) {
        bind9Service.configure({ mode: "local" });
      }
      sshManager.unregister(id);

      await storage.deleteConnection(id);
      await storage.insertLog({
        level: "WARN",
        source: "connections",
        message: `Connection '${connection.name}' deleted`,
      });

      res.json({ message: "Connection deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/connections/:id/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const connection = await storage.getConnection(id);
      if (!connection) {
        return res.status(404).json({ message: "Connection not found" });
      }

      const result = await sshManager.testConnection({
        host: connection.host,
        port: connection.port,
        username: connection.username,
        authType: connection.authType as "password" | "key",
        password: connection.password || undefined,
        privateKey: connection.privateKey || undefined,
      });

      if (result.success && result.serverInfo) {
        const updates: Record<string, string> = {
          lastStatus: "connected",
        };
        if (!connection.bind9ConfDir && result.serverInfo.confDir) {
          updates.bind9ConfDir = result.serverInfo.confDir;
        }
        if (!connection.bind9ZoneDir && result.serverInfo.zoneDir) {
          updates.bind9ZoneDir = result.serverInfo.zoneDir;
        }
        await storage.updateConnection(id, updates);
      } else {
        await storage.updateConnection(id, { lastStatus: "failed" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/connections/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { host, port, username, authType, password, privateKey } = req.body;
      if (!host || !username) {
        return res.status(400).json({ message: "host and username are required" });
      }

      const safeHost = String(host).trim();
      if (!/^[a-zA-Z0-9.:-]+$/.test(safeHost)) {
        return res.status(400).json({ message: "Invalid host format" });
      }

      const safePort = parseInt(port, 10) || 22;
      if (safePort < 1 || safePort > 65535) {
        return res.status(400).json({ message: "Invalid port number" });
      }

      const safeAuthType = authType === "key" ? "key" : "password";
      const authError = getMissingAuthSecretMessage(
        safeAuthType,
        password ? String(password) : "",
        privateKey ? String(privateKey) : "",
      );
      if (authError) {
        return res.status(400).json({ message: authError });
      }

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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/connections/:id/activate", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const connection = await storage.getConnection(id);
      if (!connection) {
        return res.status(404).json({ message: "Connection not found" });
      }

      sshManager.register(id, {
        host: connection.host,
        port: connection.port,
        username: connection.username,
        authType: connection.authType as "password" | "key",
        password: connection.password || undefined,
        privateKey: connection.privateKey || undefined,
      });

      try {
        await sshManager.connectById(id);
      } catch (error: any) {
        sshManager.unregister(id);
        await storage.updateConnection(id, { lastStatus: "failed" });
        return res.status(502).json({ message: safeError(502, `SSH connection failed: ${error.message}`) });
      }

      sshManager.setActive(id);
      bind9Service.configure({
        mode: "ssh",
        confDir: connection.bind9ConfDir || undefined,
        zoneDir: connection.bind9ZoneDir || undefined,
        rndcBin: connection.rndcBin || undefined,
      });

      const activated = await storage.activateConnection(id);
      await storage.updateConnection(id, { lastStatus: "connected" });

      try {
        console.log(`[connections] Syncing ACLs and Keys from ${connection.name}...`);
        await refreshAclsFromBind();
        await refreshKeysFromBind();
      } catch (error: any) {
        console.log(`[connections] Failed to sync ACLs/Keys from ${connection.name}: ${error.message}`);
      }

      await storage.insertLog({
        level: "INFO",
        source: "connections",
        message: `Connection '${connection.name}' activated - SSH mode enabled (${connection.host}:${connection.port})`,
      });

      res.json({
        ...activated,
        password: "***",
        privateKey: activated.privateKey ? "***" : "",
        message: `Connected to ${connection.host}`,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/connections/deactivate", requireAdmin, async (_req: Request, res: Response) => {
    try {
      sshManager.setActive(null);
      bind9Service.configure({ mode: "local" });
      await storage.deactivateAllConnections();

      await storage.insertLog({
        level: "INFO",
        source: "connections",
        message: "All connections deactivated - switched to local mode",
      });

      res.json({ message: "Switched to local mode" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/connections/pool/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const connectedIds = sshManager.getConnectedIds();
      const activeId = sshManager.getActiveId();
      const allConnections = await storage.getConnections();
      const poolStatus = allConnections.map((connection) => ({
        id: connection.id,
        name: connection.name,
        host: connection.host,
        isActive: connection.id === activeId,
        isConnected: connectedIds.includes(connection.id),
        lastStatus: connection.lastStatus,
      }));

      res.json({ activeId, connections: poolStatus });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });
}
