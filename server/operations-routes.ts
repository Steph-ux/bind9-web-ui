import type { Express, Request, RequestHandler, Response } from "express";

import { backupService } from "./backup-service";
import { dnssecService } from "./dnssec-service";
import { healthService } from "./health-service";
import { storage } from "./storage";

type RegisterOperationsRoutesOptions = {
  app: Express;
  requireAdmin: RequestHandler;
  requireOperator: RequestHandler;
  safeError: (status: number, message: string) => string;
};

const VALID_NOTIFICATION_TYPES = ["email", "webhook", "slack"] as const;
const VALID_BACKUP_TYPES = ["auto", "manual", "snapshot"] as const;
const VALID_BACKUP_SCOPES = ["full", "zones", "configs", "single_zone"] as const;

function maskNotificationConfig(config: Record<string, any>) {
  const masked = { ...config };
  if (masked.webhookUrl) masked.webhookUrl = masked.webhookUrl.replace(/\/[^/]+$/, "/***");
  if (masked.url) masked.url = masked.url.replace(/\/[^/]+$/, "/***");
  if (masked.email) masked.email = masked.email.replace(/^(.).*(@.*)$/, "$1***$2");
  return masked;
}

function validateNotificationConfig(type: string, configValue: unknown) {
  let parsed: Record<string, any>;
  try {
    parsed = typeof configValue === "string" ? JSON.parse(configValue) : (configValue as Record<string, any>);
  } catch {
    return { error: "config must be valid JSON" } as const;
  }

  if (type === "webhook" && !parsed.url) {
    return { error: "webhook config requires a url" } as const;
  }
  if (type === "slack" && !parsed.webhookUrl) {
    return { error: "slack config requires a webhookUrl" } as const;
  }
  if (type === "email" && !parsed.email) {
    return { error: "email config requires an email address" } as const;
  }

  const urlToCheck = parsed.url || parsed.webhookUrl;
  if (urlToCheck) {
    try {
      const url = new URL(urlToCheck);
      if (!["http:", "https:"].includes(url.protocol)) {
        return { error: "Only http/https URLs allowed" } as const;
      }
      if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|localhost|::1|fe80::|fd[0-9a-f]{2}:|fc[0-9a-f]{2}:|169\.254\.)/i.test(url.hostname)) {
        return { error: "Private/internal URLs are not allowed" } as const;
      }
    } catch {
      return { error: "Invalid URL format" } as const;
    }
  }

  return {
    config: typeof configValue === "string" ? configValue : JSON.stringify(parsed),
  } as const;
}

export function registerOperationsRoutes({
  app,
  requireAdmin,
  requireOperator,
  safeError,
}: RegisterOperationsRoutesOptions) {
  app.get("/api/health-checks", requireOperator, async (req: Request, res: Response) => {
    try {
      const serverId = req.query.serverId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const checks = await storage.getHealthChecks(serverId, limit);
      res.json(checks);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/health-checks/run", requireOperator, async (_req: Request, res: Response) => {
    try {
      const results = await healthService.runCheck();
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/notification-channels", requireOperator, async (_req: Request, res: Response) => {
    try {
      const channels = await storage.getNotificationChannels();
      res.json(channels.map((channel) => {
        try {
          const config = JSON.parse(channel.config);
          return { ...channel, config: JSON.stringify(maskNotificationConfig(config)) };
        } catch {
          return channel;
        }
      }));
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/notification-channels", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, type, config, enabled, events } = req.body;
      if (!name || !type || !config) {
        return res.status(400).json({ message: "name, type, config required" });
      }
      if (!VALID_NOTIFICATION_TYPES.includes(type)) {
        return res.status(400).json({ message: "type must be email, webhook, or slack" });
      }

      const validation = validateNotificationConfig(type, config);
      if ("error" in validation) {
        return res.status(400).json({ message: validation.error });
      }

      const channel = await storage.createNotificationChannel({
        name,
        type,
        config: validation.config,
        enabled: enabled !== false,
        events: events || "server_down,conflict_detected,health_degraded",
      });
      res.json(channel);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/notification-channels/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const updates: Record<string, any> = {};

      if (req.body.name !== undefined) {
        updates.name = String(req.body.name);
      }
      if (req.body.type !== undefined) {
        if (!VALID_NOTIFICATION_TYPES.includes(req.body.type)) {
          return res.status(400).json({ message: "type must be email, webhook, or slack" });
        }
        updates.type = String(req.body.type);
      }
      if (req.body.config !== undefined) {
        const effectiveType = String(updates.type || (await storage.getNotificationChannel(id))?.type || "");
        if (!VALID_NOTIFICATION_TYPES.includes(effectiveType as (typeof VALID_NOTIFICATION_TYPES)[number])) {
          return res.status(400).json({ message: "type must be email, webhook, or slack" });
        }
        const validation = validateNotificationConfig(effectiveType, req.body.config);
        if ("error" in validation) {
          return res.status(400).json({ message: validation.error });
        }
        updates.config = validation.config;
      }
      if (req.body.enabled !== undefined) {
        updates.enabled = Boolean(req.body.enabled);
      }
      if (req.body.events !== undefined) {
        updates.events = String(req.body.events);
      }

      const channel = await storage.updateNotificationChannel(id, updates);
      res.json(channel);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/notification-channels/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const deleted = await storage.deleteNotificationChannel(id);
      if (!deleted) {
        return res.status(404).json({ message: "Channel not found" });
      }
      res.json({ message: "Channel deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/sync-history", requireOperator, async (req: Request, res: Response) => {
    try {
      const serverId = req.query.serverId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const history = await storage.getSyncHistory(serverId, limit);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/sync-metrics", requireOperator, async (req: Request, res: Response) => {
    try {
      const serverId = req.query.serverId as string | undefined;
      const metrics = await storage.getSyncMetrics(serverId);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/dnssec/keys", requireOperator, async (req: Request, res: Response) => {
    try {
      const zoneId = req.query.zoneId as string | undefined;
      const keys = await storage.getDnssecKeys(zoneId);
      res.json(keys);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/dnssec/generate-key", requireOperator, async (req: Request, res: Response) => {
    try {
      const { zoneId, keyType, algorithm, keySize } = req.body;
      if (!zoneId || !keyType) {
        return res.status(400).json({ message: "zoneId and keyType required" });
      }
      if (keyType !== "KSK" && keyType !== "ZSK") {
        return res.status(400).json({ message: "keyType must be KSK or ZSK" });
      }

      const result = await dnssecService.generateKey(zoneId, keyType, algorithm, keySize);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/dnssec/sign-zone/:zoneId", requireOperator, async (req: Request, res: Response) => {
    try {
      const zoneId = String(req.params.zoneId);
      const result = await dnssecService.signZone(zoneId);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/dnssec/status/:zoneId", requireOperator, async (req: Request, res: Response) => {
    try {
      const zoneId = String(req.params.zoneId);
      const status = await dnssecService.getSigningStatus(zoneId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/dnssec/retire-key/:keyId", requireOperator, async (req: Request, res: Response) => {
    try {
      const keyId = String(req.params.keyId);
      const result = await dnssecService.retireKey(keyId);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/dnssec/keys/:keyId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const keyId = String(req.params.keyId);
      const result = await dnssecService.deleteKey(keyId);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/backups", requireOperator, async (req: Request, res: Response) => {
    try {
      const type = req.query.type as string | undefined;
      const backups = await storage.getBackups(type);
      res.json(backups);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/backups", requireOperator, async (req: Request, res: Response) => {
    try {
      const { type, scope, zoneId } = req.body;
      if (!type || !scope) {
        return res.status(400).json({ message: "type and scope required" });
      }
      if (!VALID_BACKUP_TYPES.includes(type)) {
        return res.status(400).json({ message: "invalid type" });
      }
      if (!VALID_BACKUP_SCOPES.includes(scope)) {
        return res.status(400).json({ message: "invalid scope" });
      }
      if (scope === "single_zone" && !zoneId) {
        return res.status(400).json({ message: "zoneId required for single_zone scope" });
      }

      const backup = await backupService.createBackup(type, scope, zoneId);
      res.json(backup);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/backups/:id/restore", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const result = await backupService.restore(id);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/backups/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const result = await backupService.deleteBackup(id);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });
}
