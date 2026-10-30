// Copyright (c) 2025 Stephane ASSOGBA
/**
 * Host System & BIND9 Lifecycle Routes
 * Endpoints for detecting host BIND9 state, running automated package installation,
 * executing guided initialization (wizard), controlling systemd service, and running DNS queries.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { hostBindManager } from "./host-bind-manager";
import { bind9Service } from "./bind9-service";
import { storage } from "./storage";
import { z } from "zod";

type RegisterHostRoutesOptions = {
  app: Express;
  requireViewer: RequestHandler;
  requireOperator: RequestHandler;
  requireAdmin: RequestHandler;
  safeError: (status: number, message: string) => string;
};

const setupInitSchema = z.object({
  profile: z.enum(["authoritative", "resolver", "hybrid"]),
  forwarders: z.array(z.string().trim().regex(/^[0-9a-zA-Z.:_-]+$/, "Invalid forwarder IP or hostname")).optional(),
  forwardOnly: z.boolean().optional(),
  listenV4: z.string().max(200).regex(/^[a-zA-Z0-9.\/_\s;{}:-]+$/, "Invalid listenV4 format").optional(),
  listenV6: z.string().max(200).regex(/^[a-zA-Z0-9.\/_\s;{}:-]+$/, "Invalid listenV6 format").optional(),
  allowQuery: z.string().max(500).regex(/^[a-zA-Z0-9.\/_\s;{}:-]+$/, "Invalid allowQuery format").optional(),
  allowRecursion: z.string().max(500).regex(/^[a-zA-Z0-9.\/_\s;{}:-]+$/, "Invalid allowRecursion format").optional(),
  dnssecValidation: z.boolean().optional(),
});

const serviceControlSchema = z.object({
  action: z.enum(["start", "stop", "restart", "reload"]),
});

const dnsTestSchema = z.object({
  domain: z.string().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/, "Invalid domain name format"),
  type: z.string().max(10).regex(/^[a-zA-Z0-9]+$/, "Invalid record type format").default("A"),
  server: z.string().max(64).regex(/^[0-9a-zA-Z.:_-]+$/, "Invalid server address").default("127.0.0.1"),
});

export function registerHostRoutes({
  app,
  requireViewer,
  requireOperator,
  requireAdmin,
  safeError,
}: RegisterHostRoutesOptions) {

  // 1. Host and BIND9 Detection
  app.get("/api/host/bind-detection", requireViewer, async (_req: Request, res: Response) => {
    try {
      const detection = await hostBindManager.detect();
      res.json(detection);
    } catch (error: any) {
      console.error("[host-routes] detection failed", error);
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // 2. Trigger BIND9 Package Installation
  app.post("/api/host/bind-install", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await hostBindManager.installBind9();
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }

      await storage.insertLog({
        level: "INFO",
        source: "host-installer",
        message: "Automated BIND9 package installation started on host system",
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // 3. Get BIND9 Installation Progress & Logs
  app.get("/api/host/bind-install-status", requireViewer, async (_req: Request, res: Response) => {
    try {
      const progress = hostBindManager.getInstallProgress();
      res.json(progress);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // 4. Guided BIND9 Initialization (Setup Wizard)
  app.post("/api/host/bind-init", requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = setupInitSchema.parse(req.body);
      const result = await hostBindManager.initializeBind9(parsed);

      // Reconfigure bind9Service availability
      bind9Service.configure({ mode: "local" });

      await storage.insertLog({
        level: result.success ? "INFO" : "WARN",
        source: "host-init",
        message: `BIND9 initialized with profile '${parsed.profile}' (success=${result.success})`,
      });

      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid configuration options", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // 5. Systemd Service Control
  app.post("/api/host/service-control", requireOperator, async (req: Request, res: Response) => {
    try {
      const { action } = serviceControlSchema.parse(req.body);
      const result = await hostBindManager.controlService(action);

      // Reset cache in bind9Service so UI status updates immediately
      bind9Service.configure({ mode: "local" });

      await storage.insertLog({
        level: result.success ? "INFO" : "ERROR",
        source: "systemd",
        message: `System service action '${action}' executed (success=${result.success})`,
      });

      if (!result.success) {
        return res.status(500).json(result);
      }
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid service action", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  // 6. Local DNS Test Query Tool
  app.post("/api/host/dns-test", requireViewer, async (req: Request, res: Response) => {
    try {
      const { domain, type, server } = dnsTestSchema.parse(req.body);
      const result = await hostBindManager.testDnsQuery(domain, type, server);
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid query parameters", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });
}
