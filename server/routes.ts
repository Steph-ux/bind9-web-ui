// Copyright © 2025 Stephane ASSOGBA
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import os from "os";
import path from "path";
import { createHash, randomBytes } from "crypto";
import { storage } from "./storage";
import { bind9Service } from "./bind9-service";
import { sshManager } from "./ssh-manager";
import { firewallService } from "./firewall-service";
import { replicationService } from "./replication-service";
import { healthService } from "./health-service";
import { dnssecService } from "./dnssec-service";
import { backupService } from "./backup-service";
import { insertZoneSchema, insertDnsRecordSchema, insertAclSchema, insertTsigKeySchema, insertConnectionSchema, insertRpzEntrySchema } from "@shared/schema";
import { z } from "zod";

import { hashPassword } from "./auth";
import { insertUserSchema } from "@shared/schema";

// Async mutex to prevent concurrent BIND9 zone writes (race condition)
let rpzSyncLock = Promise.resolve();
function syncRpzZone(): void {
  const prev = rpzSyncLock;
  let release: () => void;
  rpzSyncLock = new Promise<void>(r => { release = r; });
  prev.then(async () => {
    try {
      const zoneData = await storage.getRpzZoneData();
      await bind9Service.ensureRpzConfigured();
      await bind9Service.writeRpzZone("rpz.intra", zoneData);
      await bind9Service.reload();
    } catch (syncErr: any) {
      console.error(`[rpz] Background BIND9 sync failed: ${syncErr.message}`);
    } finally {
      release!();
    }
  });
}

/** Sanitize error messages — in production, hide internal details for 500 errors */
function safeError(status: number, message: string): string {
  if (process.env.NODE_ENV === "production" && status >= 500) {
    return "Internal Server Error";
  }
  return message;
}

/** Mask sensitive fields in notification channel config */
function maskNotificationConfig(config: Record<string, any>, type: string): Record<string, any> {
  const masked = { ...config };
  if (masked.webhookUrl) masked.webhookUrl = masked.webhookUrl.replace(/\/[^/]+$/, "/***");
  if (masked.email) masked.email = masked.email.replace(/^(.).*(@.*)$/, "$1***$2");
  return masked;
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
          // Check if the requested path matches any allowed scope
          const allowed = scope.split(",").map(s => s.trim());
          const reqPath = req.path.replace(/^\/api\//, "");
          const hasAccess = allowed.some(perm => {
            if (perm.endsWith(":read") && req.method !== "GET") return false;
            return reqPath.startsWith(perm.split(":")[0]);
          });
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

  // Protect all API routes defined below
  app.use("/api", requireAuth);

  // ── Firewall Management (Admin Only) ──────────────────────────
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
      if (typeof enable !== "boolean") return res.status(400).json({ message: "enable must be a boolean" });
      await firewallService.toggle(enable);
      res.json({ message: `Firewall ${enable ? 'enabled' : 'disabled'}` });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/firewall/rules", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { toPort, proto, action, fromIp, direction, ruleType, toPortEnd, service, interface: iface, rateLimit, icmpType, log, comment, rawRule } = req.body;
      const ALLOWED_PROTOS = ["tcp", "udp", "any"];
      const ALLOWED_ACTIONS = ["allow", "deny", "reject"];
      const ALLOWED_DIRECTIONS = ["in", "out"];
      const ALLOWED_RULE_TYPES = ["port", "service", "portRange", "multiPort", "icmp", "raw"];
      const ALLOWED_ICMP_TYPES = ["echo-request", "echo-reply", "destination-unreachable", "time-exceeded", "redirect", "router-advertisement", "router-solicitation", "parameter-problem"];

      // Validate required fields based on rule type
      const resolvedRuleType = ruleType || "port";
      if (resolvedRuleType !== "icmp" && resolvedRuleType !== "raw" && !toPort && !service) {
        return res.status(400).json({ message: "Port or service is required" });
      }
      if (proto && !ALLOWED_PROTOS.includes(proto)) return res.status(400).json({ message: `Invalid protocol. Allowed: ${ALLOWED_PROTOS.join(", ")}` });
      if (action && !ALLOWED_ACTIONS.includes(action)) return res.status(400).json({ message: `Invalid action. Allowed: ${ALLOWED_ACTIONS.join(", ")}` });
      if (direction && !ALLOWED_DIRECTIONS.includes(direction)) return res.status(400).json({ message: `Invalid direction. Allowed: ${ALLOWED_DIRECTIONS.join(", ")}` });
      if (ruleType && !ALLOWED_RULE_TYPES.includes(ruleType)) return res.status(400).json({ message: `Invalid rule type. Allowed: ${ALLOWED_RULE_TYPES.join(", ")}` });
      if (icmpType && !ALLOWED_ICMP_TYPES.includes(icmpType)) return res.status(400).json({ message: `Invalid ICMP type. Allowed: ${ALLOWED_ICMP_TYPES.join(", ")}` });
      if (rateLimit && !/^\d+\/(sec|min|hour|day)$/.test(rateLimit)) return res.status(400).json({ message: "Invalid rate limit format. Use: N/sec, N/min, N/hour, N/day" });

      await firewallService.addRule({
        toPort: toPort || "", proto: proto || "tcp", action: action || "allow", fromIp: fromIp || "any",
        direction, ruleType: resolvedRuleType, toPortEnd, service,
        interface_: iface, rateLimit, icmpType, log, comment, rawRule,
      });
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ── IP Blacklist ─────────────────────────────────────────────────
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
      // Basic IP format validation
      if (!/^[0-9a-f.:]+$/i.test(ip)) {
        return res.status(400).json({ message: "Invalid IP address format" });
      }
      const validReasons = ["login_failed", "api_abuse", "brute_force", "manual"];
      const safeReason = validReasons.includes(reason) ? reason : "manual";
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

  // ── API Tokens ─────────────────────────────────────────────────
  app.get("/api/tokens", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const tokens = await storage.getApiTokens();
      // Never return tokenHash to client
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
      // Generate token: bwm_<32 random hex chars>
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

      // Return the raw token ONLY on creation — never again
      const { tokenHash: _th, ...safe } = token;
      res.status(201).json({ ...safe, token: raw });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/tokens/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const deleted = await storage.deleteApiToken(id);
      if (!deleted) return res.status(404).json({ message: "Token not found" });
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

  // ── DNS Firewall (RPZ) ────────────────────────────────────────
  app.get("/api/rpz", requireOperator, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const search = String(req.query.search || "").trim();
      const type = String(req.query.type || "").trim();
      const result = await storage.getRpzEntriesPaged({ page, limit, search, type });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/rpz/stats", requireOperator, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getRpzStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/rpz", requireOperator, async (req: Request, res: Response) => {
    try {
      // Validate input
      const data = insertRpzEntrySchema.parse(req.body);

      // Validate domain name format (allow wildcards like *.example.com)
      const nameStr = String(data.name).trim().toLowerCase();
      if (!/^[a-z0-9*.][a-z0-9.*-]*$/.test(nameStr) || nameStr.length > 253) {
        return res.status(400).json({ message: "Invalid domain name format" });
      }
      // Normalize name to lowercase to prevent case-sensitive duplicates
      data.name = nameStr;
      // Validate target for redirect type — target is REQUIRED for redirect
      if (data.type === "redirect") {
        if (!data.target || !String(data.target).trim()) {
          return res.status(400).json({ message: "Redirect type requires a target IP or domain" });
        }
        const t = String(data.target).trim();
        const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(t);
        const isDomain = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(t);
        if (!isIp && !isDomain) {
          return res.status(400).json({ message: "Invalid redirect target: must be IP or domain" });
        }
      }
      // Sanitize comment — prevent zone file injection
      if (data.comment && /[\n\r$]/.test(String(data.comment))) {
        return res.status(400).json({ message: "Comment contains invalid characters" });
      }

      // Create in DB
      const entry = await storage.createRpzEntry(data);

      // Sync to BIND9 (background — respond first, mutex-serialized)
      res.json(entry);
      syncRpzZone();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/rpz/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const deleted = await storage.deleteRpzEntry(id);
      if (!deleted) {
        return res.status(404).json({ message: "Entry not found" });
      }

      // Sync to BIND9 (background — respond first, mutex-serialized)
      res.json({ message: "Entry deleted" });
      syncRpzZone();
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  /** Read existing RPZ zone file from BIND9 (entries not yet in DB) */
  app.get("/api/rpz/zone-file", requireOperator, async (_req: Request, res: Response) => {
    try {
      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }
      const entries = await bind9Service.readRpzZoneFile("rpz.intra");
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  /** Sync RPZ zone file entries into the database (import existing BIND9 RPZ rules) */
  app.post("/api/rpz/sync", requireAdmin, async (_req: Request, res: Response) => {
    try {
      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }
      const zoneEntries = await bind9Service.readRpzZoneFile("rpz.intra");
      const dbNames = await storage.getRpzExistingNames(zoneEntries.map(e => e.name));

      // Filter to only new, supported entries
      const newEntries = zoneEntries.filter(e =>
        !dbNames.has(e.name) && ["nxdomain", "nodata", "redirect"].includes(e.type)
      );
      const skipped = zoneEntries.length - newEntries.length;

      // Batch insert
      const entriesToInsert = newEntries.map(entry => ({
        name: entry.name,
        type: entry.type as any,
        target: entry.target || "",
        comment: entry.comment || "Synced from BIND9 zone file",
      }));
      const imported = entriesToInsert.length > 0
        ? await storage.createRpzEntriesBatch(entriesToInsert)
        : 0;

      // Respond first, then sync BIND9 in background
      res.json({ message: `Synced ${imported} entries, ${skipped} skipped`, imported, skipped });

      // Background: re-sync zone file from DB (mutex-serialized)
      syncRpzZone();

      await storage.insertLog({
        level: "INFO",
        source: "rpz",
        message: `RPZ sync: ${imported} imported, ${skipped} skipped from zone file`,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  /** Import RPZ blocklist from text content (zone file or plain domain list) */
  app.post("/api/rpz/import", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { content, sourceName } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "content is required and must be a string" });
      }
      if (content.length > 200 * 1024 * 1024) { // 200MB limit
        return res.status(400).json({ message: "File too large (max 200MB)" });
      }
      const safeSource = String(sourceName || "import").replace(/[\n\r$]/g, "").slice(0, 100);

      const parsed = await bind9Service.parseRpzBlocklist(content, safeSource);
      if (parsed.length === 0) {
        return res.status(400).json({ message: "No valid RPZ entries found in the provided content" });
      }
      if (parsed.length > 1000000) {
        return res.status(400).json({ message: `Too many entries (${parsed.length}), maximum 1000000 per import` });
      }

      // Filter out duplicates against existing DB entries (only fetch names, not full rows)
      const dbNames = await storage.getRpzExistingNames(parsed.map(e => e.name));
      const newEntries = parsed.filter(e => !dbNames.has(e.name));
      const duplicates = parsed.length - newEntries.length;

      // Batch insert new entries
      const entriesToInsert = newEntries.map(entry => ({
        name: entry.name,
        type: entry.type as any,
        target: entry.target || "",
        comment: entry.comment || `Imported from ${safeSource}`,
      }));
      const imported = entriesToInsert.length > 0
        ? await storage.createRpzEntriesBatch(entriesToInsert)
        : 0;

      // Sync to BIND9 (non-blocking — respond first, sync in background)
      res.json({
        message: `Imported ${imported} entries, ${duplicates} duplicates skipped`,
        total: parsed.length,
        imported,
        duplicates,
      });

      // Background sync to BIND9 zone file (mutex-serialized)
      syncRpzZone();

      await storage.insertLog({
        level: "INFO",
        source: "rpz",
        message: `RPZ import from '${safeSource}': ${imported} added, ${duplicates} duplicates skipped, ${parsed.length} total parsed`,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  /** Import RPZ blocklist from a URL */
  app.post("/api/rpz/import-url", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { url, sourceName } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ message: "url is required" });
      }
      // Validate URL — only allow http/https
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ message: "Invalid URL format" });
      }
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return res.status(400).json({ message: "Only http/https URLs are allowed" });
      }
      // Prevent SSRF — block internal/private IPs
      const hostname = parsedUrl.hostname;
      if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|localhost|::1|fe80::|fd[0-9a-f]{2}:|fc[0-9a-f]{2}:|169\.254\.|100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.)/i.test(hostname)) {
        return res.status(400).json({ message: "Private/internal URLs are not allowed" });
      }

      const safeSource = String(sourceName || parsedUrl.hostname).replace(/[\n\r$]/g, "").slice(0, 100);

      // Fetch the blocklist
      const response = await fetch(url, {
        signal: AbortSignal.timeout(120000), // 120s timeout for large blocklists
        headers: { "User-Agent": "BIND9-Admin-Panel/RPZ-Import" },
      });
      if (!response.ok) {
        return res.status(400).json({ message: `Failed to fetch URL: HTTP ${response.status}` });
      }
      const content = await response.text();
      if (content.length > 200 * 1024 * 1024) {
        return res.status(400).json({ message: "File too large (max 200MB)" });
      }

      const parsed = await bind9Service.parseRpzBlocklist(content, safeSource);
      if (parsed.length === 0) {
        return res.status(400).json({ message: "No valid RPZ entries found in the fetched content" });
      }
      if (parsed.length > 1000000) {
        return res.status(400).json({ message: `Too many entries (${parsed.length}), maximum 1000000 per import` });
      }

      // Filter out duplicates against existing DB entries (only fetch names, not full rows)
      const dbNames = await storage.getRpzExistingNames(parsed.map(e => e.name));
      const newEntries = parsed.filter(e => !dbNames.has(e.name));
      const duplicates = parsed.length - newEntries.length;

      // Batch insert new entries
      const entriesToInsert = newEntries.map(entry => ({
        name: entry.name,
        type: entry.type as any,
        target: entry.target || "",
        comment: entry.comment || `Imported from ${safeSource}`,
      }));
      const imported = entriesToInsert.length > 0
        ? await storage.createRpzEntriesBatch(entriesToInsert)
        : 0;

      // Respond first, then sync to BIND9 in background
      res.json({
        message: `Imported ${imported} entries, ${duplicates} duplicates skipped`,
        total: parsed.length,
        imported,
        duplicates,
      });

      // Background sync to BIND9 zone file (mutex-serialized)
      syncRpzZone();

      await storage.insertLog({
        level: "INFO",
        source: "rpz",
        message: `RPZ import from URL '${safeSource}': ${imported} added, ${duplicates} duplicates skipped, ${parsed.length} total parsed`,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  /** Clear all RPZ entries */
  app.delete("/api/rpz", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getRpzStats();
      const count = stats.total;
      await storage.clearRpzEntries();

      // Respond first, then sync BIND9 empty zone in background (mutex-serialized)
      res.json({ message: `All ${count} RPZ entries cleared` });

      const prev = rpzSyncLock;
      let release: () => void;
      rpzSyncLock = new Promise<void>(r => { release = r; });
      prev.then(async () => {
        try {
          await bind9Service.ensureRpzConfigured();
          await bind9Service.writeRpzZone("rpz.intra", []);
          await bind9Service.reload();
        } catch (syncErr: any) {
          console.error(`[rpz] Background BIND9 sync failed: ${syncErr.message}`);
        } finally {
          release!();
        }
      });

      await storage.insertLog({
        level: "WARN",
        source: "rpz",
        message: `All RPZ entries cleared (${count} removed)`,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/users/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { password, role, username, mustChangePassword, newPassword } = req.body;

      const ALLOWED_ROLES = ["admin", "operator", "viewer"];
      const updateData: any = {};
      if (role) {
        if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ message: `Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}` });
        updateData.role = role;
      }
      if (newPassword) {
        if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
          return res.status(400).json({ message: "New password must be at least 8 characters" });
        }
        updateData.password = await hashPassword(newPassword);
        updateData.mustChangePassword = false;
      }
      if (username !== undefined) {
        if (typeof username !== 'string' || username.trim().length < 2) return res.status(400).json({ message: "Username must be at least 2 characters" });
        if (!/^[a-zA-Z0-9._-]+$/.test(username)) return res.status(400).json({ message: "Username contains invalid characters" });
        updateData.username = username.trim();
      }
      if (mustChangePassword !== undefined) updateData.mustChangePassword = !!mustChangePassword;

      const updated = await storage.updateUser(id, updateData);
      // exclude password
      const { password: _, ...safe } = updated;
      res.json(safe);
    } catch (e: any) {
      res.status(500).json({ message: safeError(500, e.message) });
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
      res.status(500).json({ message: safeError(500, e.message) });
    }
  });

  // ── Domain Jailing (User-Domain assignments) ────────────────────
  app.get("/api/users/:id/domains", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = String(req.params.id);
      const assignments = await storage.getUserDomains(userId);
      res.json(assignments);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/users/:id/domains", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = String(req.params.id);
      const { zoneIds } = req.body;
      if (!Array.isArray(zoneIds)) {
        return res.status(400).json({ message: "zoneIds must be an array" });
      }
      await storage.setUserDomains(userId, zoneIds);
      await storage.insertLog({
        level: "INFO",
        source: "users",
        message: `Domain assignments updated for user ${userId} (${zoneIds.length} zones)`,
      });
      res.json({ message: "Domain assignments updated" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ── Replication Servers ────────────────────────────────────────
  app.get("/api/replication/stats", requireOperator, async (_req: Request, res: Response) => {
    try {
      const servers = await storage.getReplicationServers();
      const conflicts = await storage.getReplicationConflicts(false);
      const zones = await storage.getZones();
      const masterZones = zones.filter(z => z.type === "master" && z.status === "active");

      const enabled = servers.filter(s => s.enabled);
      const connected = servers.filter(s => s.lastSyncStatus === "success");
      const failed = servers.filter(s => s.lastSyncStatus === "failed");
      const neverSynced = servers.filter(s => s.lastSyncStatus === "never");

      res.json({
        totalServers: servers.length,
        enabledServers: enabled.length,
        connectedServers: connected.length,
        failedServers: failed.length,
        neverSyncedServers: neverSynced.length,
        totalZones: masterZones.length,
        unresolvedConflicts: conflicts.length,
        serialMismatches: conflicts.filter(c => c.conflictType === "serial_mismatch").length,
        zoneMissing: conflicts.filter(c => c.conflictType === "zone_missing").length,
        lastSyncAt: servers.reduce((latest: string | null, s) => {
          if (!s.lastSyncAt) return latest;
          if (!latest || s.lastSyncAt > latest) return s.lastSyncAt;
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
      // Mask credentials
      res.json(servers.map(s => ({
        ...s,
        password: s.password ? "***" : "",
        privateKey: s.privateKey ? "***" : "",
      })));
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/replication", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, host, port, username, authType, password, privateKey, bind9ConfDir, bind9ZoneDir, role, enabled } = req.body;
      if (!name || !host) return res.status(400).json({ message: "name and host are required" });
      const safeHost = String(host).trim();
      if (!/^[a-zA-Z0-9.:-]+$/.test(safeHost)) return res.status(400).json({ message: "Invalid host format" });
      const safePort = parseInt(port, 10) || 22;
      if (safePort < 1 || safePort > 65535) return res.status(400).json({ message: "Invalid port" });

      const server = await storage.createReplicationServer({
        name: String(name),
        host: safeHost,
        port: safePort,
        username: String(username || "root"),
        authType: authType === "key" ? "key" : "password",
        password: password ? String(password) : "",
        privateKey: privateKey ? String(privateKey) : "",
        bind9ConfDir: bind9ConfDir || "/etc/bind",
        bind9ZoneDir: bind9ZoneDir || "/var/lib/bind",
        role: role === "secondary" ? "secondary" : "slave",
        enabled: enabled !== false,
      });

      await storage.insertLog({
        level: "INFO",
        source: "replication",
        message: `Replication server '${name}' added (${safeHost}:${safePort})`,
      });

      res.status(201).json({
        ...server,
        password: server.password ? "***" : "",
        privateKey: server.privateKey ? "***" : "",
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/replication/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const existing = await storage.getReplicationServer(id);
      if (!existing) return res.status(404).json({ message: "Server not found" });

      const allowed: Record<string, any> = {};
      const { name, host, port, username, authType, password, privateKey, bind9ConfDir, bind9ZoneDir, role, enabled } = req.body;
      if (name !== undefined) allowed.name = String(name);
      if (host !== undefined) {
        const safeHost = String(host).trim();
        if (!/^[a-zA-Z0-9.:-]+$/.test(safeHost)) return res.status(400).json({ message: "Invalid host format" });
        allowed.host = safeHost;
      }
      if (port !== undefined) {
        const safePort = parseInt(port, 10) || 22;
        if (safePort < 1 || safePort > 65535) return res.status(400).json({ message: "Invalid port" });
        allowed.port = safePort;
      }
      if (username !== undefined) allowed.username = String(username);
      if (authType !== undefined) allowed.authType = authType === "key" ? "key" : "password";
      if (password !== undefined && password !== "***") allowed.password = String(password);
      if (privateKey !== undefined && privateKey !== "***") allowed.privateKey = String(privateKey);
      if (bind9ConfDir !== undefined) allowed.bind9ConfDir = String(bind9ConfDir);
      if (bind9ZoneDir !== undefined) allowed.bind9ZoneDir = String(bind9ZoneDir);
      if (role !== undefined) allowed.role = role === "secondary" ? "secondary" : "slave";
      if (enabled !== undefined) allowed.enabled = !!enabled;

      const updated = await storage.updateReplicationServer(id, allowed);
      res.json({
        ...updated,
        password: updated.password ? "***" : "",
        privateKey: updated.privateKey ? "***" : "",
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/replication/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const deleted = await storage.deleteReplicationServer(id);
      if (!deleted) return res.status(404).json({ message: "Server not found" });
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

  /** Test SSH connectivity to a replication server */
  app.post("/api/replication/:id/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const server = await storage.getReplicationServer(id);
      if (!server) return res.status(404).json({ message: "Server not found" });

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



  // ── Replication Sync & Notify ──────────────────────────────────
  app.post("/api/replication/sync", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await replicationService.syncAll();
      await storage.insertLog({
        level: "INFO",
        source: "replication",
        message: `Full sync completed: ${result.results.filter(r => r.success).length}/${result.results.length} servers OK (${result.totalZones} zones, ${result.duration}ms)`,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/replication/sync/:zoneId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const zoneId = req.params.zoneId as string;
      const result = await replicationService.syncZone(zoneId);
      await storage.insertLog({
        level: "INFO",
        source: "replication",
        message: `Zone sync completed: ${result.results.filter(r => r.success).length}/${result.results.length} servers OK`,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/replication/notify/:domain", requireAdmin, async (req: Request, res: Response) => {
    try {
      const domain = req.params.domain as string;
      if (!/^[a-zA-Z0-9._-]+$/.test(domain)) return res.status(400).json({ message: "Invalid domain" });
      await replicationService.notifyZone(domain);
      res.json({ message: `Notify sent for ${domain}` });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ── Replication Conflicts ─────────────────────────────────────
  app.get("/api/replication/conflicts", requireOperator, async (req: Request, res: Response) => {
    try {
      const resolved = req.query.resolved === "true" ? true : req.query.resolved === "false" ? false : undefined;
      const conflicts = await storage.getReplicationConflicts(resolved);
      // Enrich with server name
      const servers = await storage.getReplicationServers();
      const serverMap = new Map(servers.map(s => [s.id, s.name]));
      res.json(conflicts.map(c => ({ ...c, serverName: serverMap.get(c.serverId) || "Unknown" })));
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
      await storage.resolveReplicationConflict(req.params.id as string);
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

  // ── Replication Zone Bindings ─────────────────────────────────
  app.get("/api/replication/:serverId/bindings", requireOperator, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId as string;
      const bindings = await storage.getReplicationZoneBindings(serverId);
      // Enrich with zone domain
      const zones = await storage.getZones();
      const zoneMap = new Map(zones.map(z => [z.id, z.domain]));
      res.json(bindings.map(b => ({ ...b, zoneDomain: zoneMap.get(b.zoneId) || "unknown" })));
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/replication/:serverId/bindings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId as string;
      const { bindings } = req.body;
      if (!Array.isArray(bindings)) return res.status(400).json({ message: "bindings must be an array" });
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

  // ── Health Checks ──────────────────────────────────────────────
  app.get("/api/health-checks", requireOperator, async (req: Request, res: Response) => {
    try {
      const serverId = req.query.serverId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
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

  // ── Notification Channels ──────────────────────────────────────
  app.get("/api/notification-channels", requireOperator, async (_req: Request, res: Response) => {
    try {
      const channels = await storage.getNotificationChannels();
      // Mask sensitive config
      res.json(channels.map(c => {
        try {
          const config = JSON.parse(c.config);
          return { ...c, config: JSON.stringify(maskNotificationConfig(config, c.type)) };
        } catch { return c; }
      }));
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/notification-channels", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, type, config, enabled, events } = req.body;
      if (!name || !type || !config) return res.status(400).json({ message: "name, type, config required" });
      const validTypes = ["email", "webhook", "slack"];
      if (!validTypes.includes(type)) return res.status(400).json({ message: "type must be email, webhook, or slack" });
      // Validate config is valid JSON
      try {
        const parsed = typeof config === "string" ? JSON.parse(config) : config;
        if (type === "webhook" && !parsed.url) return res.status(400).json({ message: "webhook config requires a url" });
        if (type === "slack" && !parsed.webhookUrl) return res.status(400).json({ message: "slack config requires a webhookUrl" });
        if (type === "email" && !parsed.email) return res.status(400).json({ message: "email config requires an email address" });
        // SSRF: block private/internal URLs
        const urlToCheck = parsed.url || parsed.webhookUrl;
        if (urlToCheck) {
          try {
            const u = new URL(urlToCheck);
            if (!["http:", "https:"].includes(u.protocol)) return res.status(400).json({ message: "Only http/https URLs allowed" });
            if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|localhost|::1|fe80::|fd[0-9a-f]{2}:|fc[0-9a-f]{2}:|169\.254\.)/i.test(u.hostname)) {
              return res.status(400).json({ message: "Private/internal URLs are not allowed" });
            }
          } catch { return res.status(400).json({ message: "Invalid URL format" }); }
        }
      } catch {
        return res.status(400).json({ message: "config must be valid JSON" });
      }
      const channel = await storage.createNotificationChannel({
        name, type, config: typeof config === "string" ? config : JSON.stringify(config),
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
      const id = req.params.id as string;
      const updates: Record<string, any> = {};
      if (req.body.name !== undefined) updates.name = String(req.body.name);
      if (req.body.type !== undefined) {
        const validTypes = ["email", "webhook", "slack"];
        if (!validTypes.includes(req.body.type)) return res.status(400).json({ message: "type must be email, webhook, or slack" });
        updates.type = String(req.body.type);
      }
      if (req.body.config !== undefined) {
        const configVal = req.body.config;
        try {
          const parsed = typeof configVal === "string" ? JSON.parse(configVal) : configVal;
          // Determine the effective type (updated or existing)
          const effectiveType = updates.type || (await storage.getNotificationChannel(id))?.type;
          if (effectiveType === "webhook" && !parsed.url) return res.status(400).json({ message: "webhook config requires a url" });
          if (effectiveType === "slack" && !parsed.webhookUrl) return res.status(400).json({ message: "slack config requires a webhookUrl" });
          if (effectiveType === "email" && !parsed.email) return res.status(400).json({ message: "email config requires an email address" });
          // SSRF: block private/internal URLs
          const urlToCheck = parsed.url || parsed.webhookUrl;
          if (urlToCheck) {
            try {
              const u = new URL(urlToCheck);
              if (!["http:", "https:"].includes(u.protocol)) return res.status(400).json({ message: "Only http/https URLs allowed" });
              if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|localhost|::1|fe80::|fd[0-9a-f]{2}:|fc[0-9a-f]{2}:|169\.254\.)/i.test(u.hostname)) {
                return res.status(400).json({ message: "Private/internal URLs are not allowed" });
              }
            } catch { return res.status(400).json({ message: "Invalid URL format" }); }
          }
          updates.config = typeof configVal === "string" ? configVal : JSON.stringify(configVal);
        } catch {
          return res.status(400).json({ message: "config must be valid JSON" });
        }
      }
      if (req.body.enabled !== undefined) updates.enabled = Boolean(req.body.enabled);
      if (req.body.events !== undefined) updates.events = String(req.body.events);
      const channel = await storage.updateNotificationChannel(id, updates);
      res.json(channel);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/notification-channels/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const deleted = await storage.deleteNotificationChannel(id);
      if (!deleted) return res.status(404).json({ message: "Channel not found" });
      res.json({ message: "Channel deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ── Sync History & Metrics ─────────────────────────────────────
  app.get("/api/sync-history", requireOperator, async (req: Request, res: Response) => {
    try {
      const serverId = req.query.serverId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
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

  // ── DNSSEC ─────────────────────────────────────────────────────
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
      if (!zoneId || !keyType) return res.status(400).json({ message: "zoneId and keyType required" });
      if (keyType !== "KSK" && keyType !== "ZSK") return res.status(400).json({ message: "keyType must be KSK or ZSK" });
      const result = await dnssecService.generateKey(zoneId, keyType, algorithm, keySize);
      if (!result.success) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/dnssec/sign-zone/:zoneId", requireOperator, async (req: Request, res: Response) => {
    try {
      const zoneId = req.params.zoneId as string;
      const result = await dnssecService.signZone(zoneId);
      if (!result.success) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/dnssec/status/:zoneId", requireOperator, async (req: Request, res: Response) => {
    try {
      const zoneId = req.params.zoneId as string;
      const status = await dnssecService.getSigningStatus(zoneId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/dnssec/retire-key/:keyId", requireOperator, async (req: Request, res: Response) => {
    try {
      const keyId = req.params.keyId as string;
      const result = await dnssecService.retireKey(keyId);
      if (!result.success) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/dnssec/keys/:keyId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const keyId = req.params.keyId as string;
      const result = await dnssecService.deleteKey(keyId);
      if (!result.success) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ── Backups ───────────────────────────────────────────────────
  app.get("/api/backups", requireOperator, async (req: Request, res: Response) => {
    try {
      const type = req.query.type as string | undefined;
      const list = await storage.getBackups(type);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/backups", requireOperator, async (req: Request, res: Response) => {
    try {
      const { type, scope, zoneId } = req.body;
      if (!type || !scope) return res.status(400).json({ message: "type and scope required" });
      if (!["auto", "manual", "snapshot"].includes(type)) return res.status(400).json({ message: "invalid type" });
      if (!["full", "zones", "configs", "single_zone"].includes(scope)) return res.status(400).json({ message: "invalid scope" });
      if (scope === "single_zone" && !zoneId) return res.status(400).json({ message: "zoneId required for single_zone scope" });
      const backup = await backupService.createBackup(type, scope, zoneId);
      res.json(backup);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/backups/:id/restore", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const result = await backupService.restore(id);
      if (!result.success) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/backups/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const result = await backupService.deleteBackup(id);
      if (!result.success) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });


  // ── Restore SSH connections on startup ────────────────────────
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
            await storage.updateZone(found.id, { filePath: cz.filePath });
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
                // Only re-import if DB has fewer records than zone file (avoid overwriting unsynced changes)
                const nonSoaRecords = records.filter(r => r.type !== "SOA");
                if (currentRecords.length < nonSoaRecords.length) {
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

  // ══════════════════════════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════════════════════════
  app.get("/api/dashboard", requireOperator, async (_req: Request, res: Response) => {
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ZONES
  // ══════════════════════════════════════════════════════════════
  app.get("/api/zones", requireOperator, async (req: Request, res: Response) => {
    try {
      let allZones = await storage.getZones();
      // Domain jailing: viewers only see their assigned zones
      const user = req.user as any;
      if (user?.role === "viewer" && user?.id) {
        const assignments = await storage.getUserDomains(user.id);
        const allowedIds = new Set(assignments.map(a => a.zoneId));
        allZones = allZones.filter(z => allowedIds.has(z.id));
      }
      const enriched = await Promise.all(allZones.map(async (zone) => ({
        ...zone,
        records: await storage.getZoneRecordCount(zone.id),
      })));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/zones/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      // Domain jailing check
      const user = req.user as any;
      if (user?.role === "viewer" && user?.id) {
        const accessible = await storage.isZoneAccessibleByUser(id, user.id, user.role);
        if (!accessible) return res.status(403).json({ message: "You do not have access to this zone" });
      }
      const records = await storage.getRecords(zone.id);
      res.json({ ...zone, records });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/zones/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      // Only allow specific fields to be updated
      const allowed: Record<string, any> = {};
      const { domain, type, status, adminEmail, filePath, replicationEnabled } = req.body;
      const ALLOWED_ZONE_TYPES = ["master", "slave", "forward"];
      const ALLOWED_ZONE_STATUSES = ["active", "inactive"];
      if (domain !== undefined) {
        if (!/^[a-zA-Z0-9._-]+$/.test(String(domain))) return res.status(400).json({ message: "Invalid domain name" });
        allowed.domain = String(domain);
      }
      if (type !== undefined) {
        if (!ALLOWED_ZONE_TYPES.includes(String(type))) return res.status(400).json({ message: `Invalid zone type. Allowed: ${ALLOWED_ZONE_TYPES.join(", ")}` });
        allowed.type = String(type);
      }
      if (status !== undefined) {
        if (!ALLOWED_ZONE_STATUSES.includes(String(status))) return res.status(400).json({ message: `Invalid status. Allowed: ${ALLOWED_ZONE_STATUSES.join(", ")}` });
        allowed.status = String(status);
      }
      if (adminEmail !== undefined) allowed.adminEmail = String(adminEmail);
      if (filePath !== undefined) {
        if (!/^[a-zA-Z0-9.\/_-]+$/.test(String(filePath))) return res.status(400).json({ message: "Invalid file path" });
        allowed.filePath = String(filePath);
      }
      if (replicationEnabled !== undefined) allowed.replicationEnabled = Boolean(replicationEnabled);
      const updated = await storage.updateZone(id, allowed);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
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
      // Validate domain before passing to rndc to prevent command injection
      if (!/^[a-zA-Z0-9._-]+$/.test(zone.domain)) {
        console.error(`[bind9] Invalid zone domain for rndc reload: ${zone.domain}`);
        return;
      }
      await bind9Service.rndc(`reload ${zone.domain}`);
      console.log(`[bind9] Zone ${zone.domain} updated and reloaded`);

      // Auto-notify replication servers (skip if replication disabled for this zone)
      if (zone.replicationEnabled !== false) {
        try {
          const replServers = await storage.getReplicationServers();
          if (replServers.some(s => s.enabled)) {
            await replicationService.notifyZone(zone.domain);
          }
        } catch (replErr: any) {
          console.error(`[replication] Auto-notify failed for ${zone.domain}: ${replErr.message}`);
        }
      }
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

  app.get("/api/zones/:id/records", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      const records = await storage.getRecords(id);
      res.json(records);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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
      await updateReverseRecord("create", record);

      res.status(201).json(record);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
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
      const ALLOWED_DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "PTR", "SRV", "CAA", "SOA", "TLSA", "DS", "DNSKEY"];
      if (name !== undefined) allowed.name = String(name);
      if (type !== undefined) {
        if (!ALLOWED_DNS_TYPES.includes(String(type).toUpperCase())) return res.status(400).json({ message: `Invalid record type. Allowed: ${ALLOWED_DNS_TYPES.join(", ")}` });
        allowed.type = String(type).toUpperCase();
      }
      if (value !== undefined) allowed.value = String(value);
      if (ttl !== undefined) allowed.ttl = parseInt(ttl, 10) || 3600;
      if (priority !== undefined) allowed.priority = parseInt(priority, 10) || null;
      const updated = await storage.updateRecord(id, allowed);

      // Sync changes to disk
      await syncZoneFile(record.zoneId);

      // Auto-update reverse DNS
      await updateReverseRecord("update", updated, record);

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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
      await updateReverseRecord("delete", record);

      res.json({ message: "Record deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  CONFIG
  // ══════════════════════════════════════════════════════════════
  app.get("/api/config/:section", requireOperator, async (req: Request, res: Response) => {
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ROLLBACK — Restore BIND9 files from .bak backups
  // ══════════════════════════════════════════════════════════════
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
        return res.status(400).json({ message: "Unknown file — rollback not allowed" });
      }
      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }
      const BIND9_CONF_DIR = process.env.BIND9_CONF_DIR || "/etc/bind";
      const BIND9_ZONE_DIR = process.env.BIND9_ZONE_DIR || "/var/lib/bind";
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
        // File restored but reload failed — still report success with warning
        await storage.insertLog({ level: "WARN", source: "rollback", message: `Restored ${file} from backup but reload failed: ${reloadErr.message}` });
        return res.json({ message: `Restored ${file} from backup but BIND9 reload failed`, warning: reloadErr.message });
      }
      await storage.insertLog({ level: "INFO", source: "rollback", message: `Restored ${file} from .bak backup and reloaded BIND9` });
      res.json({ message: `Restored ${file} from backup and reloaded BIND9` });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ACLs
  // ══════════════════════════════════════════════════════════════
  app.get("/api/acls", requireOperator, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getAcls());
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });


  // ══════════════════════════════════════════════════════════════
  //  TSIG KEYS
  // ══════════════════════════════════════════════════════════════
  app.get("/api/keys", requireOperator, async (_req: Request, res: Response) => {
    try {
      const keys = await storage.getKeys();
      // Hide secrets
      const safeKeys = keys.map(k => ({
        ...k,
        secret: k.secret.slice(0, 5) + "...[hidden]"
      }));
      res.json(safeKeys);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  LOGS
  // ══════════════════════════════════════════════════════════════
  app.get("/api/logs", requireOperator, async (req: Request, res: Response) => {
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  /** Get only real BIND9 daemon logs */
  app.get("/api/logs/bind9", requireOperator, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string) || 200, 1000) : 200;
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

  // ══════════════════════════════════════════════════════════════
  //  SERVER STATUS
  // ══════════════════════════════════════════════════════════════
  app.get("/api/status", requireOperator, async (_req: Request, res: Response) => {
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  RNDC COMMANDS
  // ══════════════════════════════════════════════════════════════
  app.post("/api/rndc/:command", requireOperator, async (req: Request, res: Response) => {
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  SSH CONNECTIONS
  // ══════════════════════════════════════════════════════════════
  app.get("/api/connections", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const conns = await storage.getConnections();
      // Mask passwords in response
      res.json(conns.map(c => ({
        ...c,
        password: c.password ? "***" : "",
        privateKey: c.privateKey ? "***" : "",
      })));
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
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
      if (host !== undefined) {
        const safeHost = String(host).trim();
        if (!/^[a-zA-Z0-9.:-]+$/.test(safeHost)) return res.status(400).json({ message: "Invalid host format" });
        allowed.host = safeHost;
      }
      if (port !== undefined) {
        const safePort = parseInt(port, 10) || 22;
        if (safePort < 1 || safePort > 65535) return res.status(400).json({ message: "Invalid port number" });
        allowed.port = safePort;
      }
      if (username !== undefined) allowed.username = String(username);
      if (authType !== undefined) {
        const safeAuthType = String(authType);
        if (safeAuthType !== "password" && safeAuthType !== "key") return res.status(400).json({ message: "Invalid authType. Allowed: password, key" });
        allowed.authType = safeAuthType;
      }
      if (bind9ConfDir !== undefined) {
        if (!/^[a-zA-Z0-9.\/_-]+$/.test(String(bind9ConfDir))) return res.status(400).json({ message: "Invalid confDir path" });
        allowed.bind9ConfDir = String(bind9ConfDir);
      }
      if (bind9ZoneDir !== undefined) {
        if (!/^[a-zA-Z0-9.\/_-]+$/.test(String(bind9ZoneDir))) return res.status(400).json({ message: "Invalid zoneDir path" });
        allowed.bind9ZoneDir = String(bind9ZoneDir);
      }
      if (rndcBin !== undefined) {
        if (!/^[a-zA-Z0-9.\/_-]+$/.test(String(rndcBin))) return res.status(400).json({ message: "Invalid rndcBin path" });
        allowed.rndcBin = String(rndcBin);
      }
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/connections/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const conn = await storage.getConnection(id);
      if (!conn) return res.status(404).json({ message: "Connection not found" });

      if (conn.isActive) {
        bind9Service.configure({ mode: "local" });
      }
      sshManager.unregister(id);

      await storage.deleteConnection(id);

      await storage.insertLog({
        level: "WARN",
        source: "connections",
        message: `Connection '${conn.name}' deleted`,
      });

      res.json({ message: "Connection deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  /** Activate a connection — switches bind9-service to SSH mode */
  app.put("/api/connections/:id/activate", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const conn = await storage.getConnection(id);
      if (!conn) return res.status(404).json({ message: "Connection not found" });

      // Register in pool and connect
      sshManager.register(id, {
        host: conn.host,
        port: conn.port,
        username: conn.username,
        authType: conn.authType as "password" | "key",
        password: conn.password || undefined,
        privateKey: conn.privateKey || undefined,
      });

      try {
        await sshManager.connectById(id);
      } catch (e: any) {
        sshManager.unregister(id);
        await storage.updateConnection(id, { lastStatus: "failed" });
        return res.status(502).json({ message: safeError(502, `SSH connection failed: ${e.message}`) });
      }

      // Set as the active connection for bind9-service
      sshManager.setActive(id);

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

      // Sync ACLs and Keys from the newly activated connection
      try {
        console.log(`[connections] Syncing ACLs and Keys from ${conn.name}...`);
        const existingAcls = await bind9Service.syncAclsFromConfig();
        const currentDbAcls = await storage.getAcls();
        for (const fileAcl of existingAcls) {
          if (!currentDbAcls.find(a => a.name === fileAcl.name)) {
            console.log(`[connections] Importing ACL '${fileAcl.name}' from ${conn.name}`);
            await storage.createAcl({
              name: fileAcl.name,
              networks: fileAcl.networks,
              comment: `Imported from ${conn.host}`
            });
          }
        }
        const existingKeys = await bind9Service.syncKeysFromConfig();
        const currentDbKeys = await storage.getKeys();
        for (const fileKey of existingKeys) {
          if (!currentDbKeys.find(k => k.name === fileKey.name)) {
            console.log(`[connections] Importing Key '${fileKey.name}' from ${conn.name}`);
            await storage.createKey({
              name: fileKey.name,
              algorithm: fileKey.algorithm as any,
              secret: fileKey.secret
            });
          }
        }
      } catch (e: any) {
        console.log(`[connections] Failed to sync ACLs/Keys from ${conn.name}: ${e.message}`);
      }

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
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  /** Deactivate — switch back to local mode (keeps other connections alive) */
  app.put("/api/connections/deactivate", requireAdmin, async (_req: Request, res: Response) => {
    try {
      sshManager.setActive(null);
      bind9Service.configure({ mode: "local" });
      await storage.deactivateAllConnections();

      await storage.insertLog({
        level: "INFO",
        source: "connections",
        message: "All connections deactivated — switched to local mode",
      });

      res.json({ message: "Switched to local mode" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  /** Get SSH connection pool status */
  app.get("/api/connections/pool/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const connectedIds = sshManager.getConnectedIds();
      const activeId = sshManager.getActiveId();
      const allConns = await storage.getConnections();
      const poolStatus = allConns.map(c => ({
        id: c.id,
        name: c.name,
        host: c.host,
        isActive: c.id === activeId,
        isConnected: connectedIds.includes(c.id),
        lastStatus: c.lastStatus,
      }));
      res.json({ activeId, connections: poolStatus });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
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

  // ── Replication/Health WebSocket ────────────────────────────────
  const replWss = new WebSocketServer({
    server: httpServer,
    path: "/ws/replication",
    verifyClient: (info: { origin: string; secure: boolean; req: any }, callback: (res: boolean, code?: number, message?: string) => void) => {
      // Same auth as log WS — cookie-based
      const cookie = info.req.headers.cookie || "";
      const sessionMatch = cookie.match(/connect\.sid=([^;]+)/);
      callback(!!sessionMatch);
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

  // Start periodic health checks (every 60s)
  healthService.start(60_000);

  // Start auto-backup scheduler (every 6 hours)
  backupService.start(6 * 60 * 60 * 1000);

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
