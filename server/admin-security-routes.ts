import { createHash, randomBytes } from "crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { createFirewallRuleSchema } from "@shared/schema";

import { firewallService } from "./firewall-service";
import { storage } from "./storage";

type RegisterAdminSecurityRoutesOptions = {
  app: Express;
  requireAdmin: RequestHandler;
  requireOperator: RequestHandler;
  safeError: (status: number, message: string) => string;
};

const ALLOWED_BACKENDS = ["ufw", "firewalld", "iptables", "nftables", "none"] as const;
const VALID_BLACKLIST_REASONS = ["login_failed", "api_abuse", "brute_force", "manual"] as const;

export function registerAdminSecurityRoutes({
  app,
  requireAdmin,
  requireOperator,
  safeError,
}: RegisterAdminSecurityRoutesOptions) {
  app.get("/api/firewall/status", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const status = await firewallService.getStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/firewall/toggle", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { enable } = req.body;
      if (typeof enable !== "boolean") {
        return res.status(400).json({ message: "enable must be a boolean" });
      }
      await firewallService.toggle(enable);
      res.json({ message: `Firewall ${enable ? "enabled" : "disabled"}` });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/firewall/backend", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { backend } = req.body;
      if (!backend) {
        return res.status(400).json({ message: "Backend is required" });
      }
      if (!ALLOWED_BACKENDS.includes(backend)) {
        return res.status(400).json({ message: `Invalid backend. Allowed: ${ALLOWED_BACKENDS.join(", ")}` });
      }
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/firewall/rules", requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = createFirewallRuleSchema.parse(req.body);
      const resolvedRuleType = parsed.ruleType || "port";
      if (parsed.rateLimit && !/^\d+\/(sec|min|hour|day)$/.test(parsed.rateLimit)) {
        return res.status(400).json({ message: "Invalid rate limit format. Use: N/sec, N/min, N/hour, N/day" });
      }

      await firewallService.addRule({
        toPort: parsed.toPort || "",
        proto: parsed.proto || "tcp",
        action: parsed.action || "allow",
        fromIp: parsed.fromIp || "any",
        direction: parsed.direction,
        ruleType: resolvedRuleType,
        toPortEnd: parsed.toPortEnd,
        service: parsed.service,
        interface_: parsed.interface,
        rateLimit: parsed.rateLimit,
        icmpType: parsed.icmpType,
        log: parsed.log,
        comment: parsed.comment,
        rawRule: parsed.rawRule,
      });
      res.json({ message: "Rule added" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/firewall/rules/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id));
      await firewallService.deleteRule(id);
      res.json({ message: "Rule deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/blacklist", requireOperator, async (_req: Request, res: Response) => {
    try {
      const list = await storage.getIpBlacklist();
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/blacklist/:ip", requireAdmin, async (req: Request, res: Response) => {
    try {
      const ip = String(req.params.ip);
      await storage.unbanIp(ip);
      await storage.insertLog({
        level: "INFO",
        source: "blacklist",
        message: `IP ${ip} unbanned by admin`,
      });
      res.json({ message: `IP ${ip} unbanned` });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/blacklist", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { ip, reason, durationMs } = req.body;
      if (!ip || typeof ip !== "string") {
        return res.status(400).json({ message: "IP address is required" });
      }
      if (!/^[0-9a-f.:]+$/i.test(ip)) {
        return res.status(400).json({ message: "Invalid IP address format" });
      }
      const safeReason = VALID_BLACKLIST_REASONS.includes(reason) ? reason : "manual";
      const safeDuration = durationMs && typeof durationMs === "number" && durationMs > 0 ? durationMs : undefined;

      await storage.banIp(ip, safeReason, safeDuration);
      await storage.insertLog({
        level: "WARN",
        source: "blacklist",
        message: `IP ${ip} manually banned (reason: ${safeReason})`,
      });
      res.json({ message: `IP ${ip} banned` });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/blacklist/cleanup", requireAdmin, async (_req: Request, res: Response) => {
    try {
      await storage.cleanupExpiredBans();
      res.json({ message: "Expired bans cleaned up" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/tokens", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const tokens = await storage.getApiTokens();
      const safe = tokens.map(({ tokenHash, ...rest }) => rest);
      res.json(safe);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/tokens", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, permissions, expiresAt } = req.body;
      if (!name || typeof name !== "string" || name.length > 64) {
        return res.status(400).json({ message: "name is required (max 64 chars)" });
      }

      const perms = permissions || "*";
      const raw = `bwm_${randomBytes(16).toString("hex")}`;
      const tokenHash = createHash("sha256").update(raw).digest("hex");
      const tokenPrefix = raw.substring(0, 8);

      const token = await storage.createApiToken({
        name,
        tokenHash,
        tokenPrefix,
        permissions: perms,
        createdBy: (req.user as any)?.id || "api",
        expiresAt: expiresAt || undefined,
      });

      await storage.insertLog({
        level: "INFO",
        source: "api-tokens",
        message: `API token '${name}' created (prefix: ${tokenPrefix})`,
      });

      const { tokenHash: _tokenHash, ...safe } = token;
      res.status(201).json({ ...safe, token: raw });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/tokens/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const deleted = await storage.deleteApiToken(id);
      if (!deleted) {
        return res.status(404).json({ message: "Token not found" });
      }

      await storage.insertLog({
        level: "INFO",
        source: "api-tokens",
        message: `API token revoked (id: ${id})`,
      });
      res.json({ message: "Token revoked" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });
}
